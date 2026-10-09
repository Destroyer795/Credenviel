-- Migration: 004_flexible_documents (DOWN)

DROP INDEX IF EXISTS idx_records_document_type;
ALTER TABLE records DROP COLUMN IF EXISTS attributes_json;
ALTER TABLE records DROP COLUMN IF EXISTS document_type;
