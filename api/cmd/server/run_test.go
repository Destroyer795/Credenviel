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

func TestRun_RefusesNonDevAuthMode(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "entra",
		"APP_ENV":          "local",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for AUTH_MODE=entra, got nil")
	}
	if !strings.Contains(err.Error(), "unsupported AUTH_MODE") {
		t.Errorf("unexpected error: %v", err)
	}
}
