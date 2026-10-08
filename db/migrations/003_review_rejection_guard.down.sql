-- Migration: 003_review_rejection_guard (DOWN)
-- Reverts check_status_transition to disallow needs_review -> failed

CREATE OR REPLACE FUNCTION check_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

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
