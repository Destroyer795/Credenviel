// Package signalr provides SignalR Service REST API integration for push-based status updates.
package signalr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Client defines the SignalR operations needed by the application.
type Client interface {
	BroadcastJobStatus(ctx context.Context, uploaderID string, jobID string, status string, payload map[string]any) error
	GenerateNegotiateResponse(ctx context.Context, userID string) (*NegotiateResponse, error)
}

// NegotiateResponse represents the connection parameters for frontend SignalR clients.
type NegotiateResponse struct {
	URL         string `json:"url"`
	AccessToken string `json:"accessToken"`
}

// Event represents a broadcast event stored in memory (useful for testing and logs).
type Event struct {
	UploaderID string         `json:"uploader_id"`
	JobID      string         `json:"job_id"`
	Status     string         `json:"status"`
	Payload    map[string]any `json:"payload,omitempty"`
	Timestamp  time.Time      `json:"timestamp"`
}

// DevClient implements Client for local development and offline test environments.
type DevClient struct {
	mu     sync.Mutex
	events []Event
}

// NewDevClient creates a new in-memory dev client.
func NewDevClient() *DevClient {
	return &DevClient{
		events: make([]Event, 0),
	}
}

// BroadcastJobStatus records the status update in memory.
func (d *DevClient) BroadcastJobStatus(ctx context.Context, uploaderID string, jobID string, status string, payload map[string]any) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.events = append(d.events, Event{
		UploaderID: uploaderID,
		JobID:      jobID,
		Status:     status,
		Payload:    payload,
		Timestamp:  time.Now(),
	})
	return nil
}

// GenerateNegotiateResponse returns dev connection parameters.
func (d *DevClient) GenerateNegotiateResponse(ctx context.Context, userID string) (*NegotiateResponse, error) {
	return &NegotiateResponse{
		URL:         "/dev/signalr/hub",
		AccessToken: "dev-signalr-token-" + userID,
	}, nil
}

// Events returns a snapshot of recorded broadcast events.
func (d *DevClient) Events() []Event {
	d.mu.Lock()
	defer d.mu.Unlock()
	copied := make([]Event, len(d.events))
	copy(copied, d.events)
	return copied
}

// AzureClient connects to Azure SignalR Service in Serverless mode via its REST API.
type AzureClient struct {
	endpoint   string
	accessKey  []byte
	hubName    string
	httpClient *http.Client
}

// NewAzureClient initializes an Azure SignalR REST API client from a connection string.
func NewAzureClient(connectionString string, hubName string) (*AzureClient, error) {
	if hubName == "" {
		hubName = "credenviel"
	}

	parts := strings.Split(connectionString, ";")
	var endpoint, accessKey string
	for _, part := range parts {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) == 2 {
			switch strings.ToLower(kv[0]) {
			case "endpoint":
				endpoint = strings.TrimSuffix(kv[1], "/")
			case "accesskey":
				accessKey = kv[1]
			}
		}
	}

	if endpoint == "" || accessKey == "" {
		return nil, fmt.Errorf("invalid SignalR connection string: missing endpoint or access key")
	}

	return &AzureClient{
		endpoint:   endpoint,
		accessKey:  []byte(accessKey),
		hubName:    hubName,
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}, nil
}

func (a *AzureClient) generateToken(audience string, subject string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"aud": audience,
		"iat": now.Unix(),
		"exp": now.Add(ttl).Unix(),
	}
	if subject != "" {
		claims["sub"] = subject
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.accessKey)
}

// GenerateNegotiateResponse generates client URL and user-scoped JWT for Azure SignalR client connection.
func (a *AzureClient) GenerateNegotiateResponse(ctx context.Context, userID string) (*NegotiateResponse, error) {
	clientURL := fmt.Sprintf("%s/client/?hub=%s", a.endpoint, a.hubName)
	token, err := a.generateToken(clientURL, userID, 1*time.Hour)
	if err != nil {
		return nil, fmt.Errorf("failed to generate negotiate token: %w", err)
	}
	return &NegotiateResponse{
		URL:         clientURL,
		AccessToken: token,
	}, nil
}

// BroadcastJobStatus sends a jobStatusUpdated event via the SignalR Service REST API.
func (a *AzureClient) BroadcastJobStatus(ctx context.Context, uploaderID string, jobID string, status string, payload map[string]any) error {
	var targetURL string
	if uploaderID != "" {
		targetURL = fmt.Sprintf("%s/api/v1/hubs/%s/users/%s", a.endpoint, a.hubName, uploaderID)
	} else {
		targetURL = fmt.Sprintf("%s/api/v1/hubs/%s", a.endpoint, a.hubName)
	}

	token, err := a.generateToken(targetURL, "", 5*time.Minute)
	if err != nil {
		return fmt.Errorf("failed to generate signalr auth token: %w", err)
	}

	bodyData := map[string]any{
		"target": "jobStatusUpdated",
		"arguments": []any{
			map[string]any{
				"job_id":  jobID,
				"status":  status,
				"payload": payload,
			},
		},
	}
	jsonBytes, err := json.Marshal(bodyData)
	if err != nil {
		return fmt.Errorf("failed to marshal signalr payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("signalr request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("signalr returned status code: %d", resp.StatusCode)
	}
	return nil
}
