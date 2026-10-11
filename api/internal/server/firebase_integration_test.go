//go:build integration

package server

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
)

const firebaseTestProject = "credenviel-it"

// firebaseSigner mints Firebase-shaped ID tokens signed by a key the test verifier trusts.
type firebaseSigner struct {
	key *rsa.PrivateKey
}

func newFirebaseSigner(t *testing.T) (*firebaseSigner, *auth.FirebaseIdentitySource) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "securetoken.system.gserviceaccount.com"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	certPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	certs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=3600")
		json.NewEncoder(w).Encode(map[string]string{"it-kid": certPEM})
	}))
	t.Cleanup(certs.Close)

	return &firebaseSigner{key: key}, auth.NewFirebaseIdentitySource(auth.FirebaseConfig{
		ProjectID: firebaseTestProject,
		CertsURL:  certs.URL,
	})
}

func (f *firebaseSigner) token(t *testing.T, key *rsa.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()
	now := time.Now()
	full := jwt.MapClaims{
		"iss":       "https://securetoken.google.com/" + firebaseTestProject,
		"aud":       firebaseTestProject,
		"iat":       now.Add(-time.Minute).Unix(),
		"auth_time": now.Add(-time.Minute).Unix(),
		"exp":       now.Add(time.Hour).Unix(),
	}
	for k, v := range claims {
		full[k] = v
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, full)
	tok.Header["kid"] = "it-kid"
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

// TestFirebaseAuth_Integration drives real Firebase-style tokens through the HTTP stack
// into Postgres: JIT provisioning, profile re-sync, role changes and forged-token rejection.
func TestFirebaseAuth_Integration(t *testing.T) {
	srv, database, _, _ := setupIntegrationServer(t)
	defer database.Close()
	signer, verifier := newFirebaseSigner(t)
	srv.SetIdentitySource(verifier)

	call := func(method, path, token, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		return rec
	}
	ctx := context.Background()
	userRow := func(uid string) (name, role string, count int) {
		if err := database.Pool().QueryRow(ctx, "SELECT count(*) FROM users WHERE entra_id = $1", uid).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count == 1 {
			if err := database.Pool().QueryRow(ctx, "SELECT name, role FROM users WHERE entra_id = $1", uid).Scan(&name, &role); err != nil {
				t.Fatal(err)
			}
		}
		return
	}

	// 1. First sign-in (display name not yet set, as right after email sign-up) provisions a student.
	tok := signer.token(t, signer.key, jwt.MapClaims{"sub": "uid-alice", "email": "alice@student.edu", "email_verified": false})
	rec := call(http.MethodGet, "/api/v1/me", tok, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if name, role, n := userRow("uid-alice"); n != 1 || role != "student" || name != "alice" {
		t.Fatalf("after first sign-in: rows=%d name=%q role=%q", n, name, role)
	}

	// 2. Token refresh after the profile name is set updates the same row (no duplicate user).
	tok = signer.token(t, signer.key, jwt.MapClaims{"sub": "uid-alice", "name": "Alice Chen", "email": "alice@student.edu"})
	if rec := call(http.MethodGet, "/api/v1/me", tok, ""); rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if name, _, n := userRow("uid-alice"); n != 1 || name != "Alice Chen" {
		t.Fatalf("after profile update: rows=%d name=%q", n, name)
	}

	// 3. A student cannot use issuer routes.
	if rec := call(http.MethodGet, "/api/v1/review", tok, ""); rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for student on review queue, got %d", rec.Code)
	}

	// 4. Granting the issuer custom claim promotes the same user on their next token.
	tok = signer.token(t, signer.key, jwt.MapClaims{"sub": "uid-alice", "name": "Alice Chen", "role": "issuer"})
	rec = call(http.MethodGet, "/api/v1/me", tok, "")
	var me auth.User
	json.Unmarshal(rec.Body.Bytes(), &me)
	if rec.Code != http.StatusOK || me.Role != "issuer" {
		t.Fatalf("expected issuer profile, got %d %+v", rec.Code, me)
	}
	if _, role, n := userRow("uid-alice"); n != 1 || role != "issuer" {
		t.Fatalf("expected promoted row, rows=%d role=%q", n, role)
	}
	if rec := call(http.MethodGet, "/api/v1/review", tok, ""); rec.Code != http.StatusOK {
		t.Errorf("expected 200 for issuer on review queue, got %d", rec.Code)
	}
	rec = call(http.MethodPost, "/api/v1/jobs", tok, `{"filename":"t.pdf","content_type":"application/pdf","size_bytes":100}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("issuer create job: %d %s", rec.Code, rec.Body.String())
	}
	var created createJobResponse
	json.Unmarshal(rec.Body.Bytes(), &created)
	if job, err := database.Get(ctx, created.JobID); err != nil || !job.UploaderIsIssuer {
		t.Errorf("expected issuer upload flag, err=%v", err)
	}

	// 5. A token signed by an unknown key is rejected and provisions nothing.
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	forged := signer.token(t, other, jwt.MapClaims{"sub": "uid-mallory", "role": "issuer"})
	if rec := call(http.MethodGet, "/api/v1/me", forged, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for forged token, got %d", rec.Code)
	}
	if _, _, n := userRow("uid-mallory"); n != 0 {
		t.Errorf("forged token must not provision a user, rows=%d", n)
	}

	// 6. Expired and missing tokens are rejected.
	expired := signer.token(t, signer.key, jwt.MapClaims{"sub": "uid-alice", "exp": time.Now().Add(-time.Hour).Unix()})
	if rec := call(http.MethodGet, "/api/v1/me", expired, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for expired token, got %d", rec.Code)
	}
	if rec := call(http.MethodGet, "/api/v1/me", "", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with no token, got %d", rec.Code)
	}
}
