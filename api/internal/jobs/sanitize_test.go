package jobs

import (
	"strings"
	"testing"
)

func TestSanitizeFilename(t *testing.T) {
	tests := []struct {
		name        string
		rawFilename string
		contentType string
		sizeBytes   int64
		maxBytes    int64
		wantName    string
		wantErr     bool
		errContains string
	}{
		{
			name:        "neutralizes path traversal with pdf",
			rawFilename: "../../etc/passwd.pdf",
			contentType: "application/pdf",
			sizeBytes:   1024,
			maxBytes:    4194304,
			wantName:    "passwd.pdf",
			wantErr:     false,
		},
		{
			name:        "neutralizes windows path traversal with png",
			rawFilename: `..\..\windows\system32\badge.png`,
			contentType: "image/png",
			sizeBytes:   1024,
			maxBytes:    4194304,
			wantName:    "badge.png",
			wantErr:     false,
		},
		{
			name:        "collapses repeated underscores and strips leading dots",
			rawFilename: "...my___file___name.jpg",
			contentType: "image/jpeg",
			sizeBytes:   2048,
			maxBytes:    4194304,
			wantName:    "my_file_name.jpg",
			wantErr:     false,
		},
		{
			name:        "replaces special characters",
			rawFilename: "transcript (final) #1 [2026].pdf",
			contentType: "application/pdf",
			sizeBytes:   2048,
			maxBytes:    4194304,
			wantName:    "transcript_final_1_2026_.pdf",
			wantErr:     false,
		},
		{
			name:        "caps at 100 characters keeping extension",
			rawFilename: strings.Repeat("a", 150) + ".pdf",
			contentType: "application/pdf",
			sizeBytes:   2048,
			maxBytes:    4194304,
			wantName:    strings.Repeat("a", 96) + ".pdf",
			wantErr:     false,
		},
		{
			name:        "rejects traversal without allowed extension (passwd)",
			rawFilename: "../../etc/passwd",
			contentType: "text/plain",
			sizeBytes:   1024,
			maxBytes:    4194304,
			wantErr:     true,
			errContains: "unsupported file extension",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := SanitizeAndValidate(tt.rawFilename, tt.contentType, tt.sizeBytes, tt.maxBytes)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if tt.errContains != "" && !strings.Contains(err.Error(), tt.errContains) {
					t.Errorf("expected error containing %q, got %q", tt.errContains, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.wantName {
				t.Errorf("got %q, want %q", got, tt.wantName)
			}
			if len(got) > 100 {
				t.Errorf("sanitized filename exceeds 100 chars: %d", len(got))
			}
		})
	}
}

func TestCreateJob_Validation(t *testing.T) {
	maxBytes := int64(4194304)

	tests := []struct {
		name        string
		filename    string
		contentType string
		sizeBytes   int64
		errContains string
	}{
		{
			name:        "missing filename",
			filename:    "",
			contentType: "application/pdf",
			sizeBytes:   100,
			errContains: "filename is required",
		},
		{
			name:        "missing content_type",
			filename:    "cert.pdf",
			contentType: "",
			sizeBytes:   100,
			errContains: "content_type is required",
		},
		{
			name:        "zero size",
			filename:    "cert.pdf",
			contentType: "application/pdf",
			sizeBytes:   0,
			errContains: "size_bytes must be greater than 0",
		},
		{
			name:        "negative size",
			filename:    "cert.pdf",
			contentType: "application/pdf",
			sizeBytes:   -50,
			errContains: "size_bytes must be greater than 0",
		},
		{
			name:        "oversize file",
			filename:    "huge.pdf",
			contentType: "application/pdf",
			sizeBytes:   maxBytes + 1,
			errContains: "size_bytes exceeds maximum upload limit",
		},
		{
			name:        "bad extension exe",
			filename:    "malware.exe",
			contentType: "application/x-msdownload",
			sizeBytes:   1024,
			errContains: "unsupported file extension",
		},
		{
			name:        "content_type mismatch pdf with png content_type",
			filename:    "cert.pdf",
			contentType: "image/png",
			sizeBytes:   1024,
			errContains: "content_type does not match file extension",
		},
		{
			name:        "content_type mismatch jpg with pdf content_type",
			filename:    "photo.jpg",
			contentType: "application/pdf",
			sizeBytes:   1024,
			errContains: "content_type does not match file extension",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := SanitizeAndValidate(tt.filename, tt.contentType, tt.sizeBytes, maxBytes)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.errContains) {
				t.Errorf("expected error containing %q, got %q", tt.errContains, err.Error())
			}
		})
	}
}
