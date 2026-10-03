-- Migration: 001_initial_schema (DOWN)
-- Drops all tables and indexes in reverse dependency order

DROP INDEX IF EXISTS idx_records_source_hash;
DROP INDEX IF EXISTS idx_records_public_verification_id;
DROP TABLE IF EXISTS records;

DROP INDEX IF EXISTS idx_jobs_status;
DROP TABLE IF EXISTS jobs;

DROP TABLE IF EXISTS users;
