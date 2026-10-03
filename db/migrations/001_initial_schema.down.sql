-- Migration: 001_initial_schema (DOWN)
-- Drops all tables, indexes, triggers, and functions in reverse dependency order

DROP INDEX IF EXISTS idx_records_source_hash;
DROP TABLE IF EXISTS records;

DROP INDEX IF EXISTS idx_jobs_status;
DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS jobs;

DROP TABLE IF EXISTS users;
