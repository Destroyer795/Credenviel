package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
	"github.com/Destroyer795/Credenviel/api/internal/config"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
	"github.com/Destroyer795/Credenviel/api/internal/normalizer"
	"github.com/Destroyer795/Credenviel/api/internal/records"
	"github.com/Destroyer795/Credenviel/api/internal/signalr"
	"github.com/Destroyer795/Credenviel/api/internal/storage"
)

type Server struct {
	cfg         *config.Config
	userStore   auth.UserStore
	jobRepo     jobs.Repository
	recordRepo  records.Repository
	store       storage.Store
	signer      storage.UploadSigner
	readSigner  storage.ReadSigner
	signalr     signalr.Client
	rateLimiter *RateLimiter
	mux         *http.ServeMux
}

func NewServer(
	cfg *config.Config,
	userStore auth.UserStore,
	jobRepo jobs.Repository,
	recordRepo records.Repository,
	store storage.Store,
	signer storage.UploadSigner,
	readSigner storage.ReadSigner,
	sigClient ...signalr.Client,
) *Server {
	// If readSigner is nil but signer implements ReadSigner, automatically type-assert
	if readSigner == nil && signer != nil {
		if rs, ok := signer.(storage.ReadSigner); ok {
			readSigner = rs
		}
	}

	var sig signalr.Client
	if len(sigClient) > 0 && sigClient[0] != nil {
		sig = sigClient[0]
	} else if cfg != nil && cfg.SignalRURL != "" {
		if azClient, err := signalr.NewAzureClient(cfg.SignalRURL, "credenviel"); err == nil {
			sig = azClient
		} else {
			sig = signalr.NewDevClient()
		}
	} else {
		sig = signalr.NewDevClient()
	}

	s := &Server{
		cfg:         cfg,
		userStore:   userStore,
		jobRepo:     jobRepo,
		recordRepo:  recordRepo,
		store:       store,
		signer:      signer,
		readSigner:  readSigner,
		signalr:     sig,
		rateLimiter: NewRateLimiter(30, 1*time.Minute),
		mux:         http.NewServeMux(),
	}

	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.corsMiddleware(s.mux)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Dev-User, X-Dev-Role, X-Dev-Name, X-User-Role, X-User-ID, X-User-Name, X-Internal-Secret, x-ms-blob-type")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Dev-User, X-Dev-Role, X-Dev-Name, X-User-Role, X-User-ID, X-User-Name, X-Internal-Secret, x-ms-blob-type")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) RateLimiter() *RateLimiter {
	return s.rateLimiter
}

func (s *Server) SetRateLimiter(rl *RateLimiter) {
	s.rateLimiter = rl
}

func (s *Server) SignalR() signalr.Client {
	return s.signalr
}

func (s *Server) routes() {
	// Health check
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)

	// Public verification route (rate limited to 30 requests/minute per IP)
	s.mux.Handle("GET /api/v1/verify/{id}", s.rateLimiter.Wrap(http.HandlerFunc(s.handlePublicVerify)))

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

	// Issuer review routes
	s.mux.Handle("GET /api/v1/review", authMiddleware(http.HandlerFunc(s.handleListReviewQueue)))
	s.mux.Handle("GET /api/v1/review/{id}", authMiddleware(http.HandlerFunc(s.handleGetReviewJob)))
	s.mux.Handle("POST /api/v1/review/{id}/resolve", authMiddleware(http.HandlerFunc(s.handleResolveReview)))
	s.mux.Handle("POST /api/v1/review/{id}/reject", authMiddleware(http.HandlerFunc(s.handleRejectReview)))

	// SignalR negotiate route (authenticated)
	s.mux.Handle("POST /api/v1/signalr/negotiate", authMiddleware(http.HandlerFunc(s.handleSignalRNegotiate)))

	// Internal notify endpoint (secret header protected)
	s.mux.HandleFunc("POST /internal/v1/jobs/{id}/notify", s.handleInternalNotify)

	// Dev endpoints (only registered when AUTH_MODE=dev)
	if s.cfg.AuthMode == "dev" {
		s.mux.HandleFunc("PUT /dev/upload/{job_id}/{file}", s.handleDevUpload)
		s.mux.HandleFunc("GET /dev/preview/{path...}", s.handleDevPreview)
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

	// Broadcast live status event to SignalR group for uploader
	if s.signalr != nil && jobID != "" {
		statusStr, _ := body["status"].(string)
		job, err := s.jobRepo.Get(r.Context(), jobID)
		if err == nil && job != nil {
			_ = s.signalr.BroadcastJobStatus(r.Context(), job.UploaderID, jobID, statusStr, body)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListReviewQueue(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if user.Role != "issuer" {
		http.Error(w, `{"error":"forbidden","message":"only issuers can access the review station"}`, http.StatusForbidden)
		return
	}

	filter := jobs.ListFilter{
		Status:   "needs_review",
		IsIssuer: true,
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

func (s *Server) handleGetReviewJob(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if user.Role != "issuer" {
		http.Error(w, `{"error":"forbidden","message":"only issuers can access the review station"}`, http.StatusForbidden)
		return
	}

	jobID := r.PathValue("id")
	if jobID == "" {
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

	record, err := s.recordRepo.GetByJobID(r.Context(), jobID)
	if err != nil && !errors.Is(err, records.ErrNotFound) {
		http.Error(w, `{"error":"internal_server_error"}`, http.StatusInternalServerError)
		return
	}

	var previewURL string
	if s.readSigner != nil && job.BlobKey != "" {
		previewURL, _ = s.readSigner.SignRead(job.BlobKey, 15*time.Minute)
	}

	resp := map[string]any{
		"job":          job,
		"record":       record,
		"read_sas_url": previewURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type resolveReviewRequest struct {
	Name           *string `json:"name"`
	RollNumber     *string `json:"roll_number"`
	RegisterNumber *string `json:"register_number"`
	Degree         *string `json:"degree"`
	Marks          any     `json:"marks"`
	MarksJSON      any     `json:"marks_json"`
	CGPA           *string `json:"cgpa"`
	IssueDate      *string `json:"issue_date"`
	DocumentType   *string `json:"document_type"`
	Attributes     any     `json:"attributes"`
	AttributesJSON any     `json:"attributes_json"`
	Notes          string  `json:"notes"`
}

func (s *Server) handleResolveReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if user.Role != "issuer" {
		http.Error(w, `{"error":"forbidden","message":"only issuers can resolve reviews"}`, http.StatusForbidden)
		return
	}

	jobID := r.PathValue("id")
	if jobID == "" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	var req resolveReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad_request","message":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	marks := req.Marks
	if marks == nil {
		marks = req.MarksJSON
	}

	attrs := req.Attributes
	if attrs == nil {
		attrs = req.AttributesJSON
	}

	fieldsMap := map[string]any{
		"name":            req.Name,
		"roll_number":     req.RollNumber,
		"register_number": req.RegisterNumber,
		"degree":          req.Degree,
		"marks_json":      marks,
		"cgpa":            req.CGPA,
		"issue_date":      req.IssueDate,
		"document_type":   req.DocumentType,
		"attributes_json": attrs,
	}

	fieldsHash, err := normalizer.ComputeFieldsHash(fieldsMap)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"bad_request","message":"normalization failed: %s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	existingRecord, _ := s.recordRepo.GetByJobID(r.Context(), jobID)
	diff := map[string]any{
		"notes":       req.Notes,
		"resolved_by": user.ID,
		"resolved_at": time.Now().UTC().Format(time.RFC3339),
	}
	if existingRecord != nil {
		diff["prior"] = map[string]any{
			"name":            existingRecord.Name,
			"roll_number":     existingRecord.RollNumber,
			"register_number": existingRecord.RegisterNumber,
			"degree":          existingRecord.Degree,
			"marks_json":      existingRecord.MarksJSON,
			"cgpa":            existingRecord.CGPA,
			"issue_date":      existingRecord.IssueDate,
			"document_type":   existingRecord.DocumentType,
			"attributes_json": existingRecord.AttributesJSON,
			"fields_hash":     existingRecord.FieldsHash,
		}
	}

	resolved := records.ResolvedFields{
		Name:           req.Name,
		RollNumber:     req.RollNumber,
		RegisterNumber: req.RegisterNumber,
		Degree:         req.Degree,
		MarksJSON:      marks,
		CGPA:           req.CGPA,
		IssueDate:      req.IssueDate,
		DocumentType:   req.DocumentType,
		AttributesJSON: attrs,
	}

	if err := s.recordRepo.Resolve(r.Context(), jobID, resolved, fieldsHash, diff, user.ID); err != nil {
		if errors.Is(err, jobs.ErrNotFound) {
			http.Error(w, `{"error":"not_found","message":"job not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, records.ErrInvalidStatus) {
			http.Error(w, `{"error":"conflict","message":"job is not in needs_review status"}`, http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"internal_server_error","message":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if s.signalr != nil {
		job, err := s.jobRepo.Get(r.Context(), jobID)
		if err == nil && job != nil {
			_ = s.signalr.BroadcastJobStatus(r.Context(), job.UploaderID, jobID, "processed", map[string]any{
				"job_id":      jobID,
				"status":      "processed",
				"fields_hash": fieldsHash,
			})
		}
	}

	resp := map[string]any{
		"status":      "processed",
		"job_id":      jobID,
		"fields_hash": fieldsHash,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type rejectReviewRequest struct {
	RejectionReason string `json:"rejection_reason"`
}

func (s *Server) handleRejectReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if user.Role != "issuer" {
		http.Error(w, `{"error":"forbidden","message":"only issuers can reject reviews"}`, http.StatusForbidden)
		return
	}

	jobID := r.PathValue("id")
	if jobID == "" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	var req rejectReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad_request","message":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	reason := strings.TrimSpace(req.RejectionReason)
	if reason == "" {
		http.Error(w, `{"error":"bad_request","message":"rejection_reason is required"}`, http.StatusBadRequest)
		return
	}

	if err := s.recordRepo.Reject(r.Context(), jobID, reason, user.ID); err != nil {
		if errors.Is(err, jobs.ErrNotFound) {
			http.Error(w, `{"error":"not_found","message":"job not found"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, records.ErrInvalidStatus) {
			http.Error(w, `{"error":"conflict","message":"job is not in needs_review status"}`, http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"internal_server_error","message":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if s.signalr != nil {
		job, err := s.jobRepo.Get(r.Context(), jobID)
		if err == nil && job != nil {
			_ = s.signalr.BroadcastJobStatus(r.Context(), job.UploaderID, jobID, "failed", map[string]any{
				"job_id":           jobID,
				"status":           "failed",
				"rejection_reason": reason,
			})
		}
	}

	resp := map[string]any{
		"status":           "failed",
		"job_id":           jobID,
		"rejection_reason": reason,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handlePublicVerify(w http.ResponseWriter, r *http.Request) {
	publicID := r.PathValue("id")
	if publicID == "" {
		http.Error(w, `{"error":"not_found","message":"verification record not found"}`, http.StatusNotFound)
		return
	}

	rec, err := s.recordRepo.GetByPublicVerificationID(r.Context(), publicID)
	if err != nil {
		if errors.Is(err, records.ErrNotFound) {
			http.Error(w, `{"error":"not_found","message":"verification record not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"internal_server_error","message":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	var stampedURL string
	if s.readSigner != nil && rec.JobID != "" {
		stampedKey := fmt.Sprintf("stamped-documents/%s/stamped_certificate.pdf", rec.JobID)
		stampedURL, _ = s.readSigner.SignRead(stampedKey, 15*time.Minute)
	}

	resp := records.PublicVerification{
		Verified:             true,
		PublicVerificationID: rec.PublicVerificationID,
		Name:                 rec.Name,
		RollNumber:           rec.RollNumber,
		Degree:               rec.Degree,
		CGPA:                 rec.CGPA,
		IssueDate:            rec.IssueDate,
		DocumentType:         rec.DocumentType,
		AttributesJSON:       rec.AttributesJSON,
		SourceHash:           rec.SourceHash,
		FieldsHash:           rec.FieldsHash,
		VerifiedByIssuer:     rec.VerifiedByIssuer,
		IssuedAt:             rec.CreatedAt,
		StampedDocumentURL:   stampedURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleSignalRNegotiate(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.FromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if s.signalr == nil {
		http.Error(w, `{"error":"service_unavailable","message":"signalr service not configured"}`, http.StatusServiceUnavailable)
		return
	}

	resp, err := s.signalr.GenerateNegotiateResponse(r.Context(), user.ID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"internal_server_error","message":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleDevPreview(w http.ResponseWriter, r *http.Request) {
	blobPath := r.PathValue("path")
	if blobPath == "" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	rc, err := s.store.Open(r.Context(), blobPath)
	if err != nil {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}
	defer rc.Close()

	lower := strings.ToLower(blobPath)
	if strings.HasSuffix(lower, ".pdf") {
		w.Header().Set("Content-Type", "application/pdf")
	} else if strings.HasSuffix(lower, ".png") {
		w.Header().Set("Content-Type", "image/png")
	} else if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") {
		w.Header().Set("Content-Type", "image/jpeg")
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	io.Copy(w, rc)
}

