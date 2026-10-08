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

func TestRun_EntraMissingConfig(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "entra",
		"APP_ENV":          "local",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for missing ENTRA config, got nil")
	}
	if !strings.Contains(err.Error(), "ENTRA_TENANT_ID and ENTRA_CLIENT_ID") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestRun_JWTMissingConfig(t *testing.T) {
	ctx := context.Background()
	env := map[string]string{
		"INTERNAL_API_KEY": "secret-key",
		"AUTH_MODE":        "jwt",
		"APP_ENV":          "local",
	}

	err := run(ctx, func(k string) string { return env[k] })
	if err == nil {
		t.Fatalf("expected error for missing JWT config, got nil")
	}
	if !strings.Contains(err.Error(), "JWT_SYMMETRIC_SECRET or ENTRA_TENANT_ID") {
		t.Errorf("unexpected error: %v", err)
	}
}
