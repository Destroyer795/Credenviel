package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	ErrPathTraversal = errors.New("path traversal detected: key resolves outside storage root")
	ErrTooLarge      = errors.New("file size exceeds maximum allowed upload bytes")
)

// UploadInfo contains client instructions for performing a direct upload.
type UploadInfo struct {
	Method    string            `json:"method"`
	URL       string            `json:"url"`
	ExpiresAt time.Time         `json:"expires_at"`
	Headers   map[string]string `json:"headers"`
}

// Store defines operations for storing and reading objects.
type Store interface {
	Put(ctx context.Context, key string, r io.Reader, maxBytes int64) (int64, error)
	Open(ctx context.Context, key string) (io.ReadCloser, error)
	Exists(ctx context.Context, key string) (bool, error)
}

// UploadSigner generates upload URLs.
type UploadSigner interface {
	SignUpload(jobID, filename string, ttl time.Duration) (UploadInfo, error)
}

// LocalFS implements Store backed by the local filesystem.
type LocalFS struct {
	root string
}

func NewLocalFS(root string) (*LocalFS, error) {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve storage root: %w", err)
	}
	if err := os.MkdirAll(absRoot, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage root directory: %w", err)
	}
	return &LocalFS{root: absRoot}, nil
}

func (l *LocalFS) resolve(key string) (string, error) {
	if key == "" || strings.TrimSpace(key) == "" {
		return "", errors.New("key cannot be empty")
	}

	if strings.HasPrefix(key, "/") || strings.HasPrefix(key, "\\") || strings.Contains(key, ":") {
		return "", ErrPathTraversal
	}

	cleanKey := filepath.Clean(filepath.FromSlash(key))
	fullPath := filepath.Join(l.root, cleanKey)

	rel, err := filepath.Rel(l.root, fullPath)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return "", ErrPathTraversal
	}

	return fullPath, nil
}

func (l *LocalFS) Put(ctx context.Context, key string, r io.Reader, maxBytes int64) (int64, error) {
	targetPath, err := l.resolve(key)
	if err != nil {
		return 0, err
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, fmt.Errorf("failed to create directory: %w", err)
	}

	var randBytes [8]byte
	rand.Read(randBytes[:])
	tmpPath := filepath.Join(dir, fmt.Sprintf(".tmp-%s-%s", filepath.Base(targetPath), hex.EncodeToString(randBytes[:])))

	tmpFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return 0, fmt.Errorf("failed to create temp file: %w", err)
	}

	cleanup := func() {
		tmpFile.Close()
		os.Remove(tmpPath)
	}

	// Read with a limit to detect oversize
	limitedReader := io.LimitReader(r, maxBytes+1)
	written, err := io.Copy(tmpFile, limitedReader)
	if err != nil {
		cleanup()
		return 0, fmt.Errorf("failed to write data: %w", err)
	}

	if written > maxBytes {
		cleanup()
		return 0, ErrTooLarge
	}

	if err := tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return 0, fmt.Errorf("failed to close temp file: %w", err)
	}

	// Atomic rename
	if err := os.Rename(tmpPath, targetPath); err != nil {
		os.Remove(tmpPath)
		return 0, fmt.Errorf("failed to rename temp file to target: %w", err)
	}

	return written, nil
}

func (l *LocalFS) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	targetPath, err := l.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(targetPath)
}

func (l *LocalFS) Exists(ctx context.Context, key string) (bool, error) {
	targetPath, err := l.resolve(key)
	if err != nil {
		return false, err
	}
	info, err := os.Stat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return !info.IsDir(), nil
}

// LocalSigner generates dev upload URLs.
type LocalSigner struct {
	baseURL string
}

func NewLocalSigner(baseURL string) *LocalSigner {
	return &LocalSigner{baseURL: strings.TrimRight(baseURL, "/")}
}

func (s *LocalSigner) SignUpload(jobID, filename string, ttl time.Duration) (UploadInfo, error) {
	uploadURL := fmt.Sprintf("%s/dev/upload/%s/%s", s.baseURL, url.PathEscape(jobID), url.PathEscape(filename))
	return UploadInfo{
		Method:    "PUT",
		URL:       uploadURL,
		ExpiresAt: time.Now().UTC().Add(ttl),
		Headers:   map[string]string{},
	}, nil
}
