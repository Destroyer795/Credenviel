package main

import (
	"context"
	"strings"
	"testing"
)

func TestRun_RefusesEmptyInternalAPIKey(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "",
		"AUTH_MODE":        "dev",
		"APP_ENV":          "local",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for empty INTERNAL_API_KEY, got nil")
	}
	if !strings.Contains(err.Error(), "INTERNAL_API_KEY must not be empty") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRun_RefusesDevAuthWhenNotLocal(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "dev",
		"APP_ENV":          "production",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for AUTH_MODE=dev with APP_ENV=production, got nil")
	}
	if !strings.Contains(err.Error(), "AUTH_MODE=dev is only allowed when APP_ENV=local") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRun_UnsupportedAuthMode(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "unsupported_mode",
		"APP_ENV":          "local",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for unsupported AUTH_MODE, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported AUTH_MODE") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRun_FirebaseMissingConfig(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "firebase",
		"APP_ENV":          "azure",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for missing FIREBASE_PROJECT_ID, got nil")
	}
	if !strings.Contains(err.Error(), "FIREBASE_PROJECT_ID") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRun_LegacyAuthModesRejected(t *testing.T) {
	for _, mode := range []string{"entra", "jwt"} {
		env := map[string]string{
			"INTERNAL_API_KEY": "secret-key",
			"AUTH_MODE":        mode,
			"APP_ENV":          "local",
		}
		err := run(context.Background(), func(k string) string { return env[k] })
		if err == nil || !strings.Contains(err.Error(), "unsupported AUTH_MODE") {
			t.Errorf("AUTH_MODE=%s: expected unsupported error, got %v", mode, err)
		}
	}
}

func TestRun_FirebaseEmulatorOnlyInLocal(t *testing.T) {
	env := map[string]string{
		"INTERNAL_API_KEY":            "secret-key",
		"AUTH_MODE":                   "firebase",
		"FIREBASE_PROJECT_ID":         "credenviel-prod",
		"FIREBASE_AUTH_EMULATOR_HOST": "127.0.0.1:9099",
		"APP_ENV":                     "azure",
	}
	err := run(context.Background(), func(k string) string { return env[k] })
	if err == nil || !strings.Contains(err.Error(), "FIREBASE_AUTH_EMULATOR_HOST") {
		t.Fatalf("expected emulator host to be refused outside local, got %v", err)
	}
}
