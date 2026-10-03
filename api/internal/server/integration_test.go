//go:build integration

package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Destroyer795/Credenviel/api/internal/config"
	"github.com/Destroyer795/Credenviel/api/internal/db"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

const testDBName = "credenviel_test"

var initDBOnce sync.Once

func getPGConfig() (host, port, user, pass string) {
	host = os.Getenv("PGHOST")
	if host == "" {
		host = "localhost"
	}
	port = os.Getenv("PGPORT")
	if port == "" {
		port = "5433"
	}
	user = os.Getenv("PGUSER")
	if user == "" {
		user = "credenviel"
	}
	pass = os.Getenv("PGPASSWORD")
	if pass == "" {
		pass = "localdev"
	}
	return
}

func getMaintenanceDSN() string {
	host, port, user, pass := getPGConfig()
	return fmt.Sprintf("postgres://%s:%s@%s:%s/postgres?sslmode=disable", user, pass, host, port)
}

func getTestDSN() string {
	host, port, user, pass := getPGConfig()
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, testDBName)
}

func ensureTestDB(t *testing.T) {
	initDBOnce.Do(func() {
		ctx := context.Background()
		maintPool, err := pgxpool.New(ctx, getMaintenanceDSN())
		if err != nil {
			t.Fatalf("failed to connect to maintenance db: %v", err)
		}
		defer maintPool.Close()

		// Check if credenviel_test exists
		var exists bool
		err = maintPool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)", testDBName).Scan(&exists)
		if err != nil {
			t.Fatalf("failed to check test db existence: %v", err)
		}

		if !exists {
			_, err = maintPool.Exec(ctx, fmt.Sprintf("CREATE DATABASE %s", testDBName))
			if err != nil {
				t.Fatalf("failed to create test db: %v", err)
			}
		}

		// Connect to test db and apply migrations
		testPool, err := pgxpool.New(ctx, getTestDSN())
		if err != nil {
			t.Fatalf("failed to connect to %s: %v", testDBName, err)
		}
		defer testPool.Close()

		// Read and execute migration files
		repoRoot := filepath.Join("..", "..", "..")
		files := []string{
			filepath.Join(repoRoot, "db", "migrations", "001_initial_schema.up.sql"),
			filepath.Join(repoRoot, "db", "migrations", "002_status_guard.up.sql"),
			filepath.Join(repoRoot, "db", "local", "001_local_queue.up.sql"),
		}

		for _, fpath := range files {
			sql, err := os.ReadFile(fpath)
			if err != nil {
				t.Fatalf("failed to read migration file %s: %v", fpath, err)
			}
			if _, err := testPool.Exec(ctx, string(sql)); err != nil {
				t.Fatalf("failed to execute migration %s: %v", fpath, err)
			}
		}
	})
}

func setupIntegrationServer(t *testing.T) (*Server, *db.DB, *storage.LocalFS, string) {
	ensureTestDB(t)

	ctx := context.Background()
	dsn := getTestDSN()

	// Connect to test database
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to connect to test db: %v", err)
	}

	// Safety check: ensure database is credenviel_test
	var currentDB string
	if err := pool.QueryRow(ctx, "SELECT current_database()").Scan(&currentDB); err != nil {
		pool.Close()
		t.Fatalf("failed to verify current database: %v", err)
	}
	if currentDB != testDBName {
		pool.Close()
		t.Fatalf("SAFETY: connected to %q instead of %q. Aborting.", currentDB, testDBName)
	}

	// Clean tables before test
	_, err = pool.Exec(ctx, "TRUNCATE TABLE records, jobs, users, local_queue_messages CASCADE")
	if err != nil {
		pool.Close()
		t.Fatalf("failed to truncate test tables: %v", err)
	}
	pool.Close()

	database, err := db.New(ctx, dsn)
	if err != nil {
		t.Fatalf("failed to initialize db: %v", err)
	}

	// Setup local storage in tmp directory
	tmpDir := t.TempDir()
	store, err := storage.NewLocalFS(tmpDir)
	if err != nil {
		database.Close()
		t.Fatalf("failed to initialize storage: %v", err)
	}

	cfg := &config.Config{
		Host:             "127.0.0.1",
		Port:             "8080",
		AppEnv:           "local",
		AuthMode:         "dev",
		InternalAPIKey:   "secret-123",
		MaxUploadBytes:   4194304,
		PublicBaseURL:    "http://127.0.0.1:8080",
		LocalStorageRoot: tmpDir,
	}

	signer := storage.NewLocalSigner(cfg.PublicBaseURL)
	srv := NewServer(cfg, database, database, store, signer)

	return srv, database, store, tmpDir
}

// Test 2: Create job integration test
func TestCreateJob_Integration(t *testing.T) {
	srv, database, _, _ := setupIntegrationServer(t)
	defer database.Close()

	// 1. Create job as student with path traversal filename
	body := `{"filename":"../../etc/passwd.pdf","content_type":"application/pdf","size_bytes":1024}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(body))
	req.Header.Set("X-Dev-User", "student-entra-42")
	req.Header.Set("X-Dev-Role", "student")
	req.Header.Set("X-Dev-Name", "Student Forty-Two")

	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp createJobResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Verify path traversal neutralized to passwd.pdf
	expectedBlobKey := fmt.Sprintf("raw-uploads/%s/passwd.pdf", resp.JobID)
	if resp.BlobKey != expectedBlobKey {
		t.Errorf("expected blob_key %q, got %q", expectedBlobKey, resp.BlobKey)
	}

	// Verify database row
	job, err := database.Get(context.Background(), resp.JobID)
	if err != nil {
		t.Fatalf("failed to fetch job from db: %v", err)
	}

	if job.Status != "awaiting_upload" {
		t.Errorf("expected status awaiting_upload, got %q", job.Status)
	}
	if job.UploaderIsIssuer != false {
		t.Errorf("expected uploader_is_issuer = false for student")
	}

	// Verify JIT user created
	var userName, userRole string
	err = database.Pool().QueryRow(
		context.Background(),
		"SELECT name, role FROM users WHERE id = $1",
		job.UploaderID,
	).Scan(&userName, &userRole)
	if err != nil {
		t.Fatalf("failed to verify JIT user in db: %v", err)
	}
	if userName != "Student Forty-Two" || userRole != "student" {
		t.Errorf("unexpected JIT user in db: name=%q, role=%q", userName, userRole)
	}

	// 2. Create job as issuer: verify uploader_is_issuer = true
	issuerBody := `{"filename":"transcript.png","content_type":"image/png","size_bytes":2048}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(issuerBody))
	req2.Header.Set("X-Dev-User", "issuer-entra-1")
	req2.Header.Set("X-Dev-Role", "issuer")
	req2.Header.Set("X-Dev-Name", "Exam Controller")

	rec2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec2.Code, rec2.Body.String())
	}

	var resp2 createJobResponse
	json.NewDecoder(rec2.Body).Decode(&resp2)
	job2, err := database.Get(context.Background(), resp2.JobID)
	if err != nil {
		t.Fatalf("failed to fetch issuer job: %v", err)
	}
	if job2.UploaderIsIssuer != true {
		t.Errorf("expected uploader_is_issuer = true for issuer job")
	}
}

// Test 5: Job scoping integration test
func TestJobScoping_Integration(t *testing.T) {
	srv, database, _, _ := setupIntegrationServer(t)
	defer database.Close()

	// Create job for Student 1
	body1 := `{"filename":"cert1.pdf","content_type":"application/pdf","size_bytes":100}`
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(body1))
	req1.Header.Set("X-Dev-User", "student-1")
	req1.Header.Set("X-Dev-Role", "student")
	req1.Header.Set("X-Dev-Name", "Student One")
	rec1 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec1, req1)
	var resp1 createJobResponse
	json.NewDecoder(rec1.Body).Decode(&resp1)

	// Create job for Student 2
	body2 := `{"filename":"cert2.pdf","content_type":"application/pdf","size_bytes":100}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(body2))
	req2.Header.Set("X-Dev-User", "student-2")
	req2.Header.Set("X-Dev-Role", "student")
	req2.Header.Set("X-Dev-Name", "Student Two")
	rec2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec2, req2)
	var resp2 createJobResponse
	json.NewDecoder(rec2.Body).Decode(&resp2)

	// Student 1 cannot view Student 2's job (404)
	reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+resp2.JobID, nil)
	reqGet.Header.Set("X-Dev-User", "student-1")
	reqGet.Header.Set("X-Dev-Role", "student")
	reqGet.Header.Set("X-Dev-Name", "Student One")
	recGet := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recGet, reqGet)
	if recGet.Code != http.StatusNotFound {
		t.Errorf("expected 404 for other student's job, got %d", recGet.Code)
	}

	// Student 1 can view Student 1's job (200)
	reqGetOwn := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+resp1.JobID, nil)
	reqGetOwn.Header.Set("X-Dev-User", "student-1")
	reqGetOwn.Header.Set("X-Dev-Role", "student")
	reqGetOwn.Header.Set("X-Dev-Name", "Student One")
	recGetOwn := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recGetOwn, reqGetOwn)
	if recGetOwn.Code != http.StatusOK {
		t.Errorf("expected 200 for own job, got %d", recGetOwn.Code)
	}

	// Issuer can view Student 2's job (200)
	reqGetIssuer := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+resp2.JobID, nil)
	reqGetIssuer.Header.Set("X-Dev-User", "issuer-1")
	reqGetIssuer.Header.Set("X-Dev-Role", "issuer")
	reqGetIssuer.Header.Set("X-Dev-Name", "Dean")
	recGetIssuer := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recGetIssuer, reqGetIssuer)
	if recGetIssuer.Code != http.StatusOK {
		t.Errorf("expected 200 for issuer viewing job, got %d", recGetIssuer.Code)
	}

	// List scoping: Student 1 list sees only 1 job
	reqListStudent := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	reqListStudent.Header.Set("X-Dev-User", "student-1")
	reqListStudent.Header.Set("X-Dev-Role", "student")
	reqListStudent.Header.Set("X-Dev-Name", "Student One")
	recListStudent := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recListStudent, reqListStudent)
	var studentJobs []*jobs.Job
	json.NewDecoder(recListStudent.Body).Decode(&studentJobs)
	if len(studentJobs) != 1 || studentJobs[0].ID != resp1.JobID {
		t.Errorf("expected student list to have exactly job 1, got %d jobs", len(studentJobs))
	}

	// List scoping: Issuer sees both jobs
	reqListIssuer := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	reqListIssuer.Header.Set("X-Dev-User", "issuer-1")
	reqListIssuer.Header.Set("X-Dev-Role", "issuer")
	reqListIssuer.Header.Set("X-Dev-Name", "Dean")
	recListIssuer := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recListIssuer, reqListIssuer)
	var issuerJobs []*jobs.Job
	json.NewDecoder(recListIssuer.Body).Decode(&issuerJobs)
	if len(issuerJobs) != 2 {
		t.Errorf("expected issuer list to have 2 jobs, got %d", len(issuerJobs))
	}
}

// Test 6: Dev upload integration test
func TestDevUpload_Integration(t *testing.T) {
	srv, database, store, tmpDir := setupIntegrationServer(t)
	defer database.Close()

	// 1. Create a job
	body := `{"filename":"document.pdf","content_type":"application/pdf","size_bytes":1000}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", strings.NewReader(body))
	req.Header.Set("X-Dev-User", "student-1")
	req.Header.Set("X-Dev-Role", "student")
	req.Header.Set("X-Dev-Name", "Student")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	var resp createJobResponse
	json.NewDecoder(rec.Body).Decode(&resp)

	// 2. Upload valid file content
	pdfBytes := bytes.Repeat([]byte("test pdf content "), 50)
	putURL := fmt.Sprintf("/dev/upload/%s/document.pdf", resp.JobID)
	putReq := httptest.NewRequest(http.MethodPut, putURL, bytes.NewReader(pdfBytes))
	putRec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(putRec, putReq)

	if putRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for dev upload, got %d: %s", putRec.Code, putRec.Body.String())
	}

	// Verify file exists in store
	exists, err := store.Exists(context.Background(), resp.BlobKey)
	if err != nil || !exists {
		t.Fatalf("expected file to exist in store at %q", resp.BlobKey)
	}

	// Verify no tmp files left behind
	jobDir := filepath.Join(tmpDir, "raw-uploads", resp.JobID)
	entries, _ := os.ReadDir(jobDir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".tmp") {
			t.Errorf("temporary file left behind: %s", entry.Name())
		}
	}

	// 3. Oversize upload exceeds cap
	hugeBytes := bytes.Repeat([]byte("A"), 4194304+10)
	putReqHuge := httptest.NewRequest(http.MethodPut, putURL, bytes.NewReader(hugeBytes))
	putRecHuge := httptest.NewRecorder()
	srv.Handler().ServeHTTP(putRecHuge, putReqHuge)

	if putRecHuge.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("expected 413 for oversize upload, got %d", putRecHuge.Code)
	}
}
