package normalizer_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Destroyer795/Credenviel/api/internal/normalizer"
)

type TestVector struct {
	ID            string         `json:"id"`
	Description   string         `json:"description"`
	Fields        map[string]any `json:"fields"`
	CanonicalJSON string         `json:"canonical_json"`
	ExpectedHash  string         `json:"expected_hash"`
}

func TestCanonicalVectors(t *testing.T) {
	// Look up shared/test-vectors/fields_hash.json relative to repository root
	vectorPath := filepath.Join("..", "..", "..", "shared", "test-vectors", "fields_hash.json")
	data, err := os.ReadFile(vectorPath)
	if err != nil {
		t.Fatalf("Failed to read test vectors file from %s: %v", vectorPath, err)
	}

	var vectors []TestVector
	if err := json.Unmarshal(data, &vectors); err != nil {
		t.Fatalf("Failed to parse test vectors: %v", err)
	}

	if len(vectors) < 10 {
		t.Fatalf("Expected at least 10 vectors, found %d", len(vectors))
	}

	for _, tc := range vectors {
		t.Run(tc.ID, func(t *testing.T) {
			actualJSON, err := normalizer.ToCanonicalJSON(tc.Fields)
			if err != nil {
				t.Fatalf("[%s] ToCanonicalJSON returned error: %v", tc.ID, err)
			}

			if actualJSON != tc.CanonicalJSON {
				t.Errorf("[%s] Canonical JSON mismatch:\nGot:  %s\nWant: %s", tc.ID, actualJSON, tc.CanonicalJSON)
			}

			actualHash, err := normalizer.ComputeFieldsHash(tc.Fields)
			if err != nil {
				t.Fatalf("[%s] ComputeFieldsHash returned error: %v", tc.ID, err)
			}

			if actualHash != tc.ExpectedHash {
				t.Errorf("[%s] Hash mismatch:\nGot:  %s\nWant: %s", tc.ID, actualHash, tc.ExpectedHash)
			}
		})
	}
}

func TestNormalizeNumeric(t *testing.T) {
	cases := []struct {
		input    any
		expected string
	}{
		{"92.0", "92"},
		{"3.50", "3.5"},
		{"100.000", "100"},
		{"-0", "0"},
		{"0.0", "0"},
		{"8.80", "8.8"},
		{"90.00", "90"},
	}

	for _, tc := range cases {
		got := normalizer.NormalizeNumeric(tc.input)
		if got == nil || *got != tc.expected {
			t.Errorf("NormalizeNumeric(%v) = %v, want %s", tc.input, got, tc.expected)
		}
	}
}
