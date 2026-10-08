package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestJWT_HMAC_Success(t *testing.T) {
	secret := "test-secret-at-least-32-chars-long-for-hmac!!"
	source := NewJWTIdentitySource(JWTConfig{
		SymmetricSecret: secret,
		Audience:        "api://credenviel",
		Issuer:          "https://login.microsoftonline.com/mock-tenant/v2.0",
	})

	claims := jwt.MapClaims{
		"oid":   "user-oid-12345",
		"sub":   "user-sub-12345",
		"roles": []any{"Student"},
		"name":  "Alice Student",
		"aud":   "api://credenviel",
		"iss":   "https://login.microsoftonline.com/mock-tenant/v2.0",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	ident, err := source.Identify(req)
	if err != nil {
		t.Fatalf("expected successful identification, got: %v", err)
	}

	if ident.EntraID != "user-oid-12345" {
		t.Errorf("expected EntraID 'user-oid-12345', got %q", ident.EntraID)
	}
	if ident.Role != "student" {
		t.Errorf("expected Role 'student', got %q", ident.Role)
	}
	if ident.Name != "Alice Student" {
		t.Errorf("expected Name 'Alice Student', got %q", ident.Name)
	}
}

func TestJWT_HMAC_IssuerRole(t *testing.T) {
	secret := "test-secret-at-least-32-chars-long-for-hmac!!"
	source := NewJWTIdentitySource(JWTConfig{
		SymmetricSecret: secret,
	})

	claims := jwt.MapClaims{
		"oid":   "admin-oid-999",
		"roles": []any{"Issuer"},
		"name":  "Dean Administrator",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	ident, err := source.Identify(req)
	if err != nil {
		t.Fatalf("expected successful identification, got: %v", err)
	}

	if ident.Role != "issuer" {
		t.Errorf("expected Role 'issuer', got %q", ident.Role)
	}
}

func TestJWT_ExpiredToken(t *testing.T) {
	secret := "test-secret-at-least-32-chars-long-for-hmac!!"
	source := NewJWTIdentitySource(JWTConfig{
		SymmetricSecret: secret,
	})

	claims := jwt.MapClaims{
		"oid":   "user-1",
		"roles": []any{"Student"},
		"exp":   time.Now().Add(-1 * time.Hour).Unix(), // expired
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	_, err = source.Identify(req)
	if err == nil {
		t.Fatal("expected error for expired token, got nil")
	}
}

func TestJWT_AudienceMismatch(t *testing.T) {
	secret := "test-secret-at-least-32-chars-long-for-hmac!!"
	source := NewJWTIdentitySource(JWTConfig{
		SymmetricSecret: secret,
		Audience:        "api://correct-audience",
	})

	claims := jwt.MapClaims{
		"oid":   "user-1",
		"roles": []any{"Student"},
		"aud":   "api://wrong-audience",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	_, err = source.Identify(req)
	if err == nil {
		t.Fatal("expected error for audience mismatch, got nil")
	}
}

func TestJWT_JWKS_RSA_Success(t *testing.T) {
	// 1. Generate RSA key pair for testing
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate RSA key: %v", err)
	}
	publicKey := &privateKey.PublicKey

	kid := "test-key-id-1"
	nStr := base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes())
	eStr := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(publicKey.E)).Bytes())

	// 2. Mock JWKS HTTP server
	jwksHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]any{
				{
					"kid": kid,
					"kty": "RSA",
					"use": "sig",
					"n":   nStr,
					"e":   eStr,
				},
			},
		})
	})
	server := httptest.NewServer(jwksHandler)
	defer server.Close()

	// 3. Configure source to use mock JWKS server
	source := NewJWTIdentitySource(JWTConfig{
		JWKSURI:    server.URL,
		Audience:   "client-id-123",
		Issuer:     "https://login.microsoftonline.com/tenant-123/v2.0",
		HTTPClient: server.Client(),
	})

	claims := jwt.MapClaims{
		"oid":   "entra-user-oid",
		"roles": []any{"Issuer"},
		"name":  "Registrar Officer",
		"aud":   "client-id-123",
		"iss":   "https://login.microsoftonline.com/tenant-123/v2.0",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid

	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatalf("failed to sign RSA token: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	ident, err := source.Identify(req)
	if err != nil {
		t.Fatalf("expected successful RSA identification, got: %v", err)
	}

	if ident.EntraID != "entra-user-oid" || ident.Role != "issuer" || ident.Name != "Registrar Officer" {
		t.Errorf("unexpected identity: %+v", ident)
	}
}
