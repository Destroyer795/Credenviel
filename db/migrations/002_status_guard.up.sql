-- Migration: 002_status_guard (UP)
-- Adds: failure_reason, uploader_is_issuer, status transition guard trigger, insert guard
-- Source: docs/PHASE1_SPEC.md § 5.4

-- Add failure_reason column (PROPOSED decision; see DECISIONS.md)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Add uploader_is_issuer column (change A from PHASE1_SPEC)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS uploader_is_issuer BOOLEAN NOT NULL DEFAULT false;

-- Status transition guard trigger
-- Allowed transitions (Decision 1 from PHASE1_SPEC § 3):
--   awaiting_upload -> queued | failed
--   queued -> processing | failed
--   processing -> processed | needs_review | failed
--   needs_review -> processed
-- Same-status updates are no-ops (pass through).
CREATE OR REPLACE FUNCTION check_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Same-status is a no-op, allow it
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Check allowed transitions
    IF (OLD.status = 'awaiting_upload' AND NEW.status IN ('queued', 'failed')) OR
       (OLD.status = 'queued' AND NEW.status IN ('processing', 'failed')) OR
       (OLD.status = 'processing' AND NEW.status IN ('processed', 'needs_review', 'failed')) OR
       (OLD.status = 'needs_review' AND NEW.status = 'processed') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_status_guard ON jobs;
CREATE TRIGGER trg_jobs_status_guard
    BEFORE UPDATE OF status ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION check_status_transition();

-- Insert guard: new jobs must start as awaiting_upload (Decision 4)
CREATE OR REPLACE FUNCTION check_insert_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != 'awaiting_upload' THEN
        RAISE EXCEPTION 'new jobs must have status awaiting_upload, got %', NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_jobs_insert_guard ON jobs;
CREATE TRIGGER trg_jobs_insert_guard
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION check_insert_status();
