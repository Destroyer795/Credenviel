-- Migration: 004_flexible_documents (UP)
-- Adds document_type and attributes_json to records table to support arbitrary student documents
-- (e.g. grade_sheet, degree_certificate, bonafide_certificate, transfer_certificate, conduct_certificate)

ALTER TABLE records ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'grade_sheet';
ALTER TABLE records ADD COLUMN IF NOT EXISTS attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index on document_type for quick filtering and queries
CREATE INDEX IF NOT EXISTS idx_records_document_type ON records(document_type);
