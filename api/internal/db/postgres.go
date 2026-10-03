package db

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Destroyer795/Credenviel/api/internal/auth"
	"github.com/Destroyer795/Credenviel/api/internal/jobs"
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
