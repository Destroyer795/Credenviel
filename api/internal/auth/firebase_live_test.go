//go:build live

package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// Run with: go test -tags live -run TestLive ./internal/auth
// Confirms the verifier can parse Google's real published signing certificates.
func TestLive_GoogleSigningCerts(t *testing.T) {
	resp, err := http.Get(FirebaseCertsURL)
	if err != nil {
		t.Skipf("network unavailable: %v", err)
	}
	defer resp.Body.Close()
	var raw map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil || len(raw) == 0 {
		t.Fatalf("unexpected certs payload: %v (%d entries)", err, len(raw))
	}

	src := NewFirebaseIdentitySource(FirebaseConfig{ProjectID: "any-project"})
	for kid := range raw {
		key, err := src.getKey(context.Background(), kid)
		if err != nil {
			t.Fatalf("kid %s: %v", kid, err)
		}
		if key.N.BitLen() < 2048 {
			t.Errorf("kid %s: unexpectedly small key (%d bits)", kid, key.N.BitLen())
		}
	}
	if len(src.keys) != len(raw) {
		t.Errorf("parsed %d of %d certs", len(src.keys), len(raw))
	}
	ttl := time.Until(src.keysExpiry)
	t.Logf("parsed %d live certs; cache TTL %s (Cache-Control: %q)", len(src.keys), ttl.Round(time.Minute), resp.Header.Get("Cache-Control"))
	if ttl <= 0 {
		t.Error("cache expiry not set")
	}
}
