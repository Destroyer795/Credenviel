"""Integration tests for worker processor logic covering Acceptance Tests 9 to 16."""

import hashlib
import http.server
import json
import socket
import threading
import uuid
from decimal import Decimal
from pathlib import Path
import pytest
import psycopg

from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.store import LocalFileStore
from testdb import (
    get_test_connection,
    truncate_all_tables,
)
from worker.extractor import StubExtractor
from worker.processor import WorkerProcessor, SimulatedCrash, FatalError

pytestmark = pytest.mark.integration

SAMPLE_PDF_BYTES = b"%PDF-1.4\nJane Doe Certificate Data Structures\n%%EOF"
BASELINE_FIELDS_HASH = "a9c10c881a985266fc9d382a237e670d87560a0ca508b0de650032208284b04a"


@pytest.fixture
def test_conn():
    conn = get_test_connection(autocommit=True)
    truncate_all_tables(conn)
    yield conn
    conn.close()


@pytest.fixture
def second_conn():
    conn = get_test_connection(autocommit=True)
    yield conn
    conn.close()


@pytest.fixture
def test_store(tmp_path):
    return LocalFileStore(root=tmp_path)


@pytest.fixture
def test_queue(test_conn):
    return LocalQueue(test_conn, default_lock_duration=30, max_delivery=5)


def create_test_job(conn, job_id, filename="cert.pdf", status="queued", uploader_is_issuer=False):
    """Helper to create a test user and job in Postgres."""
    blob_key = f"raw-uploads/{job_id}/{filename}"
    role = "issuer" if uploader_is_issuer else "student"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (entra_id, role, name)
            VALUES (%s, %s, %s)
            ON CONFLICT (entra_id) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name
            RETURNING id
            """,
            (f"entra-{job_id}", role, f"Test {role.capitalize()}"),
        )
        user_id = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO jobs (id, uploader_id, status, blob_key, uploader_is_issuer)
            VALUES (%s, %s, 'awaiting_upload', %s, %s)
            """,
            (job_id, user_id, blob_key, uploader_is_issuer),
        )
        if status != "awaiting_upload":
            cur.execute(
                "UPDATE jobs SET status = %s WHERE id = %s",
                (status, job_id),
            )
    return blob_key


# ==============================================================================
# Acceptance Test 9: Worker happy path (student & issuer)
# ==============================================================================

def test_happy_path_student(test_conn, test_store, test_queue):
    """Test 9a: Student job happy path -> processed, verified_by_issuer=false."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, "student_cert.pdf", status="queued", uploader_is_issuer=False)
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    assert msg is not None

    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        confidence_threshold=0.85,
    )

    action = processor.process_message(msg)
    assert action == "processed"

    # Message must be completed (queue empty)
    assert test_queue.receive() is None

    # Check job row
    with test_conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, failure_reason = cur.fetchone()
        assert status == "processed"
        assert failure_reason is None

        # Check records row
        cur.execute(
            """
            SELECT public_verification_id, name, roll_number, register_number, degree,
                   marks_json, cgpa, issue_date, source_hash, fields_hash,
                   verified_by_issuer, confidence_json
            FROM records
            WHERE job_id = %s
            """,
            (job_id,),
        )
        rec = cur.fetchone()
        assert rec is not None
        (
            pub_id, name, roll_number, register_number, degree,
            marks_json, cgpa, issue_date, source_hash, fields_hash,
            verified_by_issuer, conf_json,
        ) = rec

        assert pub_id is not None
        # Stored records preserve the exact raw values from extractor
        assert name == "  Jane   DOE "
        assert roll_number == " CS2026-001 "
        assert register_number == " REG-987654 "
        assert degree == "  Bachelor   of Technology  in Computer Science "
        assert source_hash == hashlib.sha256(SAMPLE_PDF_BYTES).hexdigest()
        assert fields_hash == BASELINE_FIELDS_HASH
        assert verified_by_issuer is False
        assert conf_json["below_threshold"] == []

        # Regression test: Rebuild fields dict from the STORED record row and recompute fields_hash
        # Recomputed fields_hash must equal the stored fields_hash!
        from credenviel_shared.normalizer import compute_fields_hash
        rebuilt_fields = {
            "name": name,
            "roll_number": roll_number,
            "register_number": register_number,
            "degree": degree,
            "marks": marks_json,
            "cgpa": str(cgpa) if cgpa is not None else None,
            "issue_date": str(issue_date) if issue_date is not None else None,
        }
        recomputed_hash = compute_fields_hash(rebuilt_fields)
        assert recomputed_hash == fields_hash
        assert recomputed_hash == BASELINE_FIELDS_HASH


def test_happy_path_issuer(test_conn, test_store, test_queue):
    """Test 9b: Issuer job happy path -> processed, verified_by_issuer=true."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, "issuer_cert.pdf", status="queued", uploader_is_issuer=True)
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    assert msg is not None

    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        confidence_threshold=0.85,
    )

    action = processor.process_message(msg)
    assert action == "processed"

    with test_conn.cursor() as cur:
        cur.execute("SELECT verified_by_issuer FROM records WHERE job_id = %s", (job_id,))
        verified_by_issuer = cur.fetchone()[0]
        assert verified_by_issuer is True


# ==============================================================================
# Acceptance Test 10: Low confidence profiles -> needs_review
# ==============================================================================

def test_low_profile_needs_review(test_conn, test_store, test_queue):
    """Test 10a: Low profile -> needs_review with multiple fields below threshold."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="low"),
        confidence_threshold=0.85,
    )

    action = processor.process_message(msg)
    assert action == "needs_review"

    with test_conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        assert cur.fetchone()[0] == "needs_review"

        cur.execute("SELECT confidence_json FROM records WHERE job_id = %s", (job_id,))
        conf_json = cur.fetchone()[0]
        below = conf_json["below_threshold"]
        assert len(below) >= 2
        # Name and grade cell are below threshold
        names = [item.get("name") or item.get("cell") for item in below]
        assert "name" in names
        assert "grade" in names


def test_single_low_marks_cell_needs_review(test_conn, test_store, test_queue):
    """Test 10b: Only a single marks cell below threshold -> needs_review."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(single_low_marks=True),
        confidence_threshold=0.85,
    )

    action = processor.process_message(msg)
    assert action == "needs_review"

    with test_conn.cursor() as cur:
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        assert cur.fetchone()[0] == "needs_review"

        cur.execute("SELECT confidence_json FROM records WHERE job_id = %s", (job_id,))
        conf_json = cur.fetchone()[0]
        below = conf_json["below_threshold"]
        assert len(below) == 1
        assert below[0]["type"] == "marks_cell"
        assert below[0]["subject_code"] == "CS101"
        assert below[0]["cell"] == "grade"


# ==============================================================================
# Acceptance Test 11: Duplicate & concurrent deliveries
# ==============================================================================

def test_redelivery_after_completion_is_noop(test_conn, test_store, test_queue):
    """Test 11a: Redelivered message after completion is a no-op; record unchanged."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg1 = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
    )
    assert processor.process_message(msg1) == "processed"

    # Get record details
    with test_conn.cursor() as cur:
        cur.execute("SELECT id, public_verification_id, created_at FROM records WHERE job_id = %s", (job_id,))
        orig_id, orig_pub_id, orig_created_at = cur.fetchone()

    # Now enqueue a redelivered message for the same completed job
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})
    msg2 = test_queue.receive()
    assert msg2 is not None

    action = processor.process_message(msg2)
    assert action == "no_op"
    assert test_queue.receive() is None

    # Verify record was not modified
    with test_conn.cursor() as cur:
        cur.execute("SELECT id, public_verification_id, created_at FROM records WHERE job_id = %s", (job_id,))
        cur_id, cur_pub_id, cur_created_at = cur.fetchone()
        assert cur_id == orig_id
        assert cur_pub_id == orig_pub_id
        assert cur_created_at == orig_created_at


def test_concurrent_duplicates_single_record(test_conn, second_conn, test_store, test_queue):
    """Test 11b: Two workers with duplicate messages produce exactly 1 record with stable public_verification_id."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)

    queue2 = LocalQueue(second_conn, default_lock_duration=30, max_delivery=5)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg1 = test_queue.receive()
    msg2 = queue2.receive()
    assert msg1 is not None
    assert msg2 is not None

    # Hook on worker 1: when worker 1 hits before_finalize, worker 2 executes completely
    def run_worker2_concurrently(jid):
        proc2 = WorkerProcessor(
            conn=second_conn,
            queue=queue2,
            store=test_store,
            extractor=StubExtractor(profile="high"),
        )
        res2 = proc2.process_message(msg2)
        assert res2 == "processed"

    proc1 = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        before_finalize=run_worker2_concurrently,
    )

    res1 = proc1.process_message(msg1)
    # Worker 1 detects that worker 2 finalized the job in step 5 SELECT FOR UPDATE
    assert res1 == "no_op"

    # Verify exactly one record exists in database
    with test_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), public_verification_id FROM records WHERE job_id = %s GROUP BY public_verification_id", (job_id,))
        rows = cur.fetchall()
        assert len(rows) == 1
        count, pub_id = rows[0]
        assert count == 1
        assert pub_id is not None


# ==============================================================================
# Acceptance Test 12: Crash simulation and lock expiry redelivery
# ==============================================================================

def test_crash_then_lock_expiry_redelivers(test_conn, test_store, test_queue):
    """Test 12: Worker dies abruptly (SimulatedCrash), lock expires, redelivery succeeds with delivery_count=2."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg1 = test_queue.receive()
    assert msg1 is not None
    assert msg1.delivery_count == 1

    def crash_worker(jid):
        raise SimulatedCrash("Worker abruptly died!")

    crashing_proc = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        extractor_fault=crash_worker,
    )

    with pytest.raises(SimulatedCrash):
        crashing_proc.process_message(msg1)

    # Neither abandon nor complete was called; message is still locked
    assert test_queue.receive() is None

    # Simulate lock expiry
    with test_conn.cursor() as cur:
        cur.execute(
            "UPDATE local_queue_messages SET locked_until = now() - interval '1 second' WHERE id = %s",
            (msg1.id,),
        )

    # Next receive redelivers with delivery_count == 2
    msg2 = test_queue.receive()
    assert msg2 is not None
    assert msg2.id == msg1.id
    assert msg2.delivery_count == 2

    normal_proc = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
    )
    action = normal_proc.process_message(msg2)
    assert action == "processed"

    # Now queue is completely drained
    assert test_queue.receive() is None


# ==============================================================================
# Acceptance Test 13: Transient retries & dead-lettering beyond max deliveries
# ==============================================================================

def test_transient_twice_then_success(test_conn, test_store, test_queue):
    """Test 13a: Transient failure twice, then succeeds on 3rd attempt."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    failures_remaining = 2

    def transient_fault(jid):
        nonlocal failures_remaining
        if failures_remaining > 0:
            failures_remaining -= 1
            raise RuntimeError("Temporary network timeout")

    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        extractor_fault=transient_fault,
    )

    # Attempt 1: fails & abandons
    msg1 = test_queue.receive()
    assert processor.process_message(msg1) == "abandoned"

    # Attempt 2: fails & abandons
    msg2 = test_queue.receive()
    assert msg2.delivery_count == 2
    assert processor.process_message(msg2) == "abandoned"

    # Attempt 3: succeeds
    msg3 = test_queue.receive()
    assert msg3.delivery_count == 3
    assert processor.process_message(msg3) == "processed"

    assert test_queue.receive() is None


def test_exceeding_max_delivery_dead_letters(test_conn, test_store, test_queue):
    """Test 13b: Failing beyond max_delivery (5) dead-letters message, job remains 'processing'."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    def always_fail(jid):
        raise RuntimeError("Permanent transient fault")

    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        extractor_fault=always_fail,
    )

    # 5 attempts: each one receives and abandons
    for attempt in range(1, 6):
        msg = test_queue.receive()
        assert msg is not None
        assert msg.delivery_count == attempt
        assert processor.process_message(msg) == "abandoned"

    # 6th receive: delivery_count was 5 >= max_delivery(5) -> dead-lettered, returns None
    msg_dlq = test_queue.receive()
    assert msg_dlq is None

    # Verify dead letter in database
    with test_conn.cursor() as cur:
        cur.execute(
            """
            SELECT dead_lettered_at, dead_letter_reason
            FROM local_queue_messages
            WHERE job_id = %s
            """,
            (job_id,),
        )
        dead_lettered_at, reason = cur.fetchone()
        assert dead_lettered_at is not None
        assert reason == "MaxDeliveryCountExceeded"

        # Per spec § 5.7: Job status remains 'processing'
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        status = cur.fetchone()[0]
        assert status == "processing"


# ==============================================================================
# Acceptance Test 14: Fatal errors (missing, empty, unsupported)
# ==============================================================================

def test_fatal_missing_file(test_conn, test_store, test_queue):
    """Test 14a: Missing file in storage -> status=failed, failure_reason set, message completed."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    # File NOT put in test_store
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
    )

    action = processor.process_message(msg)
    assert action == "failed"
    assert test_queue.receive() is None

    with test_conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
        assert status == "failed"
        assert "file missing from storage" in reason


def test_fatal_empty_file(test_conn, test_store, test_queue):
    """Test 14b: Empty (0 bytes) file in storage -> status=failed, failure_reason set, message completed."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, b"")  # 0 bytes
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
    )

    action = processor.process_message(msg)
    assert action == "failed"
    assert test_queue.receive() is None

    with test_conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
        assert status == "failed"
        assert "empty (0 bytes)" in reason


def test_fatal_unsupported_file(test_conn, test_store, test_queue):
    """Test 14c: Extractor raises FatalError -> status=failed, failure_reason set, message completed."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, b"unsupported file content")
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    def fatal_fault(jid):
        raise FatalError("Unsupported certificate layout: missing header anchor")

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        extractor_fault=fatal_fault,
    )

    action = processor.process_message(msg)
    assert action == "failed"
    assert test_queue.receive() is None

    with test_conn.cursor() as cur:
        cur.execute("SELECT status, failure_reason FROM jobs WHERE id = %s", (job_id,))
        status, reason = cur.fetchone()
        assert status == "failed"
        assert "Unsupported certificate layout" in reason


# ==============================================================================
# Acceptance Test 15: Notify behavior and resilience
# ==============================================================================

class MockNotifyServer:
    def __init__(self, response_code=204):
        self.response_code = response_code
        self.received = []
        self.server = None
        self.thread = None

    def start(self):
        handler_cls = self._make_handler()
        self.server = http.server.HTTPServer(("127.0.0.1", 0), handler_cls)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()

    def _make_handler(self):
        parent = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                content_len = int(self.headers.get("Content-Length", 0))
                raw_body = self.rfile.read(content_len).decode("utf-8")
                parent.received.append({
                    "path": self.path,
                    "secret": self.headers.get("X-Internal-Secret"),
                    "content_type": self.headers.get("Content-Type"),
                    "body": json.loads(raw_body) if raw_body else None,
                })
                self.send_response(parent.response_code)
                self.end_headers()

            def log_message(self, format, *args):
                pass  # suppress console log

        return Handler


def test_notify_failure_does_not_fail_job(test_conn, test_store, test_queue):
    """Test 15a: Notify endpoint returning 500 does NOT fail the job or block completion."""
    server = MockNotifyServer(response_code=500)
    server.start()
    try:
        job_id = uuid.uuid4()
        blob_key = create_test_job(test_conn, job_id, status="queued")
        test_store.put(blob_key, SAMPLE_PDF_BYTES)
        test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

        msg = test_queue.receive()
        processor = WorkerProcessor(
            conn=test_conn,
            queue=test_queue,
            store=test_store,
            extractor=StubExtractor(profile="high"),
            api_internal_url=f"http://127.0.0.1:{server.port}",
            internal_api_key="super-secret-key",
        )

        action = processor.process_message(msg)
        assert action == "processed"
        assert test_queue.receive() is None

        with test_conn.cursor() as cur:
            cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
            assert cur.fetchone()[0] == "processed"
    finally:
        server.stop()


def test_notify_carries_secret_header_and_payload(test_conn, test_store, test_queue):
    """Test 15b: Notify request carries X-Internal-Secret header and correct payload."""
    server = MockNotifyServer(response_code=204)
    server.start()
    try:
        job_id = uuid.uuid4()
        blob_key = create_test_job(test_conn, job_id, status="queued")
        test_store.put(blob_key, SAMPLE_PDF_BYTES)
        test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

        msg = test_queue.receive()
        processor = WorkerProcessor(
            conn=test_conn,
            queue=test_queue,
            store=test_store,
            extractor=StubExtractor(profile="high"),
            api_internal_url=f"http://127.0.0.1:{server.port}",
            internal_api_key="my-internal-secret-999",
        )

        action = processor.process_message(msg)
        assert action == "processed"

        assert len(server.received) == 1
        req = server.received[0]
        assert req["path"] == f"/internal/v1/jobs/{job_id}/notify"
        assert req["secret"] == "my-internal-secret-999"
        assert req["content_type"] == "application/json"
        assert req["body"] == {"job_id": str(job_id), "status": "processed"}
    finally:
        server.stop()


# ==============================================================================
# Acceptance Test 16: Atomicity of record upsert and status update
# ==============================================================================

def test_record_and_status_atomic(test_conn, test_store, test_queue):
    """Test 16: Injected failure mid-transaction rolls back both record and status update."""
    job_id = uuid.uuid4()
    blob_key = create_test_job(test_conn, job_id, status="queued")
    test_store.put(blob_key, SAMPLE_PDF_BYTES)
    test_queue.send({"job_id": str(job_id), "blob_key": blob_key})

    def crash_after_upsert(jid):
        raise RuntimeError("Injected database crash right after record upsert")

    msg = test_queue.receive()
    processor = WorkerProcessor(
        conn=test_conn,
        queue=test_queue,
        store=test_store,
        extractor=StubExtractor(profile="high"),
        after_record_upsert=crash_after_upsert,
    )

    action = processor.process_message(msg)
    # Transient failure -> abandoned
    assert action == "abandoned"

    # Verify atomicity in database:
    # 1. No record was saved
    with test_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM records WHERE job_id = %s", (job_id,))
        count = cur.fetchone()[0]
        assert count == 0

        # 2. Status was not set to processed or needs_review; it remains 'processing' from step 3
        cur.execute("SELECT status FROM jobs WHERE id = %s", (job_id,))
        status = cur.fetchone()[0]
        assert status == "processing"
