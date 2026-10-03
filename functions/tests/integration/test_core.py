"""Integration tests for functions/core.py (Acceptance Test 8)."""

from pathlib import Path
import uuid
import pytest
import psycopg

from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.store import LocalFileStore
from credenviel_shared.testdb import (
    get_test_dsn,
    assert_is_test_db,
    truncate_all_tables,
)
from functions.core import FunctionDeps, handle_blob_created

pytestmark = pytest.mark.integration


@pytest.fixture
def test_conn():
    conn = psycopg.connect(get_test_dsn(), autocommit=True)
    assert_is_test_db(conn)
    truncate_all_tables(conn)
    yield conn
    conn.close()


@pytest.fixture
def test_store(tmp_path):
    return LocalFileStore(root=tmp_path)


@pytest.fixture
def deps(test_conn, test_store):
    queue = LocalQueue(test_conn)
    return FunctionDeps(
        conn=test_conn,
        store=test_store,
        queue=queue,
        max_upload_bytes=1024 * 1024,  # 1MB limit for tests
    )


def create_test_job(conn, job_id, filename, status="awaiting_upload"):
    blob_key = f"raw-uploads/{job_id}/{filename}"
    with conn.cursor() as cur:
        # Create user
        cur.execute(
            """
            INSERT INTO users (entra_id, role, name)
            VALUES (%s, 'student', 'Test Student')
            ON CONFLICT (entra_id) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (f"entra-{job_id}",),
        )
        user_id = cur.fetchone()[0]

        # Insert job
        cur.execute(
            """
            INSERT INTO jobs (id, uploader_id, status, blob_key)
            VALUES (%s, %s, 'awaiting_upload', %s)
            """,
            (job_id, user_id, blob_key),
        )

        # Transition status if not awaiting_upload
        if status != "awaiting_upload":
            cur.execute(
                "UPDATE jobs SET status = %s WHERE id = %s",
                (status, job_id),
            )
    return blob_key


def test_valid_upload_transitions_to_queued_and_enqueues(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "cert.pdf")

    # Store valid PDF bytes
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
    deps.store.put(blob_key, pdf_content)

    res = handle_blob_created(blob_key, deps)
    assert res.action == "queued"
    assert res.job_id == str(job_id)

    # Verify status in database
    with deps.conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, failure_reason = cur.fetchone()
    assert status == "queued"
    assert failure_reason is None

    # Verify message enqueued
    msg = deps.queue.receive()
    assert msg is not None
    assert msg.job_id == job_id
    assert msg.body == {"job_id": str(job_id)}


def test_retry_safe_idempotent_on_queued(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "cert.pdf", status="queued")

    # Re-running event on an already queued job enqueues another message without error
    res = handle_blob_created(blob_key, deps)
    assert res.action == "re_enqueued"

    # Status remains queued
    with deps.conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        assert cur.fetchone()[0] == "queued"

    # Queue received the duplicate message
    msg = deps.queue.receive()
    assert msg is not None
    assert msg.job_id == job_id


def test_bad_magic_bytes_fails_job(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "cert.pdf")

    # Store invalid data (text instead of PDF)
    deps.store.put(blob_key, b"THIS IS NOT A VALID PDF FILE")

    res = handle_blob_created(blob_key, deps)
    assert res.action == "failed"
    assert "magic bytes" in res.reason.lower()

    # DB status is failed with failure_reason
    with deps.conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
    assert status == "failed"
    assert "magic bytes" in reason.lower()

    # No message in queue
    assert deps.queue.receive() is None


def test_extension_mismatch_fails_job(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "image.jpg")

    # Store valid PDF bytes with .jpg extension
    deps.store.put(blob_key, b"%PDF-1.4 test")

    res = handle_blob_created(blob_key, deps)
    assert res.action == "failed"

    with deps.conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
    assert status == "failed"
    assert "magic bytes" in reason.lower()


def test_oversize_file_fails_job(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "huge.pdf")

    # Write file exceeding 1MB limit
    oversize_bytes = b"%PDF-" + (b"A" * (1024 * 1024 + 10))
    deps.store.put(blob_key, oversize_bytes)

    res = handle_blob_created(blob_key, deps)
    assert res.action == "failed"
    assert "exceeds limit" in res.reason.lower()

    with deps.conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
    assert status == "failed"
    assert "exceeds limit" in reason.lower()


def test_empty_file_fails_job(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "empty.pdf")
    deps.store.put(blob_key, b"")

    res = handle_blob_created(blob_key, deps)
    assert res.action == "failed"
    assert "empty" in res.reason.lower()

    with deps.conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
    assert status == "failed"
    assert "empty" in reason.lower()


def test_missing_blob_does_not_change_job(deps):
    job_id = uuid.uuid4()
    blob_key = create_test_job(deps.conn, job_id, "missing.pdf")
    # Do NOT put blob into store

    res = handle_blob_created(blob_key, deps)
    assert res.action == "no_op"
    assert res.reason == "blob_missing"

    # Status still awaiting_upload
    with deps.conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        assert cur.fetchone()[0] == "awaiting_upload"

    assert deps.queue.receive() is None


def test_unknown_job_does_nothing(deps):
    random_job_id = uuid.uuid4()
    key = f"raw-uploads/{random_job_id}/cert.pdf"
    deps.store.put(key, b"%PDF-1.4 test")

    res = handle_blob_created(key, deps)
    assert res.action == "no_op"
    assert res.reason == "job_not_found"
    assert deps.queue.receive() is None


def test_blob_key_mismatch_does_nothing(deps):
    job_id = uuid.uuid4()
    create_test_job(deps.conn, job_id, "original.pdf")

    # File exists under different name for same job_id
    mismatched_key = f"raw-uploads/{job_id}/different.pdf"
    deps.store.put(mismatched_key, b"%PDF-1.4 test")

    res = handle_blob_created(mismatched_key, deps)
    assert res.action == "no_op"
    assert res.reason == "blob_key_mismatch"

    with deps.conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        assert cur.fetchone()[0] == "awaiting_upload"


def test_non_actionable_status_does_nothing(deps):
    for status in ["processing", "processed", "failed", "needs_review"]:
        job_id = uuid.uuid4()
        blob_key = create_test_job(deps.conn, job_id, f"{status}.pdf")
        deps.store.put(blob_key, b"%PDF-1.4 test")

        # Manually transition to status through valid path
        with deps.conn.cursor() as cur:
            if status in ("processing", "processed", "needs_review"):
                cur.execute("UPDATE jobs SET status = 'queued' WHERE id = %s", (job_id,))
                cur.execute("UPDATE jobs SET status = 'processing' WHERE id = %s", (job_id,))
                if status in ("processed", "needs_review"):
                    cur.execute(f"UPDATE jobs SET status = '{status}' WHERE id = %s", (job_id,))
            elif status == "failed":
                cur.execute("UPDATE jobs SET status = 'failed' WHERE id = %s", (job_id,))

        res = handle_blob_created(blob_key, deps)
        assert res.action == "no_op"
        assert res.reason == "status_not_actionable"
