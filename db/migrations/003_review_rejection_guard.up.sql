-- Migration: 003_review_rejection_guard (UP)
-- Source: docs/DECISIONS.md § D-048 (Q-001)
-- Allows transition: needs_review -> failed for issuer rejection of illegible or fraudulent documents.

CREATE OR REPLACE FUNCTION check_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Same-status is a no-op, allow it
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    -- Check allowed transitions (D-048 adds 'failed' for needs_review)
    IF (OLD.status = 'awaiting_upload' AND NEW.status IN ('queued', 'failed')) OR
       (OLD.status = 'queued' AND NEW.status IN ('processing', 'failed')) OR
       (OLD.status = 'processing' AND NEW.status IN ('processed', 'needs_review', 'failed')) OR
       (OLD.status = 'needs_review' AND NEW.status IN ('processed', 'failed')) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'invalid status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
