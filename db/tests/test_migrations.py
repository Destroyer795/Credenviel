"""Migration tests: apply/rollback/reapply, status guard, insert guard.

All tests use the credenviel_test database (see conftest.py).
Marked as integration tests; require `make up` (Postgres running).
"""

import uuid
import pytest
import psycopg


pytestmark = pytest.mark.integration


def _create_user(conn, entra_id=None, role="student", name="Test User"):
    """Helper: insert a user and return its id."""
    entra_id = entra_id or str(uuid.uuid4())
    row = conn.execute(
        "INSERT INTO users (entra_id, role, name) VALUES (%s, %s, %s) RETURNING id",
        (entra_id, role, name),
    ).fetchone()
    return row[0]


def _create_job(conn, uploader_id, blob_key=None, uploader_is_issuer=False):
    """Helper: insert a job (status defaults to awaiting_upload) and return its id."""
    blob_key = blob_key or f"raw-uploads/{uuid.uuid4()}/test.pdf"
    row = conn.execute(
        "INSERT INTO jobs (uploader_id, blob_key, uploader_is_issuer) "
        "VALUES (%s, %s, %s) RETURNING id",
        (uploader_id, blob_key, uploader_is_issuer),
    ).fetchone()
    return row[0]


def _get_status(conn, job_id):
    """Helper: get current status of a job."""
    row = conn.execute(
        "SELECT status FROM jobs WHERE id = %s", (job_id,)
    ).fetchone()
    return row[0]


def _update_status(conn, job_id, new_status):
    """Helper: update job status."""
    conn.execute(
        "UPDATE jobs SET status = %s WHERE id = %s",
        (new_status, job_id),
    )


# ── Test 1: Apply, rollback, re-apply ──────────────────────────────

class TestApplyRollbackReapply:
    """Test that migrations 001+002+003 apply, roll back, and re-apply cleanly."""

    def test_apply_rollback_reapply(self, db_conn):
        """Migrations apply, roll back fully, then re-apply without error."""
        import os
        migrations_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")

        def read_sql(filename):
            with open(os.path.join(migrations_dir, filename), "r") as f:
                return f.read()

        # Clean slate
        db_conn.execute(read_sql("003_review_rejection_guard.down.sql"))
        db_conn.execute(read_sql("002_status_guard.down.sql"))
        db_conn.execute(read_sql("001_initial_schema.down.sql"))

        # Apply
        db_conn.execute(read_sql("001_initial_schema.up.sql"))
        db_conn.execute(read_sql("002_status_guard.up.sql"))
        db_conn.execute(read_sql("003_review_rejection_guard.up.sql"))

        # Verify tables exist
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name IN ('users', 'jobs', 'records') "
            "ORDER BY table_name"
        ).fetchall()
        assert [r[0] for r in result] == ["jobs", "records", "users"]

        # Verify new columns from 002
        cols = db_conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'jobs' AND column_name IN ('failure_reason', 'uploader_is_issuer') "
            "ORDER BY column_name"
        ).fetchall()
        assert [r[0] for r in cols] == ["failure_reason", "uploader_is_issuer"]

        # Rollback
        db_conn.execute(read_sql("003_review_rejection_guard.down.sql"))
        db_conn.execute(read_sql("002_status_guard.down.sql"))
        db_conn.execute(read_sql("001_initial_schema.down.sql"))

        # Tables should be gone
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name IN ('users', 'jobs', 'records')"
        ).fetchall()
        assert result == []

        # Re-apply
        db_conn.execute(read_sql("001_initial_schema.up.sql"))
        db_conn.execute(read_sql("002_status_guard.up.sql"))
        db_conn.execute(read_sql("003_review_rejection_guard.up.sql"))

        # Verify again
        result = db_conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name IN ('users', 'jobs', 'records') "
            "ORDER BY table_name"
        ).fetchall()
        assert [r[0] for r in result] == ["jobs", "records", "users"]

        # Cleanup
        db_conn.execute(read_sql("003_review_rejection_guard.down.sql"))
        db_conn.execute(read_sql("002_status_guard.down.sql"))
        db_conn.execute(read_sql("001_initial_schema.down.sql"))


# ── Test 2: Guard rejects invalid transitions ──────────────────────

class TestGuardRejectsInvalid:
    """Status guard trigger rejects all disallowed transitions."""

    INVALID_TRANSITIONS = [
        ("awaiting_upload", "processing"),
        ("awaiting_upload", "processed"),
        ("awaiting_upload", "needs_review"),
        ("queued", "awaiting_upload"),
        ("queued", "processed"),
        ("queued", "needs_review"),
        ("processing", "awaiting_upload"),
        ("processing", "queued"),
        ("processed", "awaiting_upload"),
        ("processed", "queued"),
        ("processed", "processing"),
        ("processed", "needs_review"),
        ("processed", "failed"),
        ("needs_review", "awaiting_upload"),
        ("needs_review", "queued"),
        ("needs_review", "processing"),
        ("failed", "awaiting_upload"),
        ("failed", "queued"),
        ("failed", "processing"),
        ("failed", "processed"),
        ("failed", "needs_review"),
    ]

    # Valid transitions needed to reach each starting state
    PATHS_TO_STATE = {
        "awaiting_upload": [],
        "queued": ["queued"],
        "processing": ["queued", "processing"],
        "processed": ["queued", "processing", "processed"],
        "needs_review": ["queued", "processing", "needs_review"],
        "failed": ["failed"],  # awaiting_upload -> failed
    }

    @pytest.mark.parametrize("from_status,to_status", INVALID_TRANSITIONS)
    def test_guard_rejects_invalid(self, fresh_schema, from_status, to_status):
        """Guard trigger rejects transition from {from_status} to {to_status}."""
        conn = fresh_schema
        user_id = _create_user(conn)
        job_id = _create_job(conn, user_id)

        # Walk to the starting state via valid transitions
        for step in self.PATHS_TO_STATE[from_status]:
            _update_status(conn, job_id, step)

        assert _get_status(conn, job_id) == from_status

        # Attempt the invalid transition
        with pytest.raises(psycopg.errors.CheckViolation):
            _update_status(conn, job_id, to_status)

        # Rollback the failed transaction
        conn.rollback()


# ── Test 3: Guard allows all valid transitions ─────────────────────

class TestGuardAllowsValid:
    """Status guard trigger allows all valid transitions."""

    VALID_TRANSITIONS = [
        ("awaiting_upload", "queued"),
        ("awaiting_upload", "failed"),
        ("queued", "processing"),
        ("queued", "failed"),
        ("processing", "processed"),
        ("processing", "needs_review"),
        ("processing", "failed"),
        ("needs_review", "processed"),
        ("needs_review", "failed"),
    ]

    PATHS_TO_STATE = {
        "awaiting_upload": [],
        "queued": ["queued"],
        "processing": ["queued", "processing"],
        "needs_review": ["queued", "processing", "needs_review"],
    }

    @pytest.mark.parametrize("from_status,to_status", VALID_TRANSITIONS)
    def test_guard_allows_valid(self, fresh_schema, from_status, to_status):
        """Guard trigger allows transition from {from_status} to {to_status}."""
        conn = fresh_schema
        user_id = _create_user(conn)
        job_id = _create_job(conn, user_id)

        # Walk to the starting state
        for step in self.PATHS_TO_STATE[from_status]:
            _update_status(conn, job_id, step)

        assert _get_status(conn, job_id) == from_status

        # The valid transition should succeed
        _update_status(conn, job_id, to_status)
        assert _get_status(conn, job_id) == to_status


# ── Test 4: Same-status update is a no-op ──────────────────────────

class TestSameStatusNoOp:
    """Same-status updates should pass through (no-op)."""

    ALL_STATUSES = [
        "awaiting_upload", "queued", "processing",
        "processed", "needs_review", "failed",
    ]

    PATHS_TO_STATE = {
        "awaiting_upload": [],
        "queued": ["queued"],
        "processing": ["queued", "processing"],
        "processed": ["queued", "processing", "processed"],
        "needs_review": ["queued", "processing", "needs_review"],
        "failed": ["failed"],
    }

    @pytest.mark.parametrize("status", ALL_STATUSES)
    def test_same_status_is_noop(self, fresh_schema, status):
        """Updating status to the same value should succeed."""
        conn = fresh_schema
        user_id = _create_user(conn)
        job_id = _create_job(conn, user_id)

        for step in self.PATHS_TO_STATE[status]:
            _update_status(conn, job_id, step)

        # Same-status update should not raise
        _update_status(conn, job_id, status)
        assert _get_status(conn, job_id) == status


# ── Test 5: Insert guard ──────────────────────────────────────────

class TestInsertGuard:
    """New jobs must start with status awaiting_upload."""

    def test_insert_must_be_awaiting_upload(self, fresh_schema):
        """Inserting a job with any status other than awaiting_upload is rejected."""
        conn = fresh_schema
        user_id = _create_user(conn)

        for bad_status in ["queued", "processing", "processed", "needs_review", "failed"]:
            with pytest.raises(psycopg.errors.CheckViolation):
                conn.execute(
                    "INSERT INTO jobs (uploader_id, blob_key, status) VALUES (%s, %s, %s)",
                    (user_id, f"raw-uploads/{uuid.uuid4()}/test.pdf", bad_status),
                )
            conn.rollback()

    def test_insert_awaiting_upload_succeeds(self, fresh_schema):
        """Inserting a job with status awaiting_upload succeeds (the default)."""
        conn = fresh_schema
        user_id = _create_user(conn)
        job_id = _create_job(conn, user_id)
        assert _get_status(conn, job_id) == "awaiting_upload"


# ── Test 6: uploader_is_issuer column ─────────────────────────────

class TestUploaderIsIssuer:
    """The uploader_is_issuer column works correctly."""

    def test_default_false(self, fresh_schema):
        conn = fresh_schema
        user_id = _create_user(conn)
        job_id = _create_job(conn, user_id, uploader_is_issuer=False)
        row = conn.execute(
            "SELECT uploader_is_issuer FROM jobs WHERE id = %s", (job_id,)
        ).fetchone()
        assert row[0] is False

    def test_issuer_true(self, fresh_schema):
        conn = fresh_schema
        user_id = _create_user(conn, role="issuer")
        job_id = _create_job(conn, user_id, uploader_is_issuer=True)
        row = conn.execute(
            "SELECT uploader_is_issuer FROM jobs WHERE id = %s", (job_id,)
        ).fetchone()
        assert row[0] is True


# ── Test 7: Local queue table ─────────────────────────────────────

class TestLocalQueue:
    """Local queue table creation and teardown."""

    def test_local_queue_created(self, fresh_schema_with_local_queue):
        conn = fresh_schema_with_local_queue
        result = conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'local_queue_messages'"
        ).fetchall()
        assert len(result) == 1

    def test_local_queue_columns(self, fresh_schema_with_local_queue):
        conn = fresh_schema_with_local_queue
        cols = conn.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'local_queue_messages' ORDER BY ordinal_position"
        ).fetchall()
        col_names = [r[0] for r in cols]
        expected = [
            "id", "job_id", "body", "enqueued_at", "available_at",
            "locked_until", "lock_token", "delivery_count",
            "dead_lettered_at", "dead_letter_reason",
        ]
        assert col_names == expected
