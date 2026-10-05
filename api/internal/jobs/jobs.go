package jobs

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("job not found")
	ErrInvalidStatus = errors.New("invalid status value")
)

var AllowedStatuses = map[string]bool{
	"awaiting_upload": true,
	"queued":          true,
	"processing":      true,
	"processed":       true,
	"needs_review":    true,
	"failed":          true,
}

// Job represents a row in the jobs table.
type Job struct {
	ID               string    `json:"id"`
	UploaderID       string    `json:"uploader_id"`
	Status           string    `json:"status"`
	BlobKey          string    `json:"blob_key"`
	FailureReason    *string   `json:"failure_reason,omitempty"`
	UploaderIsIssuer bool      `json:"uploader_is_issuer"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// ListFilter specifies filters for querying jobs.
type ListFilter struct {
	UploaderID string
	Status     string
	IsIssuer   bool
}

// Repository defines data access methods for jobs.
type Repository interface {
	Create(ctx context.Context, job *Job) error
	Get(ctx context.Context, id string) (*Job, error)
	List(ctx context.Context, filter ListFilter) ([]*Job, error)
}
