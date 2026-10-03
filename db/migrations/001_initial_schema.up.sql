-- Migration: 001_initial_schema (UP)
-- Creates the three core tables: users, jobs, records
-- Source: docs/DESIGN.md § Database & Data Management

-- Use gen_random_uuid() for default UUIDs (requires pgcrypto or PG 13+)

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entra_id        TEXT NOT NULL UNIQUE,
    role            TEXT NOT NULL CHECK (role IN ('issuer', 'student')),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Six job statuses per the design: awaiting_upload, queued, processing, processed, needs_review, failed
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id     UUID NOT NULL REFERENCES users(id),
    -- blob_key is the path in Blob Storage; UNIQUE prevents duplicate processing of the same blob
    blob_key        TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'awaiting_upload'
                    CHECK (status IN (
                        'awaiting_upload',
                        'queued',
                        'processing',
                        'processed',
                        'needs_review',
                        'failed'
                    )),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on jobs.status: drives dashboard loads (filter by status for listing)
CREATE INDEX idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS records (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- job_id is UNIQUE: a job produces at most one record (failed jobs produce none).
    -- The worker upserts on conflict so a redelivered Service Bus message can't create a duplicate row.
    job_id                  UUID NOT NULL UNIQUE REFERENCES jobs(id),
    name                    TEXT,
    roll_number             TEXT,
    register_number         TEXT,
    marks_json              JSONB,
    cgpa                    NUMERIC,
    issue_date              DATE,
    confidence_json         JSONB,
    -- source_hash: SHA-256 of the original uploaded file; lets a verifier confirm the scan hasn't been altered
    source_hash             TEXT NOT NULL,
    -- fields_hash: SHA-256 of the normalized extracted fields (canonical JSON);
    -- lets a verifier confirm field-for-field against a fresh re-scan
    fields_hash             TEXT NOT NULL,
    -- public_verification_id: random UUID, NOT sequential, to prevent enumeration of records
    public_verification_id  UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    -- verified_by_issuer: true for issuer uploads automatically; false for student uploads until issuer confirms
    verified_by_issuer      BOOLEAN NOT NULL DEFAULT false,
    -- reviewed_by / reviewed_at: audit trail for issuer review actions
    reviewed_by             UUID REFERENCES users(id),
    reviewed_at             TIMESTAMPTZ,
    -- corrections_json: stores prior field values when an issuer corrects a field, so nothing is silently overwritten
    corrections_json        JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index on records.public_verification_id: drives every public verification lookup via QR code
CREATE INDEX idx_records_public_verification_id ON records(public_verification_id);

-- Index on records.source_hash: drives public lookups by file hash
CREATE INDEX idx_records_source_hash ON records(source_hash);
