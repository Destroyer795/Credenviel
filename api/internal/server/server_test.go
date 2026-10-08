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
	"github.com/Destroyer795/Credenviel/api/internal/records"
	"github.com/Destroyer795/Credenviel/api/internal/signalr"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

type memoryRecordRepo struct {
	records map[string]*records.Record
	jobRepo *memoryJobRepo
}

func (m *memoryRecordRepo) GetByJobID(ctx context.Context, jobID string) (*records.Record, error) {
	r, ok := m.records[jobID]
	if !ok {
		return nil, records.ErrNotFound
	}
	return r, nil
}

func (m *memoryRecordRepo) GetByPublicVerificationID(ctx context.Context, publicVerificationID string) (*records.Record, error) {
	for _, r := range m.records {
		if r.PublicVerificationID == publicVerificationID {
			return r, nil
		}
	}
	return nil, records.ErrNotFound
}

func (m *memoryRecordRepo) Resolve(ctx context.Context, jobID string, resolved records.ResolvedFields, fieldsHash string, diff map[string]any, reviewerID string) error {
	j, err := m.jobRepo.Get(ctx, jobID)
	if err != nil {
		return err
	}
	if j.Status != "needs_review" {
		return records.ErrInvalidStatus
	}
	r, ok := m.records[jobID]
	if !ok {
		r = &records.Record{JobID: jobID}
		m.records[jobID] = r
	}
	r.Name = resolved.Name
	r.RollNumber = resolved.RollNumber
	r.RegisterNumber = resolved.RegisterNumber
	r.Degree = resolved.Degree
	r.MarksJSON = resolved.MarksJSON
	r.CGPA = resolved.CGPA
	r.IssueDate = resolved.IssueDate
	r.FieldsHash = fieldsHash
	r.VerifiedByIssuer = true
	r.ReviewedBy = &reviewerID
	now := time.Now().UTC()
	r.ReviewedAt = &now
	r.CorrectionsJSON = diff

	j.Status = "processed"
	return nil
}

func (m *memoryRecordRepo) Reject(ctx context.Context, jobID string, reason string, reviewerID string) error {
	j, err := m.jobRepo.Get(ctx, jobID)
	if err != nil {
		return err
	}
	if j.Status != "needs_review" {
		return records.ErrInvalidStatus
	}
	j.Status = "failed"
	j.FailureReason = &reason

	r, ok := m.records[jobID]
	if ok {
		r.ReviewedBy = &reviewerID
		now := time.Now().UTC()
		r.ReviewedAt = &now
		r.CorrectionsJSON = map[string]any{
			"rejection_reason": reason,
			"rejected_by":      reviewerID,
		}
	}
	return nil
}

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

func setupTestServer() (*Server, *memoryUserStore, *memoryJobRepo, *memoryRecordRepo, *memoryStore) {
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
	recordRepo := &memoryRecordRepo{records: make(map[string]*records.Record), jobRepo: jobRepo}
	store := &memoryStore{data: make(map[string][]byte)}
	signer := storage.NewLocalSigner(cfg.PublicBaseURL)

	s := NewServer(cfg, userStore, jobRepo, recordRepo, store, signer, signer)
	return s, userStore, jobRepo, recordRepo, store
}

func TestNotify_Secret(t *testing.T) {
	s, _, _, _, _ := setupTestServer()

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
	s, _, repo, _, _ := setupTestServer()

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
	s, _, repo, _, _ := setupTestServer()

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
	s, _, repo, _, store := setupTestServer()

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
	recRepo := &memoryRecordRepo{records: make(map[string]*records.Record), jobRepo: jRepo}
	mStore := &memoryStore{data: make(map[string][]byte)}
	mSigner := storage.NewLocalSigner("http://127.0.0.1:8080")

	srv := NewServer(cfg, uStore, jRepo, recRepo, mStore, mSigner, mSigner)

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

func TestReview_ListQueue(t *testing.T) {
	s, _, jobRepo, _, _ := setupTestServer()

	// Seed one needs_review job and one processed job
	j1 := &jobs.Job{
		ID:         "job-review-1",
		UploaderID: "student-1",
		Status:     "needs_review",
		BlobKey:    "raw-uploads/job-review-1/cert1.pdf",
	}
	j2 := &jobs.Job{
		ID:         "job-processed-1",
		UploaderID: "student-1",
		Status:     "processed",
		BlobKey:    "raw-uploads/job-processed-1/cert2.pdf",
	}
	jobRepo.Create(context.Background(), j1)
	j1.Status = "needs_review" // override after Create sets awaiting_upload
	jobRepo.Create(context.Background(), j2)
	j2.Status = "processed"

	// 1. Student access => 403 Forbidden
	req := httptest.NewRequest(http.MethodGet, "/api/v1/review", nil)
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for student accessing review queue, got %d", rec.Code)
	}

	// 2. Issuer access => 200 with only needs_review jobs
	req = httptest.NewRequest(http.MethodGet, "/api/v1/review", nil)
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for issuer review queue, got %d", rec.Code)
	}

	var queue []*jobs.Job
	if err := json.NewDecoder(rec.Body).Decode(&queue); err != nil {
		t.Fatalf("failed to decode review queue response: %v", err)
	}
	if len(queue) != 1 || queue[0].ID != "job-review-1" {
		t.Errorf("expected 1 job with id 'job-review-1', got %d jobs", len(queue))
	}
}

func TestReview_GetJob(t *testing.T) {
	s, _, jobRepo, recRepo, _ := setupTestServer()

	jobID := "job-review-get"
	j := &jobs.Job{
		ID:         jobID,
		UploaderID: "student-1",
		Status:     "needs_review",
		BlobKey:    "raw-uploads/job-review-get/cert.pdf",
	}
	jobRepo.Create(context.Background(), j)
	j.Status = "needs_review"

	name := "Alice Cooper"
	cgpa := "3.75"
	recRepo.records[jobID] = &records.Record{
		ID:             "rec-1",
		JobID:          jobID,
		Name:           &name,
		CGPA:           &cgpa,
		FieldsHash:     "initial-hash",
		ConfidenceJSON: map[string]any{"threshold": 0.85},
	}

	// 1. Student access => 403
	req := httptest.NewRequest(http.MethodGet, "/api/v1/review/"+jobID, nil)
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for student, got %d", rec.Code)
	}

	// 2. Issuer access => 200 with preview read SAS URL
	req = httptest.NewRequest(http.MethodGet, "/api/v1/review/"+jobID, nil)
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for issuer, got %d: %s", rec.Code, rec.Body.String())
	}

	var data map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	readURL, ok := data["read_sas_url"].(string)
	if !ok || !strings.Contains(readURL, "/dev/preview/") {
		t.Errorf("expected read_sas_url containing /dev/preview/, got %v", data["read_sas_url"])
	}
}

func TestReview_Resolve(t *testing.T) {
	s, _, jobRepo, recRepo, _ := setupTestServer()

	jobID := "job-resolve-test"
	j := &jobs.Job{
		ID:         jobID,
		UploaderID: "student-1",
		Status:     "needs_review",
		BlobKey:    "raw-uploads/job-resolve-test/cert.pdf",
	}
	jobRepo.Create(context.Background(), j)
	j.Status = "needs_review"

	initialName := "Alice Cooper"
	initialCGPA := "3.75"
	recRepo.records[jobID] = &records.Record{
		ID:         "rec-resolve-1",
		JobID:      jobID,
		Name:       &initialName,
		CGPA:       &initialCGPA,
		FieldsHash: "stale-hash",
	}

	resolvePayload := `{
		"name": "Alice M. Cooper",
		"roll_number": "CS2026-001",
		"register_number": "REG-12345",
		"degree": "Bachelor of Technology",
		"marks": [
			{"subject_code": "CS101", "subject_name": "Data Structures", "marks_obtained": "90", "max_marks": "100", "grade": "A"}
		],
		"cgpa": "3.85",
		"issue_date": "2026-05-20",
		"notes": "Fixed middle initial and updated CGPA per ledger"
	}`

	// 1. Student attempt => 403
	req := httptest.NewRequest(http.MethodPost, "/api/v1/review/"+jobID+"/resolve", strings.NewReader(resolvePayload))
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 for student resolve, got %d", rec.Code)
	}

	// 2. Issuer resolve => 200 and status becomes processed
	req = httptest.NewRequest(http.MethodPost, "/api/v1/review/"+jobID+"/resolve", strings.NewReader(resolvePayload))
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for issuer resolve, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]any
	json.NewDecoder(rec.Body).Decode(&res)
	if res["status"] != "processed" {
		t.Errorf("expected response status 'processed', got %v", res["status"])
	}
	if res["fields_hash"] == "" || res["fields_hash"] == "stale-hash" {
		t.Errorf("expected recomputed fields_hash, got %v", res["fields_hash"])
	}

	// Verify job updated in repo
	savedJob, _ := jobRepo.Get(context.Background(), jobID)
	if savedJob.Status != "processed" {
		t.Errorf("expected job status 'processed', got %s", savedJob.Status)
	}

	// Verify record updated in repo
	savedRec, _ := recRepo.GetByJobID(context.Background(), jobID)
	if *savedRec.Name != "Alice M. Cooper" {
		t.Errorf("expected updated name, got %s", *savedRec.Name)
	}
	if !savedRec.VerifiedByIssuer {
		t.Errorf("expected verified_by_issuer to be true")
	}

	// 3. Resolving again when already processed => 409 Conflict
	req = httptest.NewRequest(http.MethodPost, "/api/v1/review/"+jobID+"/resolve", strings.NewReader(resolvePayload))
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Errorf("expected 409 when resolving non-review job, got %d", rec.Code)
	}
}

func TestReview_Reject(t *testing.T) {
	s, _, jobRepo, recRepo, _ := setupTestServer()

	jobID := "job-reject-test"
	j := &jobs.Job{
		ID:         jobID,
		UploaderID: "student-1",
		Status:     "needs_review",
		BlobKey:    "raw-uploads/job-reject-test/cert.pdf",
	}
	jobRepo.Create(context.Background(), j)
	j.Status = "needs_review"

	recRepo.records[jobID] = &records.Record{
		ID:    "rec-reject-1",
		JobID: jobID,
	}

	// 1. Missing reason => 400
	req := httptest.NewRequest(http.MethodPost, "/api/v1/review/"+jobID+"/reject", strings.NewReader(`{"rejection_reason":""}`))
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty rejection reason, got %d", rec.Code)
	}

	// 2. Issuer reject => 200, status becomes failed
	rejectBody := `{"rejection_reason":"Unreadable scan; university seal blurred"}`
	req = httptest.NewRequest(http.MethodPost, "/api/v1/review/"+jobID+"/reject", strings.NewReader(rejectBody))
	req.Header.Set("X-Dev-User", "issuer-1")
	req.Header.Set("X-Dev-Role", "issuer")
	rec = httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for rejection, got %d: %s", rec.Code, rec.Body.String())
	}

	savedJob, _ := jobRepo.Get(context.Background(), jobID)
	if savedJob.Status != "failed" {
		t.Errorf("expected job status 'failed', got %s", savedJob.Status)
	}
	if savedJob.FailureReason == nil || *savedJob.FailureReason != "Unreadable scan; university seal blurred" {
		t.Errorf("unexpected failure_reason: %v", savedJob.FailureReason)
	}
}

func TestDevPreview_Unit(t *testing.T) {
	s, _, _, _, store := setupTestServer()

	testBytes := []byte("%PDF-1.4 test document content")
	blobKey := "raw-uploads/preview-job/doc.pdf"
	store.data[blobKey] = testBytes

	req := httptest.NewRequest(http.MethodGet, "/dev/preview/"+blobKey, nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/pdf" {
		t.Errorf("expected Content-Type application/pdf, got %s", rec.Header().Get("Content-Type"))
	}
	if !bytes.Equal(rec.Body.Bytes(), testBytes) {
		t.Errorf("preview body mismatch")
	}
}

func TestPublicVerify_SuccessAndPrivacy(t *testing.T) {
	s, _, _, recordRepo, store := setupTestServer()

	jobID := "job-verify-123"
	pubID := "pub-verification-uuid-456"
	name := "Alice Chen"
	roll := "2021-CS-0428"
	reg := "SECRET-REG-9999"
	degree := "Bachelor of Science in Computer Science"
	cgpa := "3.91"
	issueDate := "2025-05-15"

	recordRepo.records[jobID] = &records.Record{
		ID:                   "rec-1",
		JobID:                jobID,
		PublicVerificationID: pubID,
		Name:                 &name,
		RollNumber:           &roll,
		RegisterNumber:       &reg,
		Degree:               &degree,
		MarksJSON:            []any{map[string]any{"course": "CS101", "grade": "A"}},
		CGPA:                 &cgpa,
		IssueDate:            &issueDate,
		SourceHash:           "src-hash-11223344",
		FieldsHash:           "fields-hash-55667788",
		VerifiedByIssuer:     true,
		CreatedAt:            time.Now().UTC(),
	}

	stampedKey := fmt.Sprintf("stamped-documents/%s/stamped_certificate.pdf", jobID)
	store.data[stampedKey] = []byte("%PDF-1.4 stamped certificate")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/verify/"+pubID, nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// 1. Verify response struct
	var pubResp records.PublicVerification
	if err := json.Unmarshal(rec.Body.Bytes(), &pubResp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !pubResp.Verified {
		t.Errorf("expected verified=true")
	}
	if pubResp.PublicVerificationID != pubID {
		t.Errorf("expected public_verification_id=%s, got %s", pubID, pubResp.PublicVerificationID)
	}
	if pubResp.Name == nil || *pubResp.Name != name {
		t.Errorf("expected name=%s, got %v", name, pubResp.Name)
	}
	if pubResp.RollNumber == nil || *pubResp.RollNumber != roll {
		t.Errorf("expected roll_number=%s, got %v", roll, pubResp.RollNumber)
	}
	if pubResp.Degree == nil || *pubResp.Degree != degree {
		t.Errorf("expected degree=%s, got %v", degree, pubResp.Degree)
	}
	if pubResp.CGPA == nil || *pubResp.CGPA != cgpa {
		t.Errorf("expected cgpa=%s, got %v", cgpa, pubResp.CGPA)
	}
	if pubResp.IssueDate == nil || *pubResp.IssueDate != issueDate {
		t.Errorf("expected issue_date=%s, got %v", issueDate, pubResp.IssueDate)
	}
	if pubResp.SourceHash != "src-hash-11223344" || pubResp.FieldsHash != "fields-hash-55667788" {
		t.Errorf("hash mismatch")
	}
	if !pubResp.VerifiedByIssuer {
		t.Errorf("expected verified_by_issuer=true")
	}

	// 2. Strict Privacy Verification: private marks and register_number must NOT be in JSON!
	var rawMap map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &rawMap); err != nil {
		t.Fatalf("failed to decode raw json: %v", err)
	}

	if _, exists := rawMap["register_number"]; exists {
		t.Errorf("PRIVACY VIOLATION: register_number exposed in public verification response!")
	}
	if _, exists := rawMap["marks_json"]; exists {
		t.Errorf("PRIVACY VIOLATION: marks_json exposed in public verification response!")
	}
	if _, exists := rawMap["marks"]; exists {
		t.Errorf("PRIVACY VIOLATION: marks exposed in public verification response!")
	}
}

func TestPublicVerify_NotFound(t *testing.T) {
	s, _, _, _, _ := setupTestServer()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/verify/non-existent-id", nil)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown verification ID, got %d", rec.Code)
	}
}

func TestPublicVerify_RateLimiting(t *testing.T) {
	s, _, _, recordRepo, _ := setupTestServer()

	pubID := "pub-rate-limit-test"
	recordRepo.records["job-rl"] = &records.Record{
		JobID:                "job-rl",
		PublicVerificationID: pubID,
		SourceHash:           "src",
		FieldsHash:           "fld",
	}

	s.RateLimiter().Reset()

	// 30 requests from 192.168.1.50 should succeed
	for i := 1; i <= 30; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/verify/"+pubID, nil)
		req.Header.Set("X-Forwarded-For", "192.168.1.50")
		rec := httptest.NewRecorder()
		s.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d expected 200, got %d: %s", i, rec.Code, rec.Body.String())
		}
	}

	// 31st request from same IP must be rate-limited (429)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/verify/"+pubID, nil)
	req.Header.Set("X-Forwarded-For", "192.168.1.50")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("request 31 expected 429 Too Many Requests, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Retry-After") != "60" {
		t.Errorf("expected Retry-After 60, got %s", rec.Header().Get("Retry-After"))
	}

	// Request from a different IP should succeed
	diffReq := httptest.NewRequest(http.MethodGet, "/api/v1/verify/"+pubID, nil)
	diffReq.Header.Set("X-Forwarded-For", "10.0.0.1")
	diffRec := httptest.NewRecorder()
	s.Handler().ServeHTTP(diffRec, diffReq)
	if diffRec.Code != http.StatusOK {
		t.Errorf("request from different IP expected 200, got %d", diffRec.Code)
	}
}

func TestSignalR_NegotiateEndpoint(t *testing.T) {
	s, _, _, _, _ := setupTestServer()

	// 1. Unauthenticated request returns 401
	unauthReq := httptest.NewRequest(http.MethodPost, "/api/v1/signalr/negotiate", nil)
	unauthRec := httptest.NewRecorder()
	s.Handler().ServeHTTP(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for unauthenticated negotiate, got %d", unauthRec.Code)
	}

	// 2. Authenticated request returns 200 with connection URL and accessToken
	authReq := httptest.NewRequest(http.MethodPost, "/api/v1/signalr/negotiate", nil)
	authReq.Header.Set("X-Dev-User", "student-alice")
	authReq.Header.Set("X-Dev-Role", "student")
	authReq.Header.Set("X-Dev-Name", "Alice Chen")
	authRec := httptest.NewRecorder()
	s.Handler().ServeHTTP(authRec, authReq)

	if authRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for negotiate, got %d: %s", authRec.Code, authRec.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(authRec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode negotiate JSON: %v", err)
	}
	if resp["url"] == "" || resp["accessToken"] == "" {
		t.Errorf("expected non-empty url and accessToken in negotiate response: %+v", resp)
	}
}

func TestSignalR_BroadcastOnNotify(t *testing.T) {
	s, _, jobRepo, _, _ := setupTestServer()

	jobID := "job-sig-notify"
	jobRepo.jobs[jobID] = &jobs.Job{
		ID:         jobID,
		Status:     "processing",
		UploaderID: "user-uploader-123",
	}

	notifyBody := `{"status":"processed","job_id":"job-sig-notify"}`
	req := httptest.NewRequest(http.MethodPost, "/internal/v1/jobs/"+jobID+"/notify", strings.NewReader(notifyBody))
	req.Header.Set("X-Internal-Secret", "test-secret-123")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}

	// Verify dev signalr client recorded broadcast event
	devSig, ok := s.SignalR().(*signalr.DevClient)
	if !ok {
		t.Fatalf("expected DevClient")
	}
	events := devSig.Events()
	if len(events) == 0 {
		t.Fatalf("expected at least 1 signalr broadcast event")
	}

	last := events[len(events)-1]
	if last.JobID != jobID || last.Status != "processed" || last.UploaderID != "user-uploader-123" {
		t.Errorf("unexpected event: %+v", last)
	}
}


