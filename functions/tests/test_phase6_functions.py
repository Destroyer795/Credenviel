"""Unit tests for Phase 6 Azure Function triggers (Scheduled Cleanup & DLQ Handler)."""

import json
from unittest.mock import MagicMock
import uuid
import pytest

from functions.core import HandleResult, handle_scheduled_cleanup, handle_dead_letter
from functions.function_app import process_cleanup_event, process_dead_letter_event


def test_handle_scheduled_cleanup_queries_and_returns_ids():
    """Verify handle_scheduled_cleanup updates expired jobs and returns job IDs."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    expired_id1 = uuid.uuid4()
    expired_id2 = uuid.uuid4()
    mock_cursor.fetchall.return_value = [(expired_id1,), (expired_id2,)]

    cleaned = handle_scheduled_cleanup(mock_conn, max_age_minutes=15)

    assert len(cleaned) == 2
    assert str(expired_id1) in cleaned
    assert str(expired_id2) in cleaned

    # Verify SQL query parameters
    mock_cursor.execute.assert_called_once()
    query, params = mock_cursor.execute.call_args[0]
    assert "status = 'failed'" in query
    assert "failure_reason = 'upload_expired_sas'" in query
    assert "status = 'awaiting_upload'" in query
    assert params == ("15",)


def test_handle_scheduled_cleanup_empty():
    """Verify handle_scheduled_cleanup handles zero expired jobs gracefully."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchall.return_value = []

    cleaned = handle_scheduled_cleanup(mock_conn, max_age_minutes=30)
    assert cleaned == []


def test_process_cleanup_event_delegates():
    """Verify process_cleanup_event helper delegates with connection."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchall.return_value = []

    res = process_cleanup_event(max_age_minutes=20, conn=mock_conn)
    assert res == []


def test_handle_dead_letter_valid_json_updates_job():
    """Verify poison message with valid job_id transitions job to failed."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    job_id = uuid.uuid4()
    mock_cursor.fetchone.return_value = (job_id, "failed")

    msg_body = json.dumps({"job_id": str(job_id), "source": "test_poison"})
    res = handle_dead_letter(mock_conn, msg_body, diagnostic_reason="poison_delivery_5")

    assert isinstance(res, HandleResult)
    assert res.action == "failed"
    assert res.job_id == str(job_id)
    assert res.reason == "poison_delivery_5"

    mock_cursor.execute.assert_called_once()
    query, params = mock_cursor.execute.call_args[0]
    assert "SET status = 'failed'" in query
    assert params == ("poison_delivery_5", job_id)


def test_handle_dead_letter_dict_payload():
    """Verify handle_dead_letter accepts dict body directly."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    job_id = uuid.uuid4()
    mock_cursor.fetchone.return_value = (job_id, "failed")

    res = handle_dead_letter(mock_conn, {"job_id": str(job_id)})
    assert res.action == "failed"
    assert res.job_id == str(job_id)


def test_handle_dead_letter_missing_job_id():
    """Verify missing job_id is safely rejected with no_op."""
    mock_conn = MagicMock()
    res = handle_dead_letter(mock_conn, json.dumps({"other": "field"}))
    assert res.action == "no_op"
    assert res.reason == "missing_job_id"
    mock_conn.cursor.assert_not_called()


def test_handle_dead_letter_invalid_uuid():
    """Verify non-UUID string is rejected with no_op."""
    mock_conn = MagicMock()
    res = handle_dead_letter(mock_conn, json.dumps({"job_id": "not-a-valid-uuid"}))
    assert res.action == "no_op"
    assert res.reason == "invalid_uuid"
    mock_conn.cursor.assert_not_called()


def test_handle_dead_letter_already_finalized_or_missing():
    """Verify job already in terminal status or missing returns no_op."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = None  # No row updated

    job_id = uuid.uuid4()
    res = handle_dead_letter(mock_conn, {"job_id": str(job_id)})
    assert res.action == "no_op"
    assert res.job_id == str(job_id)
    assert res.reason == "already_finalized_or_not_found"


def test_process_dead_letter_event_delegates():
    """Verify process_dead_letter_event helper delegates with injected conn."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

    job_id = uuid.uuid4()
    mock_cursor.fetchone.return_value = (job_id, "failed")

    res = process_dead_letter_event(
        {"job_id": str(job_id)},
        diagnostic_reason="delivery_exceeded",
        conn=mock_conn,
    )
    assert res.action == "failed"
    assert res.job_id == str(job_id)
