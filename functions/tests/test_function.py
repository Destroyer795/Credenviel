"""Function app unit tests."""

import subprocess
import sys
from unittest.mock import MagicMock
from functions.core import FunctionDeps, HandleResult
from functions.function_app import extract_blob_key, process_blob_event


def test_function_app_imports():
    """Test that the function app module can be imported."""
    import functions.function_app as fapp
    assert fapp is not None
    assert callable(fapp.process_blob_event)


def test_extract_blob_key_from_url():
    """Test extraction of blob_key from blob URL."""
    url = "https://stcredxxx.blob.core.windows.net/raw-uploads/d4021271-e23a-4a25-9bc7-e3176652c7be/sample.pdf?sp=r&st=2026-10-08"
    key = extract_blob_key({"url": url})
    assert key == "raw-uploads/d4021271-e23a-4a25-9bc7-e3176652c7be/sample.pdf"


def test_extract_blob_key_url_encoded():
    """Test extraction of blob_key with URL encoded characters."""
    url = "https://stcredxxx.blob.core.windows.net/raw-uploads/d4021271-e23a-4a25-9bc7-e3176652c7be/my%20cert%20file.pdf"
    key = extract_blob_key({"url": url})
    assert key == "raw-uploads/d4021271-e23a-4a25-9bc7-e3176652c7be/my cert file.pdf"


def test_extract_blob_key_from_subject():
    """Test extraction of blob_key from Event Grid subject."""
    subject = "/blobServices/default/containers/raw-uploads/blobs/d4021271-e23a-4a25-9bc7-e3176652c7be/cert.pdf"
    key = extract_blob_key({}, subject=subject)
    assert key == "raw-uploads/d4021271-e23a-4a25-9bc7-e3176652c7be/cert.pdf"


def test_extract_blob_key_empty():
    """Test extraction returns empty string when neither url nor valid subject is present."""
    assert extract_blob_key({}) == ""
    assert extract_blob_key({"url": "https://other.com/other-container/file.pdf"}) == ""


def test_process_blob_event_delegates_to_handle_blob_created():
    """Test process_blob_event invokes handle_blob_created with injected deps."""
    mock_conn = MagicMock()
    mock_store = MagicMock()
    mock_queue = MagicMock()

    deps = FunctionDeps(
        conn=mock_conn,
        store=mock_store,
        queue=mock_queue,
    )

    # Job not found in db returns no_op
    with mock_conn.cursor() as cur:
        cur.fetchone.return_value = None

    data = {"url": "https://stcredxxx.blob.core.windows.net/raw-uploads/11111111-2222-3333-4444-555555555555/cert.pdf"}
    result = process_blob_event(data, deps=deps)
    assert isinstance(result, HandleResult)
    assert result.action == "no_op"
    assert result.reason == "job_not_found"
