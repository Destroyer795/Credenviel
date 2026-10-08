package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
	"github.com/Destroyer795/Credenviel/api/internal/config"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

type memoryUserStore struct {
	users map[string]auth.User
}

func (m *memoryUserStore) UpsertUser(ctx context.Context, ident auth.Identity) (auth.User, error) {
	u, ok := m.users[ident.EntraID]
	if !ok {
		u = auth.User{
			ID:      "uid-" + ident.EntraID,
			EntraID: ident.EntraID,
			Role:    ident.Role,
			Name:    ident.Name,
		}
		m.users[ident.EntraID] = u
	} else {
		u.Role = ident.Role
		u.Name = ident.Name
		m.users[ident.EntraID] = u
	}
	return u, nil
}

type memoryJobRepo struct {
	jobs map[string]*jobs.Job
}

func (m *memoryJobRepo) Create(ctx context.Context, j *jobs.Job) error {
	j.Status = "awaiting_upload"
	j.CreatedAt = time.Now().UTC()
	j.UpdatedAt = time.Now().UTC()
	m.jobs[j.ID] = j
	return nil
}

func (m *memoryJobRepo) Get(ctx context.Context, id string) (*jobs.Job, error) {
	j, ok := m.jobs[id]
	if !ok {
		return nil, jobs.ErrNotFound
	}
	return j, nil
}

func (m *memoryJobRepo) List(ctx context.Context, filter jobs.ListFilter) ([]*jobs.Job, error) {
	var result []*jobs.Job
	for _, j := range m.jobs {
		if !filter.IsIssuer && j.UploaderID != filter.UploaderID {
			continue
		}
		if filter.Status != "" && j.Status != filter.Status {
			continue
		}
		result = append(result, j)
	}
	return result, nil
}

type memoryStore struct {
	data map[string][]byte
}

func (m *memoryStore) Put(ctx context.Context, key string, r io.Reader, maxBytes int64) (int64, error) {
	buf := new(bytes.Buffer)
	limited := io.LimitReader(r, maxBytes+1)
	n, err := io.Copy(buf, limited)
	if err != nil {
		return 0, err
	}
	if n > maxBytes {
		return 0, storage.ErrTooLarge
	}
	m.data[key] = buf.Bytes()
	return n, nil
}

func (m *memoryStore) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	b, ok := m.data[key]
	if !ok {
		return nil, storage.ErrPathTraversal
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (m *memoryStore) Exists(ctx context.Context, key string) (bool, error) {
	_, ok := m.data[key]
	return ok, nil
}

func setupTestServer() (*Server, *memoryUserStore, *memoryJobRepo, *memoryStore) {
	cfg := &config.Config{
		Host:             "127.0.0.1",
		Port:             "8080",
		AppEnv:           "local",
		AuthMode:         "dev",
		InternalAPIKey:   "test-secret-123",
		MaxUploadBytes:   4194304,
		PublicBaseURL:    "http://127.0.0.1:8080",
		LocalStorageRoot: ".local-storage",
	}

	userStore := &memoryUserStore{users: make(map[string]auth.User)}
	jobRepo := &memoryJobRepo{jobs: make(map[string]*jobs.Job)}
	store := &memoryStore{data: make(map[string][]byte)}
	signer := storage.NewLocalSigner(cfg.PublicBaseURL)

	s := NewServer(cfg, userStore, jobRepo, store, signer)
	return s, userStore, jobRepo, store
}

func TestNotify_Secret(t *testing.T) {
	s, _, _, _ := setupTestServer()

	// 1. Missing secret header => 401
	req := httptest.NewRequest(http.MethodPost, "/internal/v1/jobs/test-id/notify", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing secret, got %d", rec.Code)
	}

	// 2. Wrong secret header => 401
	req = httptest.NewRequest(http.MethodPost, "/internal/v1/jobs/test-id/notify", nil)
	req.Header.Set("X-Internal-Secret", "wrong-secret")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong secret, got %d", rec.Code)
	}

	// 3. Correct secret header => 204
	req = httptest.NewRequest(http.MethodPost, "/internal/v1/jobs/test-id/notify", strings.NewReader(`{"status":"processed"}`))
	req.Header.Set("X-Internal-Secret", "test-secret-123")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 for correct secret, got %d", rec.Code)
	}
}

func TestCreateJob_Unit(t *testing.T) {
	s, _, repo, _ := setupTestServer()

	body := `{"filename":"my_diploma.pdf","content_type":"application/pdf","size_bytes":2048}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(body))
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	req.Header.Set("X-Dev-Name", "Dr. Exam Cell")

	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp createJobResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.JobID == "" {
		t.Errorf("expected non-empty job_id")
	}
	expectedBlobKey := fmt.Sprintf("raw-uploads/%s/my_diploma.pdf", resp.JobID)
	if resp.BlobKey != expectedBlobKey {
		t.Errorf("expected blob_key %q, got %q", expectedBlobKey, resp.BlobKey)
	}
	if resp.Upload.Method != "PUT" {
		t.Errorf("expected PUT method, got %q", resp.Upload.Method)
	}
	expectedURL := fmt.Sprintf("http://127.0.0.1:8080/dev/upload/%s/my_diploma.pdf", resp.JobID)
	if resp.Upload.URL != expectedURL {
		t.Errorf("expected upload URL %q, got %q", expectedURL, resp.Upload.URL)
	}

	// Verify job saved in repo with uploader_is_issuer = true
	savedJob, err := repo.Get(context.Background(), resp.JobID)
	if err != nil {
		t.Fatalf("job not found in repo: %v", err)
	}
	if !savedJob.UploaderIsIssuer {
		t.Errorf("expected uploader_is_issuer to be true for issuer role")
	}
}

func TestJobScoping(t *testing.T) {
	s, _, repo, _ := setupTestServer()

	// Seed jobs for two different students
	j1 := &jobs.Job{
		ID:               "job-student-1",
		UploaderID:       "uid-student-1",
		Status:           "awaiting_upload",
		BlobKey:          "raw-uploads/job-student-1/file1.pdf",
		UploaderIsIssuer: false,
	}
	j2 := &jobs.Job{
		ID:               "job-student-2",
		UploaderID:       "uid-student-2",
		Status:           "processed",
		BlobKey:          "raw-uploads/job-student-2/file2.pdf",
		UploaderIsIssuer: false,
	}
	repo.Create(context.Background(), j1)
	repo.Create(context.Background(), j2)

	// 1. Student 1 requests Student 2's job => 404 (PROPOSED D-026)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-student-2", nil)
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	req.Header.Set("X-Dev-Name", "Student One")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for other student's job, got %d", rec.Code)
	}

	// 2. Student 1 requests their own job => 200
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-student-1", nil)
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	req.Header.Set("X-Dev-Name", "Student One")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for own job, got %d", rec.Code)
	}

	// 3. Issuer requests Student 2's job => 200
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs/job-student-2", nil)
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	req.Header.Set("X-Dev-Name", "Dean")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for issuer viewing any job, got %d", rec.Code)
	}

	// 4. Invalid status filter => 400
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs?status=bogus_status", nil)
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	req.Header.Set("X-Dev-Name", "Dean")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid status filter, got %d", rec.Code)
	}
}

func TestDevUpload_Unit(t *testing.T) {
	s, _, repo, store := setupTestServer()

	j := &jobs.Job{
		ID:               "job-upload-test",
		UploaderID:       "uid-student-1",
		Status:           "awaiting_upload",
		BlobKey:          "raw-uploads/job-upload-test/cert.pdf",
		UploaderIsIssuer: false,
	}
	repo.Create(context.Background(), j)

	// 1. Unknown job => 404
	req := httptest.NewRequest(http.MethodPut, "/dev/upload/unknown-job/cert.pdf", strings.NewReader("data"))
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown job, got %d", rec.Code)
	}

	// 2. Filename mismatch => 404
	req = httptest.NewRequest(http.MethodPut, "/dev/upload/job-upload-test/wrong.pdf", strings.NewReader("data"))
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for filename mismatch, got %d", rec.Code)
	}

	// 3. Valid upload => 200
	fileData := "PDF content bytes"
	req = httptest.NewRequest(http.MethodPut, "/dev/upload/job-upload-test/cert.pdf", strings.NewReader(fileData))
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for valid upload, got %d", rec.Code)
	}

	if string(store.data["raw-uploads/job-upload-test/cert.pdf"]) != fileData {
		t.Errorf("stored data does not match uploaded content")
	}

	// 4. Job not awaiting_upload => 409
	j.Status = "queued"
	req = httptest.NewRequest(http.MethodPut, "/dev/upload/job-upload-test/cert.pdf", strings.NewReader("data"))
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Errorf("expected 409 for job not in awaiting_upload, got %d", rec.Code)
	}
}

func TestServer_JWTAuthRoutes(t *testing.T) {
	secret := "super-secure-symmetric-key-for-testing-jwt-routes-32chars"
	cfg := &config.Config{
		AuthMode:           "jwt",
		AppEnv:             "local",
		JWTSymmetricSecret: secret,
		MaxUploadBytes:     4194304,
		InternalAPIKey:     "secret-key",
	}

	uStore := &memoryUserStore{users: make(map[string]auth.User)}
	jRepo := &memoryJobRepo{jobs: make(map[string]*jobs.Job)}
	mStore := &memoryStore{data: make(map[string][]byte)}
	mSigner := storage.NewLocalSigner("http://127.0.0.1:8080")

	srv := NewServer(cfg, uStore, jRepo, mStore, mSigner)

	// Helper to generate a test JWT
	makeToken := func(oid, role, name string) string {
		claims := map[string]any{
			"oid":   oid,
			"roles": []string{role},
			"name":  name,
			"exp":   time.Now().Add(1 * time.Hour).Unix(),
		}
		// manual JWT creation or helper
		tok := auth.NewJWTIdentitySource(auth.JWTConfig{SymmetricSecret: secret})
		_ = tok
		// Sign HS256
		header := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" // {"alg":"HS256","typ":"JWT"}
		claimsBytes, _ := json.Marshal(claims)
		claimsEncoded := strings.TrimRight(base64.URLEncoding.EncodeToString(claimsBytes), "=")
		toSign := header + "." + claimsEncoded
		// use crypto hmac
		h := hmacSHA256([]byte(toSign), []byte(secret))
		sigEncoded := strings.TrimRight(base64.URLEncoding.EncodeToString(h), "=")
		return toSign + "." + sigEncoded
	}

	// 1. Unauthenticated request => 401
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(`{"filename":"cert.pdf","content_type":"application/pdf","size_bytes":100}`))
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated request, got %d", rec.Code)
	}

	// 2. Authenticated Student request => 201
	studentToken := makeToken("student-oid-1", "Student", "Bob Student")
	req = httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(`{"filename":"cert.pdf","content_type":"application/pdf","size_bytes":100}`))
	req.Header.Set("Authorization", "Bearer "+studentToken)
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid student JWT, got %d: %s", rec.Code, rec.Body.String())
	}

	var created createJobResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// 3. Different student reading job => 404 (D-026)
	otherStudentToken := makeToken("student-oid-2", "Student", "Charlie Student")
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+created.JobID, nil)
	req.Header.Set("Authorization", "Bearer "+otherStudentToken)
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for other student reading job, got %d", rec.Code)
	}

	// 4. Issuer reading job => 200
	issuerToken := makeToken("issuer-oid-1", "Issuer", "Dr. Registrar")
	req = httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+created.JobID, nil)
	req.Header.Set("Authorization", "Bearer "+issuerToken)
	rec = httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for issuer reading student job, got %d", rec.Code)
	}
}

func hmacSHA256(data, key []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

