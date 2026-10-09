package records

import (
	"context"
	"errors"
	"time"
)

var (
	ErrNotFound      = errors.New("record not found")
	ErrInvalidStatus = errors.New("job is not in needs_review status")
)

// Record represents a certificate record stored in the database.
type Record struct {
	ID                   string     `json:"id"`
	JobID                string     `json:"job_id"`
	Name                 *string    `json:"name"`
	RollNumber           *string    `json:"roll_number"`
	RegisterNumber       *string    `json:"register_number"`
	Degree               *string    `json:"degree"`
	MarksJSON            any        `json:"marks_json"`
	CGPA                 *string    `json:"cgpa"`
	IssueDate            *string    `json:"issue_date"`
	DocumentType         string     `json:"document_type"`
	AttributesJSON       any        `json:"attributes_json"`
	ConfidenceJSON       any        `json:"confidence_json"`
	SourceHash           string     `json:"source_hash"`
	FieldsHash           string     `json:"fields_hash"`
	PublicVerificationID string     `json:"public_verification_id"`
	VerifiedByIssuer     bool       `json:"verified_by_issuer"`
	ReviewedBy           *string    `json:"reviewed_by,omitempty"`
	ReviewedAt           *time.Time `json:"reviewed_at,omitempty"`
	CorrectionsJSON      any        `json:"corrections_json,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
}

// ResolvedFields contains the issuer confirmed/corrected certificate fields.
type ResolvedFields struct {
	Name           *string `json:"name"`
	RollNumber     *string `json:"roll_number"`
	RegisterNumber *string `json:"register_number"`
	Degree         *string `json:"degree"`
	MarksJSON      any     `json:"marks_json"`
	CGPA           *string `json:"cgpa"`
	IssueDate      *string `json:"issue_date"`
	DocumentType   *string `json:"document_type,omitempty"`
	AttributesJSON any     `json:"attributes_json,omitempty"`
}

// PublicVerification defines the public fields visible on the verification lookup page.
// Note: private marks_json and register_number are strictly excluded per design specification.
type PublicVerification struct {
	Verified             bool      `json:"verified"`
	PublicVerificationID string    `json:"public_verification_id"`
	Name                 *string   `json:"name"`
	RollNumber           *string   `json:"roll_number"`
	Degree               *string   `json:"degree"`
	CGPA                 *string   `json:"cgpa"`
	IssueDate            *string   `json:"issue_date"`
	DocumentType         string    `json:"document_type"`
	AttributesJSON       any       `json:"attributes_json,omitempty"`
	SourceHash           string    `json:"source_hash"`
	FieldsHash           string    `json:"fields_hash"`
	VerifiedByIssuer     bool      `json:"verified_by_issuer"`
	IssuedAt             time.Time `json:"issued_at"`
	StampedDocumentURL   string    `json:"stamped_document_url,omitempty"`
}

// Repository defines data access methods for records.
type Repository interface {
	GetByJobID(ctx context.Context, jobID string) (*Record, error)
	GetByPublicVerificationID(ctx context.Context, publicVerificationID string) (*Record, error)
	Resolve(ctx context.Context, jobID string, resolved ResolvedFields, fieldsHash string, diff map[string]any, reviewerID string) error
	Reject(ctx context.Context, jobID string, reason string, reviewerID string) error
}
