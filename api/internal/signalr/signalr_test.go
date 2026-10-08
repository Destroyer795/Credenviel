package signalr_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Destroyer795/Credenviel/api/internal/signalr"
	"github.com/golang-jwt/jwt/v5"
)

func TestDevClient(t *testing.T) {
	client := signalr.NewDevClient()

	resp, err := client.GenerateNegotiateResponse(context.Background(), "user-alice")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.URL != "/dev/signalr/hub" {
		t.Errorf("expected URL /dev/signalr/hub, got %s", resp.URL)
	}

	err = client.BroadcastJobStatus(context.Background(), "user-alice", "job-1", "processed", map[string]any{"foo": "bar"})
	if err != nil {
		t.Fatalf("broadcast failed: %v", err)
	}

	events := client.Events()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].JobID != "job-1" || events[0].Status != "processed" || events[0].UploaderID != "user-alice" {
		t.Errorf("unexpected event content: %+v", events[0])
	}
}

func TestAzureClient_NegotiateAndToken(t *testing.T) {
	accessKey := "c2VjcmV0LWtleS1mb3ItdGVzdGluZy0xMjM0NTY3OA=="
	connStr := "Endpoint=https://test-signalr.service.signalr.net;AccessKey=" + accessKey + ";Version=1.0;"

	client, err := signalr.NewAzureClient(connStr, "credenviel")
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	resp, err := client.GenerateNegotiateResponse(context.Background(), "student-123")
	if err != nil {
		t.Fatalf("failed to negotiate: %v", err)
	}

	expectedURL := "https://test-signalr.service.signalr.net/client/?hub=credenviel"
	if resp.URL != expectedURL {
		t.Errorf("expected URL %s, got %s", expectedURL, resp.URL)
	}

	// Validate JWT token signature and claims
	parsedToken, err := jwt.Parse(resp.AccessToken, func(token *jwt.Token) (interface{}, error) {
		return []byte(accessKey), nil
	})
	if err != nil {
		t.Fatalf("token failed validation: %v", err)
	}

	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	if !ok || !parsedToken.Valid {
		t.Fatalf("invalid claims")
	}

	if claims["sub"] != "student-123" {
		t.Errorf("expected sub student-123, got %v", claims["sub"])
	}
	if claims["aud"] != expectedURL {
		t.Errorf("expected aud %s, got %v", expectedURL, claims["aud"])
	}
}

func TestAzureClient_BroadcastJobStatus(t *testing.T) {
	var receivedAuth string
	var receivedBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		bodyBytes, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(bodyBytes, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	accessKey := "secret-test-key-123"
	connStr := "Endpoint=" + server.URL + ";AccessKey=" + accessKey + ";Version=1.0;"

	client, err := signalr.NewAzureClient(connStr, "credenviel")
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err = client.BroadcastJobStatus(ctx, "user-456", "job-999", "needs_review", map[string]any{"reason": "low_confidence"})
	if err != nil {
		t.Fatalf("broadcast failed: %v", err)
	}

	if receivedAuth == "" || len(receivedAuth) < 10 {
		t.Errorf("expected Authorization header with Bearer token, got %q", receivedAuth)
	}

	if receivedBody["target"] != "jobStatusUpdated" {
		t.Errorf("expected target jobStatusUpdated, got %v", receivedBody["target"])
	}

	args, ok := receivedBody["arguments"].([]any)
	if !ok || len(args) == 0 {
		t.Fatalf("expected arguments array in body")
	}
	arg0, ok := args[0].(map[string]any)
	if !ok || arg0["job_id"] != "job-999" || arg0["status"] != "needs_review" {
		t.Errorf("unexpected arg0: %+v", arg0)
	}
}
