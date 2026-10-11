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

	// Ensure flexible document columns exist and status guard permits processed -> failed rejection
	_, _ = pool.Exec(ctx, `
		ALTER TABLE records ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'grade_sheet';
		ALTER TABLE records ADD COLUMN IF NOT EXISTS attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;
		CREATE INDEX IF NOT EXISTS idx_records_document_type ON records(document_type);

		CREATE OR REPLACE FUNCTION check_status_transition()
		RETURNS TRIGGER AS $$
		BEGIN
		    IF NEW.status = OLD.status THEN
		        RETURN NEW;
		    END IF;

		    IF (OLD.status = 'awaiting_upload' AND NEW.status IN ('queued', 'failed')) OR
		       (OLD.status = 'queued' AND NEW.status IN ('processing', 'failed')) OR
		       (OLD.status = 'processing' AND NEW.status IN ('processed', 'needs_review', 'failed')) OR
		       (OLD.status = 'needs_review' AND NEW.status IN ('processed', 'failed')) OR
		       (OLD.status = 'processed' AND NEW.status = 'failed') THEN
		        RETURN NEW;
		    END IF;

		    RAISE EXCEPTION 'invalid status transition from % to %', OLD.status, NEW.status
		        USING ERRCODE = 'check_violation';
		END;
		$$ LANGUAGE plpgsql;
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

// UpsertUser performs JIT provisioning of a user based on verified identity claims.
// The Firebase UID is stored in the users.entra_id column (column name predates the move to Firebase).
func (d *DB) UpsertUser(ctx context.Context, ident auth.Identity) (auth.User, error) {
	query := `
		INSERT INTO users (entra_id, role, name)
		VALUES ($1, $2, $3)
		ON CONFLICT (entra_id) DO UPDATE
		SET role = CASE WHEN $4 THEN EXCLUDED.role ELSE users.role END, name = EXCLUDED.name
		RETURNING id, entra_id, role, name
	`

	var u auth.User
	err := d.pool.QueryRow(ctx, query, ident.ExternalID, ident.Role, ident.Name, ident.RoleExplicit).Scan(
		&u.ID,
		&u.ExternalID,
		&u.Role,
		&u.Name,
	)
	if err != nil {
		return auth.User{}, fmt.Errorf("failed to upsert user: %w", err)
	}

	return u, nil
}

func (d *DB) SetUserRole(ctx context.Context, userID, role string) error {
	_, err := d.pool.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, userID)
	if err != nil {
		return fmt.Errorf("failed to set user role: %w", err)
	}
	return nil
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
		SELECT j.id, j.uploader_id, j.status, j.blob_key, j.failure_reason, j.uploader_is_issuer, j.created_at, j.updated_at,
		       r.name, r.roll_number, r.document_type, r.verified_by_issuer, r.public_verification_id::text
		FROM jobs j
		LEFT JOIN records r ON r.job_id = j.id
		WHERE j.id = $1
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
		&j.Name,
		&j.RollNumber,
		&j.DocumentType,
		&j.VerifiedByIssuer,
		&j.PublicVerificationID,
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
		conditions = append(conditions, fmt.Sprintf("j.uploader_id = $%d", argIdx))
		args = append(args, filter.UploaderID)
		argIdx++
	}

	if filter.Status != "" {
		conditions = append(conditions, fmt.Sprintf("j.status = $%d", argIdx))
		args = append(args, filter.Status)
		argIdx++
	}

	query := `
		SELECT j.id, j.uploader_id, j.status, j.blob_key, j.failure_reason, j.uploader_is_issuer, j.created_at, j.updated_at,
		       r.name, r.roll_number, r.document_type, r.verified_by_issuer, r.public_verification_id::text
		FROM jobs j
		LEFT JOIN records r ON r.job_id = j.id
	`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY j.created_at DESC"

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
			&j.Name,
			&j.RollNumber,
			&j.DocumentType,
			&j.VerifiedByIssuer,
			&j.PublicVerificationID,
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
		SELECT r.id, r.job_id, r.name, r.roll_number, r.register_number, r.degree,
		       r.marks_json, r.cgpa::text, r.issue_date::text, r.confidence_json,
		       r.source_hash, r.fields_hash, r.public_verification_id, r.verified_by_issuer,
		       r.reviewed_by, r.reviewed_at, r.corrections_json, r.created_at,
		       coalesce(r.document_type, 'grade_sheet'), coalesce(r.attributes_json, '{}'::jsonb),
		       coalesce(j.status, 'processed'), coalesce(j.failure_reason, '')
		FROM records r
		LEFT JOIN jobs j ON r.job_id = j.id
		WHERE r.job_id = $1
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
		&r.Status,
		&r.FailureReason,
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

// GetByPublicVerificationID fetches a record by its public verification ID or job ID.
func (d *DB) GetByPublicVerificationID(ctx context.Context, publicVerificationID string) (*records.Record, error) {
	query := `
		SELECT r.id, r.job_id, r.name, r.roll_number, r.register_number, r.degree,
		       r.marks_json, r.cgpa::text, r.issue_date::text, r.confidence_json,
		       r.source_hash, r.fields_hash, r.public_verification_id, r.verified_by_issuer,
		       r.reviewed_by, r.reviewed_at, r.corrections_json, r.created_at,
		       coalesce(r.document_type, 'grade_sheet'), coalesce(r.attributes_json, '{}'::jsonb),
		       coalesce(j.status, 'processed'), coalesce(j.failure_reason, '')
		FROM records r
		LEFT JOIN jobs j ON r.job_id = j.id
		WHERE r.public_verification_id = $1 OR r.job_id = $1
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
		&r.Status,
		&r.FailureReason,
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

	var verifiedByIssuer bool
	err = tx.QueryRow(ctx, "SELECT verified_by_issuer FROM records WHERE job_id = $1", jobID).Scan(&verifiedByIssuer)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("failed to check record verification status: %w", err)
	}

	if status != "needs_review" && !(status == "processed" && !verifiedByIssuer) {
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

	var verifiedByIssuer bool
	_ = tx.QueryRow(ctx, "SELECT verified_by_issuer FROM records WHERE job_id = $1", jobID).Scan(&verifiedByIssuer)

	if status != "needs_review" && !(status == "processed" && !verifiedByIssuer) {
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
		SET verified_by_issuer = false,
		    reviewed_by = $2,
		    reviewed_at = clock_timestamp(),
		    corrections_json = coalesce(corrections_json, '{}'::jsonb) || $3::jsonb
		WHERE job_id = $1
	`
	_, _ = tx.Exec(ctx, updateRecordQuery, jobID, reviewerID, auditJSON)

	return tx.Commit(ctx)
}

// Delete removes a job and its associated record.
func (d *DB) Delete(ctx context.Context, id string) error {
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete from records first due to foreign key
	_, err = tx.Exec(ctx, "DELETE FROM records WHERE job_id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete record: %w", err)
	}

	result, err := tx.Exec(ctx, "DELETE FROM jobs WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete job: %w", err)
	}
	if result.RowsAffected() == 0 {
		return jobs.ErrNotFound
	}

	return tx.Commit(ctx)
}

