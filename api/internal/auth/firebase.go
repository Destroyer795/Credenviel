package auth

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// FirebaseCertsURL publishes the X.509 certificates that sign Firebase ID tokens.
const FirebaseCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

const (
	maxStaleKeyAge        = 24 * time.Hour
	defaultCertTTL        = 1 * time.Hour
	certRefetchCooldown   = 1 * time.Minute
	maxFirebaseUIDLength  = 128
	firebaseClockLeeway   = 1 * time.Minute
	firebaseIssuerPrefix  = "https://securetoken.google.com/"
	errInvalidFirebaseTok = "invalid or expired Firebase ID token"
)

var maxAgeRe = regexp.MustCompile(`max-age=(\d+)`)

// FirebaseConfig configures Firebase ID token verification.
type FirebaseConfig struct {
	// ProjectID is the Firebase project ID; it must match the token's "aud" claim.
	ProjectID string
	// IssuerEmails lists verified email addresses that are granted the issuer role
	// when the token carries no explicit "role" custom claim.
	IssuerEmails []string
	// CertsURL overrides FirebaseCertsURL (used by tests).
	CertsURL   string
	HTTPClient *http.Client
	// AllowUnsigned accepts the unsigned ("alg":"none") tokens issued by the Firebase Auth
	// Emulator. It must only ever be enabled for local development; issuer, audience and
	// expiry are still enforced.
	AllowUnsigned bool
}

// FirebaseIdentitySource verifies Firebase Authentication ID tokens (RS256) sent as Bearer tokens.
type FirebaseIdentitySource struct {
	cfg          FirebaseConfig
	issuerEmails map[string]struct{}

	// mu guards the key cache. It is never held across network I/O, so verifying a token
	// whose key is cached cannot be stalled by a slow certificate download.
	mu         sync.RWMutex
	keys       map[string]*rsa.PublicKey
	keysExpiry time.Time

	// fetchMu serializes certificate downloads and guards lastRefetch.
	fetchMu     sync.Mutex
	lastRefetch time.Time
}

// NewFirebaseIdentitySource creates a verifier for the given Firebase project.
func NewFirebaseIdentitySource(cfg FirebaseConfig) *FirebaseIdentitySource {
	if cfg.CertsURL == "" {
		cfg.CertsURL = FirebaseCertsURL
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Second}
	}
	emails := make(map[string]struct{}, len(cfg.IssuerEmails))
	for _, e := range cfg.IssuerEmails {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			emails[e] = struct{}{}
		}
	}
	return &FirebaseIdentitySource{cfg: cfg, issuerEmails: emails, keys: map[string]*rsa.PublicKey{}}
}

// ParseEmailList splits a comma-separated list of email addresses.
func ParseEmailList(raw string) []string {
	var out []string
	for _, e := range strings.Split(raw, ",") {
		if e = strings.TrimSpace(e); e != "" {
			out = append(out, e)
		}
	}
	return out
}

// Identify validates the Firebase ID token in the Authorization header.
func (s *FirebaseIdentitySource) Identify(r *http.Request) (Identity, error) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return Identity{}, errors.New("missing Authorization header")
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
		return Identity{}, errors.New("malformed Authorization header: must be 'Bearer <token>'")
	}

	claims := jwt.MapClaims{}
	methods := []string{"RS256"}
	if s.cfg.AllowUnsigned {
		methods = append(methods, "none")
	}
	parser := jwt.NewParser(
		jwt.WithValidMethods(methods),
		jwt.WithIssuer(firebaseIssuerPrefix+s.cfg.ProjectID),
		jwt.WithAudience(s.cfg.ProjectID),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(firebaseClockLeeway),
	)
	token, err := parser.ParseWithClaims(strings.TrimSpace(parts[1]), claims, func(t *jwt.Token) (any, error) {
		if s.cfg.AllowUnsigned && t.Method.Alg() == "none" {
			return jwt.UnsafeAllowNoneSignatureType, nil
		}
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("token header missing kid")
		}
		return s.getKey(r.Context(), kid)
	})
	if err != nil || !token.Valid {
		return Identity{}, errors.New(errInvalidFirebaseTok)
	}

	uid, _ := claims["sub"].(string)
	if uid == "" || len(uid) > maxFirebaseUIDLength {
		return Identity{}, errors.New(errInvalidFirebaseTok)
	}
	if at, ok := claims["auth_time"].(float64); ok && time.Unix(int64(at), 0).After(time.Now().Add(firebaseClockLeeway)) {
		return Identity{}, errors.New(errInvalidFirebaseTok)
	}

	email, _ := claims["email"].(string)
	verified, _ := claims["email_verified"].(bool)

	return Identity{
		ExternalID: uid,
		Role:       s.resolveRole(claims, email, verified),
		Name:       displayName(claims, email, uid),
	}, nil
}

// resolveRole decides the application role for a verified token. An explicit
// "role" custom claim (set server-side via the Firebase Admin SDK) wins; otherwise
// verified emails on the issuer allow-list become issuers; everyone else is a student.
// Roles are never taken from client-supplied data.
func (s *FirebaseIdentitySource) resolveRole(claims jwt.MapClaims, email string, verified bool) string {
	if raw, ok := claims["role"].(string); ok {
		if role := normalizeRole(raw); role != "" {
			return role
		}
	}
	if verified && email != "" {
		if _, ok := s.issuerEmails[strings.ToLower(email)]; ok {
			return "issuer"
		}
	}
	return "student"
}

func normalizeRole(val string) string {
	switch strings.ToLower(strings.TrimSpace(val)) {
	case "issuer":
		return "issuer"
	case "student":
		return "student"
	default:
		return ""
	}
}

func displayName(claims jwt.MapClaims, email, uid string) string {
	if name, _ := claims["name"].(string); strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	if local, _, found := strings.Cut(email, "@"); found && local != "" {
		return local
	}
	return uid
}

// cachedKey returns a key from the cache. With fresh=true it only returns keys from an
// unexpired cache; otherwise it also accepts expired keys within the stale grace period.
func (s *FirebaseIdentitySource) cachedKey(kid string, fresh bool) (*rsa.PublicKey, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	key, ok := s.keys[kid]
	if !ok {
		return nil, false
	}
	now := time.Now()
	if now.Before(s.keysExpiry) {
		return key, true
	}
	if !fresh && now.Before(s.keysExpiry.Add(maxStaleKeyAge)) {
		return key, true
	}
	return nil, false
}

func (s *FirebaseIdentitySource) getKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	if key, ok := s.cachedKey(kid, true); ok {
		return key, nil
	}

	s.fetchMu.Lock()
	defer s.fetchMu.Unlock()

	// Another request may have refreshed the cache while this one waited.
	if key, ok := s.cachedKey(kid, true); ok {
		return key, nil
	}
	// Download at most once per cooldown, whether the trigger is an expired cache, key
	// rotation, a failing endpoint or a flood of tokens with bogus key IDs. Meanwhile,
	// expired-but-recent keys keep serving so a brief Google outage does not lock everyone out.
	if !s.lastRefetch.IsZero() && time.Since(s.lastRefetch) < certRefetchCooldown {
		if key, ok := s.cachedKey(kid, false); ok {
			return key, nil
		}
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	if err := s.refreshKeys(ctx); err != nil {
		if key, ok := s.cachedKey(kid, false); ok {
			return key, nil
		}
		return nil, err
	}
	if key, ok := s.cachedKey(kid, true); ok {
		return key, nil
	}
	return nil, fmt.Errorf("unknown signing key %q", kid)
}

// refreshKeys must be called with s.fetchMu held.
func (s *FirebaseIdentitySource) refreshKeys(ctx context.Context) error {
	s.lastRefetch = time.Now()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.cfg.CertsURL, nil)
	if err != nil {
		return err
	}
	resp, err := s.cfg.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch Firebase certs: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Firebase certs endpoint returned status %d", resp.StatusCode)
	}

	var certs map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&certs); err != nil {
		return fmt.Errorf("decode Firebase certs: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(certs))
	for kid, pem := range certs {
		if key, err := jwt.ParseRSAPublicKeyFromPEM([]byte(pem)); err == nil {
			keys[kid] = key
		}
	}
	if len(keys) == 0 {
		return errors.New("Firebase certs endpoint returned no usable keys")
	}

	ttl := defaultCertTTL
	if m := maxAgeRe.FindStringSubmatch(resp.Header.Get("Cache-Control")); m != nil {
		if secs, err := strconv.Atoi(m[1]); err == nil && secs > 0 {
			ttl = time.Duration(secs) * time.Second
		}
	}
	s.mu.Lock()
	s.keys = keys
	s.keysExpiry = time.Now().Add(ttl)
	s.mu.Unlock()
	return nil
}
