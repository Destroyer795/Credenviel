package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testProject = "credenviel-test"

type firebaseFixture struct {
	key    *rsa.PrivateKey
	kid    string
	source *FirebaseIdentitySource
	fetch  *atomic.Int32
}

func newFirebaseFixture(t *testing.T, issuerEmails ...string) *firebaseFixture {
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

	fetches := &atomic.Int32{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetches.Add(1)
		w.Header().Set("Cache-Control", "public, max-age=3600")
		json.NewEncoder(w).Encode(map[string]string{"test-kid": certPEM})
	}))
	t.Cleanup(srv.Close)

	return &firebaseFixture{
		key: key,
		kid: "test-kid",
		source: NewFirebaseIdentitySource(FirebaseConfig{
			ProjectID:    testProject,
			IssuerEmails: issuerEmails,
			CertsURL:     srv.URL,
		}),
		fetch: fetches,
	}
}

func (f *firebaseFixture) token(t *testing.T, mutate func(jwt.MapClaims)) string {
	t.Helper()
	now := time.Now()
	claims := jwt.MapClaims{
		"iss":            "https://securetoken.google.com/" + testProject,
		"aud":            testProject,
		"sub":            "uid-alice",
		"iat":            now.Add(-time.Minute).Unix(),
		"auth_time":      now.Add(-time.Minute).Unix(),
		"exp":            now.Add(time.Hour).Unix(),
		"email":          "alice@student.edu",
		"email_verified": true,
		"name":           "Alice Chen",
	}
	if mutate != nil {
		mutate(claims)
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = f.kid
	s, err := tok.SignedString(f.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func identify(src *FirebaseIdentitySource, token string) (Identity, error) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return src.Identify(req)
}

func TestFirebase_ValidStudentToken(t *testing.T) {
	f := newFirebaseFixture(t)
	ident, err := identify(f.source, f.token(t, nil))
	if err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if ident.ExternalID != "uid-alice" || ident.Role != "student" || ident.Name != "Alice Chen" {
		t.Errorf("unexpected identity: %+v", ident)
	}
}

func TestFirebase_RoleResolution(t *testing.T) {
	f := newFirebaseFixture(t, "ExamCell@University.edu")
	cases := []struct {
		name   string
		mutate func(jwt.MapClaims)
		want   string
	}{
		{"default is student", nil, "student"},
		{"custom claim issuer", func(c jwt.MapClaims) { c["role"] = "issuer" }, "issuer"},
		{"custom claim wins over allow-list", func(c jwt.MapClaims) {
			c["role"] = "student"
			c["email"] = "examcell@university.edu"
		}, "student"},
		{"unknown claim ignored", func(c jwt.MapClaims) { c["role"] = "admin" }, "student"},
		{"verified allow-listed email is issuer (case-insensitive)", func(c jwt.MapClaims) {
			c["email"] = "examcell@university.edu"
		}, "issuer"},
		{"unverified allow-listed email stays student", func(c jwt.MapClaims) {
			c["email"] = "examcell@university.edu"
			c["email_verified"] = false
		}, "student"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ident, err := identify(f.source, f.token(t, tc.mutate))
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if ident.Role != tc.want {
				t.Errorf("role = %q, want %q", ident.Role, tc.want)
			}
		})
	}
}

func TestFirebase_NameFallbacks(t *testing.T) {
	f := newFirebaseFixture(t)
	ident, _ := identify(f.source, f.token(t, func(c jwt.MapClaims) { delete(c, "name") }))
	if ident.Name != "alice" {
		t.Errorf("expected email local-part, got %q", ident.Name)
	}
	ident, _ = identify(f.source, f.token(t, func(c jwt.MapClaims) { delete(c, "name"); delete(c, "email") }))
	if ident.Name != "uid-alice" {
		t.Errorf("expected uid fallback, got %q", ident.Name)
	}
}

func TestFirebase_RejectsInvalidTokens(t *testing.T) {
	f := newFirebaseFixture(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)

	cases := map[string]string{
		"wrong audience": f.token(t, func(c jwt.MapClaims) { c["aud"] = "other-project" }),
		"wrong issuer":   f.token(t, func(c jwt.MapClaims) { c["iss"] = "https://securetoken.google.com/other" }),
		"expired":        f.token(t, func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() }),
		"no expiry":      f.token(t, func(c jwt.MapClaims) { delete(c, "exp") }),
		"missing sub":    f.token(t, func(c jwt.MapClaims) { delete(c, "sub") }),
		"future auth_time": f.token(t, func(c jwt.MapClaims) {
			c["auth_time"] = time.Now().Add(time.Hour).Unix()
		}),
		"issued in future": f.token(t, func(c jwt.MapClaims) { c["iat"] = time.Now().Add(time.Hour).Unix() }),
		"garbage":          "not-a-jwt",
	}

	// Signed by a key Google never published.
	forged := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "uid-evil",
		"iat": time.Now().Add(-time.Minute).Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	forged.Header["kid"] = f.kid
	cases["forged signature"], _ = forged.SignedString(other)

	// HS256 signed with the public cert as the secret (algorithm confusion).
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "uid-evil",
		"iat": time.Now().Add(-time.Minute).Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	hs.Header["kid"] = f.kid
	cases["hmac algorithm"], _ = hs.SignedString([]byte("secret"))

	// Unsigned token.
	none := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "uid-evil",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	cases["alg none"], _ = none.SignedString(jwt.UnsafeAllowNoneSignatureType)

	// Unknown key id.
	unknownKid := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "uid-evil",
		"iat": time.Now().Add(-time.Minute).Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	unknownKid.Header["kid"] = "rotated-away"
	cases["unknown kid"], _ = unknownKid.SignedString(f.key)

	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if ident, err := identify(f.source, tok); err == nil {
				t.Fatalf("expected rejection, got identity %+v", ident)
			}
		})
	}
}

func TestFirebase_HeaderValidation(t *testing.T) {
	f := newFirebaseFixture(t)
	if _, err := identify(f.source, ""); err == nil {
		t.Error("expected error for missing Authorization header")
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Basic abc")
	if _, err := f.source.Identify(req); err == nil {
		t.Error("expected error for non-Bearer scheme")
	}
}

func TestFirebase_CachesCertificates(t *testing.T) {
	f := newFirebaseFixture(t)
	for i := 0; i < 3; i++ {
		if _, err := identify(f.source, f.token(t, nil)); err != nil {
			t.Fatal(err)
		}
	}
	if n := f.fetch.Load(); n != 1 {
		t.Errorf("expected 1 certificate fetch, got %d", n)
	}
}

func TestParseEmailList(t *testing.T) {
	got := ParseEmailList(" a@x.edu, ,b@x.edu ,")
	if len(got) != 2 || got[0] != "a@x.edu" || got[1] != "b@x.edu" {
		t.Errorf("unexpected list: %v", got)
	}
}

func unsignedToken(t *testing.T, mutate func(jwt.MapClaims)) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss":   "https://securetoken.google.com/" + testProject,
		"aud":   testProject,
		"sub":   "emulator-uid",
		"iat":   time.Now().Add(-time.Minute).Unix(),
		"exp":   time.Now().Add(time.Hour).Unix(),
		"email": "dev@example.com",
	}
	if mutate != nil {
		mutate(claims)
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestFirebase_EmulatorUnsignedTokens(t *testing.T) {
	// Disabled by default: unsigned tokens are never accepted.
	prod := NewFirebaseIdentitySource(FirebaseConfig{ProjectID: testProject, CertsURL: "http://127.0.0.1:1"})
	if _, err := identify(prod, unsignedToken(t, nil)); err == nil {
		t.Fatal("unsigned token must be rejected unless AllowUnsigned is set")
	}

	emu := NewFirebaseIdentitySource(FirebaseConfig{ProjectID: testProject, CertsURL: "http://127.0.0.1:1", AllowUnsigned: true})
	ident, err := identify(emu, unsignedToken(t, nil))
	if err != nil {
		t.Fatalf("expected emulator token to be accepted, got %v", err)
	}
	if ident.ExternalID != "emulator-uid" || ident.Role != "student" || ident.Name != "dev" {
		t.Errorf("unexpected identity: %+v", ident)
	}

	// Claim checks still apply to unsigned tokens.
	bad := map[string]func(jwt.MapClaims){
		"wrong audience": func(c jwt.MapClaims) { c["aud"] = "other" },
		"wrong issuer":   func(c jwt.MapClaims) { c["iss"] = "https://evil.example" },
		"expired":        func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() },
		"no expiry":      func(c jwt.MapClaims) { delete(c, "exp") },
		"missing sub":    func(c jwt.MapClaims) { delete(c, "sub") },
	}
	for name, m := range bad {
		if _, err := identify(emu, unsignedToken(t, m)); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}

	// HMAC tokens are still refused even in emulator mode.
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "x",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	hs.Header["kid"] = "test-kid"
	tok, _ := hs.SignedString([]byte("secret"))
	if _, err := identify(emu, tok); err == nil {
		t.Error("HS256 token must be rejected in emulator mode")
	}
}

// A slow certificate endpoint must never stall requests whose signing key is already cached.
func TestFirebase_SlowCertEndpointDoesNotBlockCachedKeys(t *testing.T) {
	f := newFirebaseFixture(t)
	if _, err := identify(f.source, f.token(t, nil)); err != nil { // warm the cache
		t.Fatal(err)
	}

	release := make(chan struct{})
	hang := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
	defer hang.Close()
	defer close(release)
	f.source.cfg.CertsURL = hang.URL
	f.source.lastRefetch = time.Now().Add(-time.Hour) // past the refetch cooldown, so an unknown kid does trigger a fetch

	// An attacker sends an unknown kid, which triggers a (hanging) refetch...
	unknown := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "x",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	unknown.Header["kid"] = "attacker-kid"
	bad, _ := unknown.SignedString(f.key)
	go identify(f.source, bad)
	time.Sleep(100 * time.Millisecond)

	// ...while a legitimate user with a cached key must still be served immediately.
	done := make(chan error, 1)
	go func() { _, err := identify(f.source, f.token(t, nil)); done <- err }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("valid token rejected: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("valid request blocked behind a hanging certificate fetch")
	}
}

// If Google's endpoint is briefly unavailable after the cache expires, keep serving with the old keys.
func TestFirebase_ServesStaleKeysWhenRefreshFails(t *testing.T) {
	f := newFirebaseFixture(t)
	if _, err := identify(f.source, f.token(t, nil)); err != nil {
		t.Fatal(err)
	}
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer down.Close()
	f.source.cfg.CertsURL = down.URL
	f.source.mu.Lock()
	f.source.keysExpiry = time.Now().Add(-time.Minute) // cache expired
	f.source.mu.Unlock()
	f.source.fetchMu.Lock()
	f.source.lastRefetch = time.Now().Add(-time.Hour) // cooldown elapsed: a refetch is attempted (and fails)
	f.source.fetchMu.Unlock()

	if _, err := identify(f.source, f.token(t, nil)); err != nil {
		t.Fatalf("expected stale keys to be used while refresh fails, got %v", err)
	}
}

// Stale keys are only a short-lived fallback: far past expiry the verifier fails closed.
func TestFirebase_FailsClosedWhenKeysTooStale(t *testing.T) {
	f := newFirebaseFixture(t)
	if _, err := identify(f.source, f.token(t, nil)); err != nil {
		t.Fatal(err)
	}
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer down.Close()
	f.source.cfg.CertsURL = down.URL
	f.source.mu.Lock()
	f.source.keysExpiry = time.Now().Add(-maxStaleKeyAge - time.Hour)
	f.source.mu.Unlock()
	f.source.fetchMu.Lock()
	f.source.lastRefetch = time.Now().Add(-time.Hour)
	f.source.fetchMu.Unlock()

	if _, err := identify(f.source, f.token(t, nil)); err == nil {
		t.Fatal("expected rejection when keys are older than the stale grace period")
	}
}

// Many concurrent first requests trigger exactly one certificate download.
func TestFirebase_ColdStartStampedeFetchesOnce(t *testing.T) {
	f := newFirebaseFixture(t)
	tok := f.token(t, nil)
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := identify(f.source, tok); err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	wg.Wait()
	if n := f.fetch.Load(); n != 1 {
		t.Errorf("expected 1 certificate fetch for 200 concurrent requests, got %d", n)
	}
}

// A flood of tokens with unknown key IDs must not hammer Google's endpoint.
func TestFirebase_UnknownKidFloodIsThrottled(t *testing.T) {
	f := newFirebaseFixture(t)
	if _, err := identify(f.source, f.token(t, nil)); err != nil { // warm: 1 fetch
		t.Fatal(err)
	}
	bad := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": "https://securetoken.google.com/" + testProject, "aud": testProject, "sub": "x",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	bad.Header["kid"] = "nope"
	tok, _ := bad.SignedString(f.key)

	var wg sync.WaitGroup
	for i := 0; i < 500; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); identify(f.source, tok) }()
	}
	wg.Wait()
	if n := f.fetch.Load(); n > 2 {
		t.Errorf("unknown-kid flood caused %d certificate fetches (want <= 2)", n)
	}
}
