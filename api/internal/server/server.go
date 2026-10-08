package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
	"github.com/Destroyer795/Credenviel/api/internal/config"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

type Server struct {
	cfg       *config.Config
	userStore auth.UserStore
	jobRepo   jobs.Repository
	store     storage.Store
	signer    storage.UploadSigner
	mux       *http.ServeMux
}

func NewServer(
	cfg *config.Config,
	userStore auth.UserStore,
	jobRepo jobs.Repository,
	store storage.Store,
	signer storage.UploadSigner,
) *Server {
	s := &Server{
		cfg:       cfg,
		userStore: userStore,
		jobRepo:   jobRepo,
		store:     store,
		signer:    signer,
		mux:       http.NewServeMux(),
	}

	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	// Health check
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)

	var identitySource auth.IdentitySource
	switch s.cfg.AuthMode {
	case "dev":
		identitySource = auth.DevHeaderSource{}
	case "entra", "jwt":
		identitySource = auth.NewJWTIdentitySource(auth.JWTConfig{
			TenantID:        s.cfg.EntraTenantID,
			ClientID:        s.cfg.EntraClientID,
			Audience:        s.cfg.EntraAudience,
			SymmetricSecret: s.cfg.JWTSymmetricSecret,
		})
	default:
		identitySource = auth.DevHeaderSource{}
	}

	// Auth middleware
	authMiddleware := auth.Middleware(identitySource, s.userStore)

	// Authenticated jobs routes
	s.mux.Handle("POST /api/v1/jobs", authMiddleware(http.HandlerFunc(s.handleCreateJob)))
	s.mux.Handle("GET /api/v1/jobs", authMiddleware(http.HandlerFunc(s.handleListJobs)))
	s.mux.Handle("GET /api/v1/jobs/{id}", authMiddleware(http.HandlerFunc(s.handleGetJob)))

	// Internal notify endpoint (secret header protected)
	s.mux.HandleFunc("POST /internal/v1/jobs/{id}/notify", s.handleInternalNotify)

	// Dev upload endpoint (only registered when AUTH_MODE=dev)
	if s.cfg.AuthMode == "dev" {
		s.mux.HandleFunc("PUT /dev/upload/{job_id}/{file}", s.handleDevUpload)
	}
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

type createJobRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

type createJobResponse struct {
	JobID   string             `json:"job_id"`
	BlobKey string             `json:"blob_key"`
	Upload  storage.UploadInfo `json:"upload"`
}

func (s *Server) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req createJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad_request","message":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	sanitizedName, err := jobs.SanitizeAndValidate(req.Filename, req.ContentType, req.SizeBytes, s.cfg.MaxUploadBytes)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"bad_request","message":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	jobID, err := jobs.NewUUIDv4()
	if err != nil {
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	blobKey := fmt.Sprintf("raw-uploads/%s/%s", jobID, sanitizedName)
	isIssuer := user.Role == "issuer"

	job := &jobs.Job{
		ID:               jobID,
		UploaderID:       user.ID,
		BlobKey:          blobKey,
		UploaderIsIssuer: isIssuer,
	}

	if err := s.jobRepo.Create(r.Context(), job); err != nil {
		http.Error(w, `{"error":"internal_server_error","message":"failed to create job"}`, http.StatusInternalServerError)
		return
	}

	uploadInfo, err := s.signer.SignUpload(jobID, sanitizedName, 15*time.Minute)
	if err != nil {
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	resp := createJobResponse{
		JobID:   jobID,
		BlobKey: blobKey,
		Upload:  uploadInfo,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleDevUpload(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("job_id")
	file := r.PathValue("file")

	if jobID == "" || file == "" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	job, err := s.jobRepo.Get(r.Context(), jobID)
	if err != nil {
		if errors.Is(err, jobs.ErrNotFound) {
			http.Error(w, `{"error":"not_found","message":"job not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	expectedKey := fmt.Sprintf("raw-uploads/%s/%s", jobID, file)
	if job.BlobKey != expectedKey {
		http.Error(w, `{"error":"not_found","message":"filename mismatch for job"}`, http.StatusNotFound)
		return
	}

	if job.Status != "awaiting_upload" {
		http.Error(w, `{"error":"conflict","message":"job is not in awaiting_upload status"}`, http.StatusConflict)
		return
	}

	_, err = s.store.Put(r.Context(), job.BlobKey, r.Body, s.cfg.MaxUploadBytes)
	if err != nil {
		if errors.Is(err, storage.ErrTooLarge) {
			http.Error(w, `{"error":"payload_too_large","message":"file exceeds maximum allowed upload size"}`, http.StatusRequestEntityTooLarge)
			return
		}
		if errors.Is(err, storage.ErrPathTraversal) {
			http.Error(w, `{"error":"bad_request","message":"invalid file path"}`, http.StatusBadRequest)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"internal_server_error","message":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"uploaded"}`))
}

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	statusFilter := r.URL.Query().Get("status")
	if statusFilter != "" && !jobs.AllowedStatuses[statusFilter] {
		http.Error(w, `{"error":"bad_request","message":"invalid status filter"}`, http.StatusBadRequest)
		return
	}

	filter := jobs.ListFilter{
		UploaderID: user.ID,
		Status:     statusFilter,
		IsIssuer:   user.Role == "issuer",
	}

	list, err := s.jobRepo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	if list == nil {
		list = []*jobs.Job{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	job, err := s.jobRepo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, jobs.ErrNotFound) {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	// Security: students can only see their own jobs.
	// Other student's job returns 404 (PROPOSED D-026) to prevent leaking existence.
	if user.Role != "issuer" && job.UploaderID != user.ID {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (s *Server) handleInternalNotify(w http.ResponseWriter, r *http.Request) {
	secretHeader := r.Header.Get("X-Internal-Secret")
	if s.cfg.InternalAPIKey == "" || secretHeader == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if subtle.ConstantTimeCompare([]byte(secretHeader), []byte(s.cfg.InternalAPIKey)) != 1 {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	jobID := r.PathValue("id")
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)

	log.Printf("[INTERNAL NOTIFY] job_id=%s body=%v", jobID, body)
	w.WriteHeader(http.StatusNoContent)
}
