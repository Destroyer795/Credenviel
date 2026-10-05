-- Local queue: 001_local_queue (UP)
-- Dev-only table simulating Service Bus peek-lock semantics.
-- NEVER applied by `make migrate`; only by `make migrate-local`.
-- Source: docs/PHASE1_SPEC.md § 5.1

CREATE TABLE IF NOT EXISTS local_queue_messages (
    id              BIGSERIAL PRIMARY KEY,
    job_id          UUID NOT NULL,
    body            JSONB NOT NULL,
    enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until    TIMESTAMPTZ,
    lock_token      UUID,
    delivery_count  INTEGER NOT NULL DEFAULT 0,
    dead_lettered_at TIMESTAMPTZ,
    dead_letter_reason TEXT
);

-- Index for efficient receive: find available, non-dead-lettered messages
CREATE INDEX IF NOT EXISTS idx_local_queue_receive
    ON local_queue_messages (enqueued_at, id)
    WHERE dead_lettered_at IS NULL;
