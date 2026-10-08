package auth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTConfig configures JWT token validation.
type JWTConfig struct {
	TenantID        string
	ClientID        string
	Audience        string
	Issuer          string
	SymmetricSecret string
	JWKSURI         string
	KeyCacheTTL     time.Duration
	HTTPClient      *http.Client
}

// JWTIdentitySource validates incoming JWT Bearer tokens for Microsoft Entra ID or local HMAC.
type JWTIdentitySource struct {
	cfg        JWTConfig
	keysLock   sync.RWMutex
	keysCache  map[string]*rsa.PublicKey
	keysExpiry time.Time
}

// NewJWTIdentitySource creates a new JWTIdentitySource with sensible defaults.
func NewJWTIdentitySource(cfg JWTConfig) *JWTIdentitySource {
	if cfg.KeyCacheTTL == 0 {
		cfg.KeyCacheTTL = 1 * time.Hour
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if cfg.Audience == "" && cfg.ClientID != "" {
		cfg.Audience = cfg.ClientID
	}
	if cfg.JWKSURI == "" && cfg.TenantID != "" {
		cfg.JWKSURI = fmt.Sprintf("https://login.microsoftonline.com/%s/discovery/v2.0/keys", cfg.TenantID)
	}
	if cfg.Issuer == "" && cfg.TenantID != "" {
		cfg.Issuer = fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", cfg.TenantID)
	}

	return &JWTIdentitySource{
		cfg:       cfg,
		keysCache: make(map[string]*rsa.PublicKey),
	}
}

// Identify extracts caller identity from the Authorization Bearer header.
func (s *JWTIdentitySource) Identify(r *http.Request) (Identity, error) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return Identity{}, errors.New("missing Authorization header")
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
		return Identity{}, errors.New("malformed Authorization header: must be 'Bearer <token>'")
	}

	tokenStr := strings.TrimSpace(parts[1])

	claims := jwt.MapClaims{}
	var token *jwt.Token
	var err error

	if s.cfg.SymmetricSecret != "" {
		// Local / mock HMAC mode
		token, err = jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(s.cfg.SymmetricSecret), nil
		})
	} else {
		// Entra ID RSA mode (JWKS)
		token, err = jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			kid, _ := t.Header["kid"].(string)
			if kid == "" {
				return nil, errors.New("token header missing 'kid'")
			}
			return s.getKey(kid)
		})
	}

	if err != nil || !token.Valid {
		return Identity{}, fmt.Errorf("invalid token: %w", err)
	}

	// Validate audience if configured
	if s.cfg.Audience != "" {
		if !validateAudience(claims, s.cfg.Audience) {
			return Identity{}, errors.New("token audience mismatch")
		}
	}

	// Validate issuer if configured
	if s.cfg.Issuer != "" {
		iss, _ := claims["iss"].(string)
		altIssuer := ""
		if s.cfg.TenantID != "" {
			altIssuer = fmt.Sprintf("https://sts.windows.net/%s/", s.cfg.TenantID)
		}
		if iss != s.cfg.Issuer && iss != altIssuer {
			return Identity{}, fmt.Errorf("token issuer mismatch: expected %q, got %q", s.cfg.Issuer, iss)
		}
	}

	// Extract Entra ID (oid or sub)
	entraID, _ := claims["oid"].(string)
	if entraID == "" {
		entraID, _ = claims["sub"].(string)
	}
	if entraID == "" {
		return Identity{}, errors.New("token missing 'oid' or 'sub' claim")
	}

	// Extract Role
	role := extractRole(claims)
	if role != "issuer" && role != "student" {
		return Identity{}, fmt.Errorf("token role %q is not authorized (must be 'issuer' or 'student')", role)
	}

	// Extract Name
	name, _ := claims["name"].(string)
	if name == "" {
		name, _ = claims["preferred_username"].(string)
	}
	if name == "" {
		name = entraID
	}

	return Identity{
		EntraID: entraID,
		Role:    role,
		Name:    name,
	}, nil
}

func validateAudience(claims jwt.MapClaims, expected string) bool {
	switch aud := claims["aud"].(type) {
	case string:
		return aud == expected || aud == "api://" + expected || strings.TrimPrefix(expected, "api://") == aud
	case []any:
		for _, item := range aud {
			if s, ok := item.(string); ok && (s == expected || s == "api://"+expected || strings.TrimPrefix(expected, "api://") == s) {
				return true
			}
		}
	case []string:
		for _, s := range aud {
			if s == expected || s == "api://"+expected || strings.TrimPrefix(expected, "api://") == s {
				return true
			}
		}
	}
	return false
}

func extractRole(claims jwt.MapClaims) string {
	// 1. Check "roles" array (standard Microsoft Entra app roles claim)
	if rawRoles, ok := claims["roles"]; ok {
		switch r := rawRoles.(type) {
		case []any:
			for _, item := range r {
				if str, ok := item.(string); ok {
					if matched := normalizeRole(str); matched != "" {
						return matched
					}
				}
			}
		case []string:
			for _, str := range r {
				if matched := normalizeRole(str); matched != "" {
					return matched
				}
			}
		case string:
			if matched := normalizeRole(r); matched != "" {
				return matched
			}
		}
	}

	// 2. Fallback check "role" claim
	if rawRole, ok := claims["role"].(string); ok {
		if matched := normalizeRole(rawRole); matched != "" {
			return matched
		}
	}

	// 3. Fallback check "scp" scope claim
	if scp, ok := claims["scp"].(string); ok {
		for _, scope := range strings.Split(scp, " ") {
			if matched := normalizeRole(scope); matched != "" {
				return matched
			}
		}
	}

	return ""
}

func normalizeRole(val string) string {
	lower := strings.ToLower(strings.TrimSpace(val))
	switch lower {
	case "issuer", "credenviel.issuer":
		return "issuer"
	case "student", "credenviel.student":
		return "student"
	default:
		return ""
	}
}

type jwksResponse struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		Use string `json:"use"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

func (s *JWTIdentitySource) getKey(kid string) (*rsa.PublicKey, error) {
	s.keysLock.RLock()
	key, found := s.keysCache[kid]
	expired := time.Now().After(s.keysExpiry)
	s.keysLock.RUnlock()

	if found && !expired {
		return key, nil
	}

	// Fetch / refresh keys
	s.keysLock.Lock()
	defer s.keysLock.Unlock()

	// Double-check under write lock
	if key, found = s.keysCache[kid]; found && time.Now().Before(s.keysExpiry) {
		return key, nil
	}

	if s.cfg.JWKSURI == "" {
		return nil, errors.New("JWKS URI is not configured")
	}

	resp, err := s.cfg.HTTPClient.Get(s.cfg.JWKSURI)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS endpoint returned status %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to decode JWKS JSON: %w", err)
	}

	newCache := make(map[string]*rsa.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty == "RSA" && k.N != "" && k.E != "" {
			pubKey, err := parseRSAPublicKey(k.N, k.E)
			if err == nil {
				newCache[k.Kid] = pubKey
			}
		}
	}

	s.keysCache = newCache
	s.keysExpiry = time.Now().Add(s.cfg.KeyCacheTTL)

	key, found = s.keysCache[kid]
	if !found {
		return nil, fmt.Errorf("key id %q not found in JWKS", kid)
	}

	return key, nil
}

func parseRSAPublicKey(nStr, eStr string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode exponent: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := new(big.Int).SetBytes(eBytes)

	return &rsa.PublicKey{
		N: n,
		E: int(e.Int64()),
	}, nil
}
