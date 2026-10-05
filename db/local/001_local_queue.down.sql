-- Local queue: 001_local_queue (DOWN)
-- Drops the dev-only local queue table.

DROP INDEX IF EXISTS idx_local_queue_receive;
DROP TABLE IF EXISTS local_queue_messages;
