"""Core logic for blob-created event handling in Function app."""

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any
import uuid

import psycopg

from credenviel_shared.filetype import validate_magic
from credenviel_shared.queue import Queue
from credenviel_shared.store import Store

logger = logging.getLogger("functions.core")


@dataclass
class FunctionDeps:
    """Dependencies for handle_blob_created."""
    conn: psycopg.Connection
    store: Store
    queue: Queue
    max_upload_bytes: int = 4194304


@dataclass
class HandleResult:
    """Outcome of handle_blob_created."""
    action: str  # "no_op", "queued", "failed", "re_enqueued"
    job_id: str | None = None
    reason: str | None = None


def handle_blob_created(blob_key: str, deps: FunctionDeps) -> HandleResult:
    """Handle a blob created event.

    blob_key format: raw-uploads/{job_id}/{filename}

    Rules:
    - Change nothing and log clearly if:
      - job unknown
      - blob missing
      - key does not match the job's blob_key
      - status is anything other than awaiting_upload or queued
    - If awaiting_upload:
      - Check size <= max_upload_bytes and > 0
      - Check magic bytes match extension
      - If valid: update status to 'queued' and commit, then send queue message
      - If invalid: update status to 'failed' with failure_reason and commit
    - If queued:
      - Send message again (idempotent retry)
    """
    # Parse blob_key
    clean_key = blob_key.replace("\\", "/").strip("/")
    parts = clean_key.split("/")
    if len(parts) != 3 or parts[0] != "raw-uploads":
        logger.warning(
            "Ignoring invalid blob key format '%s'; expected 'raw-uploads/{job_id}/{filename}'",
            blob_key,
        )
        return HandleResult(action="no_op", reason="invalid_key_format")

    job_id_str = parts[1]
    filename = parts[2]

    try:
        job_id = uuid.UUID(job_id_str)
    except ValueError:
        logger.warning("Ignoring blob key with invalid UUID '%s'", job_id_str)
        return HandleResult(action="no_op", reason="invalid_uuid")

    # 1. Look up job in PostgreSQL
    with deps.conn.cursor() as cur:
        cur.execute(
            "SELECT status, blob_key FROM jobs WHERE id = %s",
            (job_id,),
        )
        row = cur.fetchone()

    if row is None:
        logger.warning("Job %s not found in database for blob %s", job_id, blob_key)
        return HandleResult(action="no_op", job_id=job_id_str, reason="job_not_found")

    job_status, db_blob_key = row

    # 2. Key must match the job's blob_key
    if db_blob_key != clean_key:
        logger.warning(
            "Blob key mismatch for job %s: db expects '%s', got event for '%s'",
            job_id,
            db_blob_key,
            clean_key,
        )
        return HandleResult(action="no_op", job_id=job_id_str, reason="blob_key_mismatch")

    # 3. Status must be awaiting_upload or queued
    if job_status not in ("awaiting_upload", "queued"):
        logger.info(
            "Job %s has status '%s' (not awaiting_upload or queued); skipping",
            job_id,
            job_status,
        )
        return HandleResult(action="no_op", job_id=job_id_str, reason="status_not_actionable")

    # 4. Handle idempotency: if already queued, re-send message and return
    if job_status == "queued":
        logger.info("Job %s is already 'queued'; resending queue message for idempotency", job_id)
        deps.queue.send({"job_id": str(job_id)})
        return HandleResult(action="re_enqueued", job_id=job_id_str)

    # 5. Status is awaiting_upload: validate the blob
    if not deps.store.exists(clean_key):
        logger.warning("Blob '%s' does not exist in store for job %s", clean_key, job_id)
        return HandleResult(action="no_op", job_id=job_id_str, reason="blob_missing")

    # Check size
    blob_size = deps.store.size(clean_key)
    if blob_size == 0:
        return _fail_job(deps.conn, job_id, "file is empty (0 bytes)")

    if blob_size > deps.max_upload_bytes:
        return _fail_job(
            deps.conn,
            job_id,
            f"file size ({blob_size} bytes) exceeds limit ({deps.max_upload_bytes} bytes)",
        )

    # Check magic bytes
    with deps.store.open(clean_key) as f:
        header = f.read(32)

    ext = Path(filename).suffix.lstrip(".").lower()
    if not validate_magic(header, ext):
        return _fail_job(
            deps.conn,
            job_id,
            f"file content does not match extension '.{ext}' (invalid magic bytes)",
        )

    # Valid! Transition to queued, commit, then send message
    with deps.conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
            SET status = 'queued'
            WHERE id = %s AND status = 'awaiting_upload'
            """,
            (job_id,),
        )
    if not deps.conn.autocommit:
        deps.conn.commit()

    logger.info("Job %s transitioned to 'queued'; enqueuing processing message", job_id)
    deps.queue.send({"job_id": str(job_id)})

    return HandleResult(action="queued", job_id=job_id_str)


def _fail_job(conn: psycopg.Connection, job_id: uuid.UUID, reason: str) -> HandleResult:
    """Transition job to failed with reason."""
    logger.warning("Job %s validation failed: %s", job_id, reason)
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE jobs
            SET status = 'failed',
                failure_reason = %s
            WHERE id = %s AND status = 'awaiting_upload'
            """,
            (reason, job_id),
        )
    if not conn.autocommit:
        conn.commit()

    return HandleResult(action="failed", job_id=str(job_id), reason=reason)
