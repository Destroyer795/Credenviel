-- Migration: 002_status_guard (DOWN)
-- Reverses: failure_reason, uploader_is_issuer, status guard triggers

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs') THEN
        DROP TRIGGER IF EXISTS trg_jobs_insert_guard ON jobs;
        DROP TRIGGER IF EXISTS trg_jobs_status_guard ON jobs;
        ALTER TABLE jobs DROP COLUMN IF EXISTS uploader_is_issuer;
        ALTER TABLE jobs DROP COLUMN IF EXISTS failure_reason;
    END IF;
END $$;

DROP FUNCTION IF EXISTS check_insert_status();
DROP FUNCTION IF EXISTS check_status_transition();
