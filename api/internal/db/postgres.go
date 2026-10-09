package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
	"github.com/Destroyer795/Credenviel/api/internal/records"
)

// DB encapsulates the pgx connection pool and implements repositories.
type DB struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, dsn string) (*DB, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Ensure flexible document columns exist
	_, _ = pool.Exec(ctx, `
		ALTER TABLE records ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'grade_sheet';
		ALTER TABLE records ADD COLUMN IF NOT EXISTS attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;
		CREATE INDEX IF NOT EXISTS idx_records_document_type ON records(document_type);
	`)

	return &DB{pool: pool}, nil
}

func (d *DB) Close() {
	if d.pool != nil {
		d.pool.Close()
	}
}

// Pool returns the underlying pgxpool.Pool.
func (d *DB) Pool() *pgxpool.Pool {
	return d.pool
}

// UpsertUser performs JIT provisioning of a user based on Entra claims.
func (d *DB) UpsertUser(ctx context.Context, ident auth.Identity) (auth.User, error) {
	query := `
		INSERT INTO users (entra_id, role, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (entra_id) DO UPDATE
		SET role = EXCLUDED.role, name = EXCLUDED.name
		RETURNING id, entra_id, role, name
	`

	var u auth.User
	err := d.pool.QueryRow(ctx, query, ident.EntraID, ident.Role, ident.Name).Scan(
		&u.ID,
		&u.EntraID,
		&u.Role,
		&u.Name,
	)
	if err != nil {
		return auth.User{}, fmt.Errorf("failed to upsert user: %w", err)
	}

	return u, nil
}

// Create inserts a new job into the database.
func (d *DB) Create(ctx context.Context, j *jobs.Job) error {
	query := `
		INSERT INTO jobs (id, uploader_id, status, blob_key, uploader_is_issuer)
		VALUES ($1, $2, 'awaiting_upload', $3, $4)
		RETURNING created_at, updated_at
	`

	err := d.pool.QueryRow(ctx, query, j.ID, j.UploaderID, j.BlobKey, j.UploaderIsIssuer).Scan(
		&j.CreatedAt,
		&j.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert job: %w", err)
	}
	j.Status = "awaiting_upload"
	return nil
}

// Get fetches a job by ID.
func (d *DB) Get(ctx context.Context, id string) (*jobs.Job, error) {
	query := `
		SELECT id, uploader_id, status, blob_key, failure_reason, uploader_is_issuer, created_at, updated_at
		FROM jobs
		WHERE id = $1
	`

	var j jobs.Job
	err := d.pool.QueryRow(ctx, query, id).Scan(
		&j.ID,
		&j.UploaderID,
		&j.Status,
		&j.BlobKey,
		&j.FailureReason,
		&j.UploaderIsIssuer,
		&j.CreatedAt,
		&j.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, jobs.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get job: %w", err)
	}

	return &j, nil
}

// List queries jobs with filtering based on caller role and parameters.
func (d *DB) List(ctx context.Context, filter jobs.ListFilter) ([]*jobs.Job, error) {
	var conditions []string
	var args []any
	argIdx := 1

	if !filter.IsIssuer {
		conditions = append(conditions, fmt.Sprintf("uploader_id = $%d", argIdx))
		args = append(args, filter.UploaderID)
		argIdx++
	}

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, filter.Status)
		argIdx++
	}

	query := "SELECT id, uploader_id, status, blob_key, failure_reason, uploader_is_issuer, created_at, updated_at FROM jobs"
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY created_at DESC"

	rows, err := d.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list jobs: %w", err)
	}
	defer rows.Close()

	var result []*jobs.Job
	for rows.Next() {
		var j jobs.Job
		if err := rows.Scan(
			&j.ID,
			&j.UploaderID,
			&j.Status,
			&j.BlobKey,
			&j.FailureReason,
			&j.UploaderIsIssuer,
			&j.CreatedAt,
			&j.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan job row: %w", err)
		}
		result = append(result, &j)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error reading jobs rows: %w", err)
	}

	return result, nil
}

// GetByJobID fetches the record associated with a job.
func (d *DB) GetByJobID(ctx context.Context, jobID string) (*records.Record, error) {
	query := `
		SELECT id, job_id, name, roll_number, register_number, degree,
		       marks_json, cgpa::text, issue_date::text, confidence_json,
		       source_hash, fields_hash, public_verification_id, verified_by_issuer,
		       reviewed_by, reviewed_at, corrections_json, created_at,
		       coalesce(document_type, 'grade_sheet'), coalesce(attributes_json, '{}'::jsonb)
		FROM records
		WHERE job_id = $1
	`

	var r records.Record
	var marksBytes, confBytes, corrBytes, attrBytes []byte

	err := d.pool.QueryRow(ctx, query, jobID).Scan(
		&r.ID,
		&r.JobID,
		&r.Name,
		&r.RollNumber,
		&r.RegisterNumber,
		&r.Degree,
		&marksBytes,
		&r.CGPA,
		&r.IssueDate,
		&confBytes,
		&r.SourceHash,
		&r.FieldsHash,
		&r.PublicVerificationID,
		&r.VerifiedByIssuer,
		&r.ReviewedBy,
		&r.ReviewedAt,
		&corrBytes,
		&r.CreatedAt,
		&r.DocumentType,
		&attrBytes,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "22P02") {
			return nil, records.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get record: %w", err)
	}

	if len(marksBytes) > 0 {
		_ = json.Unmarshal(marksBytes, &r.MarksJSON)
	}
	if len(confBytes) > 0 {
		_ = json.Unmarshal(confBytes, &r.ConfidenceJSON)
	}
	if len(corrBytes) > 0 {
		_ = json.Unmarshal(corrBytes, &r.CorrectionsJSON)
	}
	if len(attrBytes) > 0 {
		_ = json.Unmarshal(attrBytes, &r.AttributesJSON)
	}

	return &r, nil
}

// GetByPublicVerificationID fetches a record by its public verification ID.
func (d *DB) GetByPublicVerificationID(ctx context.Context, publicVerificationID string) (*records.Record, error) {
	query := `
		SELECT id, job_id, name, roll_number, register_number, degree,
		       marks_json, cgpa::text, issue_date::text, confidence_json,
		       source_hash, fields_hash, public_verification_id, verified_by_issuer,
		       reviewed_by, reviewed_at, corrections_json, created_at,
		       coalesce(document_type, 'grade_sheet'), coalesce(attributes_json, '{}'::jsonb)
		FROM records
		WHERE public_verification_id = $1 OR job_id = $1
	`

	var r records.Record
	var marksBytes, confBytes, corrBytes, attrBytes []byte

	err := d.pool.QueryRow(ctx, query, publicVerificationID).Scan(
		&r.ID,
		&r.JobID,
		&r.Name,
		&r.RollNumber,
		&r.RegisterNumber,
		&r.Degree,
		&marksBytes,
		&r.CGPA,
		&r.IssueDate,
		&confBytes,
		&r.SourceHash,
		&r.FieldsHash,
		&r.PublicVerificationID,
		&r.VerifiedByIssuer,
		&r.ReviewedBy,
		&r.ReviewedAt,
		&corrBytes,
		&r.CreatedAt,
		&r.DocumentType,
		&attrBytes,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "22P02") {
			return nil, records.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get record by verification ID: %w", err)
	}

	if len(marksBytes) > 0 {
		_ = json.Unmarshal(marksBytes, &r.MarksJSON)
	}
	if len(confBytes) > 0 {
		_ = json.Unmarshal(confBytes, &r.ConfidenceJSON)
	}
	if len(corrBytes) > 0 {
		_ = json.Unmarshal(corrBytes, &r.CorrectionsJSON)
	}
	if len(attrBytes) > 0 {
		_ = json.Unmarshal(attrBytes, &r.AttributesJSON)
	}

	return &r, nil
}

// Resolve confirms or corrects fields on a record, re-seals fields_hash, updates status to processed.
func (d *DB) Resolve(ctx context.Context, jobID string, resolved records.ResolvedFields, fieldsHash string, diff map[string]any, reviewerID string) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1 FOR UPDATE", jobID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return jobs.ErrNotFound
		}
		return fmt.Errorf("failed to lock job: %w", err)
	}

	if status != "needs_review" {
		return records.ErrInvalidStatus
	}

	marksJSON, err := json.Marshal(resolved.MarksJSON)
	if err != nil {
		return fmt.Errorf("failed to marshal marks_json: %w", err)
	}

	diffJSON, err := json.Marshal(diff)
	if err != nil {
		return fmt.Errorf("failed to marshal corrections diff: %w", err)
	}

	var attrsJSON []byte
	if resolved.AttributesJSON != nil {
		attrsJSON, _ = json.Marshal(resolved.AttributesJSON)
	}

	updateRecordQuery := `
		UPDATE records
		SET name = $2,
		    roll_number = $3,
		    register_number = $4,
		    degree = $5,
		    marks_json = $6::jsonb,
		    cgpa = nullif($7, '')::numeric,
		    issue_date = nullif($8, '')::date,
		    fields_hash = $9,
		    verified_by_issuer = true,
		    reviewed_by = $10,
		    reviewed_at = clock_timestamp(),
		    corrections_json = coalesce(corrections_json, '{}'::jsonb) || $11::jsonb,
		    document_type = coalesce($12, document_type),
		    attributes_json = coalesce($13::jsonb, attributes_json)
		WHERE job_id = $1
	`
	_, err = tx.Exec(ctx, updateRecordQuery,
		jobID,
		resolved.Name,
		resolved.RollNumber,
		resolved.RegisterNumber,
		resolved.Degree,
		marksJSON,
		resolved.CGPA,
		resolved.IssueDate,
		fieldsHash,
		reviewerID,
		diffJSON,
		resolved.DocumentType,
		attrsJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to update record: %w", err)
	}

	_, err = tx.Exec(ctx, "UPDATE jobs SET status = 'processed' WHERE id = $1", jobID)
	if err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
	}

	return tx.Commit(ctx)
}

// Reject sets job status to failed and updates audit trail in record.
func (d *DB) Reject(ctx context.Context, jobID string, reason string, reviewerID string) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx, "SELECT status FROM jobs WHERE id = $1 FOR UPDATE", jobID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return jobs.ErrNotFound
		}
		return fmt.Errorf("failed to lock job: %w", err)
	}

	if status != "needs_review" {
		return records.ErrInvalidStatus
	}

	_, err = tx.Exec(ctx, "UPDATE jobs SET status = 'failed', failure_reason = $2 WHERE id = $1", jobID, reason)
	if err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
	}

	auditPayload := map[string]any{
		"rejection_reason": reason,
		"rejected_by":      reviewerID,
		"rejected_at":      time.Now().UTC().Format(time.RFC3339),
	}
	auditJSON, _ := json.Marshal(auditPayload)

	updateRecordQuery := `
		UPDATE records
		SET reviewed_by = $2,
		    reviewed_at = clock_timestamp(),
		    corrections_json = coalesce(corrections_json, '{}'::jsonb) || $3::jsonb
		WHERE job_id = $1
	`
	_, _ = tx.Exec(ctx, updateRecordQuery, jobID, reviewerID, auditJSON)

	return tx.Commit(ctx)
}

