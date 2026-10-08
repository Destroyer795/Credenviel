import os
import subprocess
import sys
from pathlib import Path
import pytest

WORKER_DIR = Path(__file__).resolve().parent.parent


def test_worker_imports():
    """Test that the worker package can be imported."""
    import worker
    import worker.config
    assert worker is not None
    assert worker.config is not None


def test_worker_config_defaults():
    """Test that config loads with defaults when no env vars are set."""
    from worker.config import load_config
    config = load_config()
    assert config["port"] == "8081"
    assert config["confidence_threshold"] == 0.85
    assert config["queue_name"] == "job-processing"
    assert config["blob_container"] == "raw-uploads"


def test_worker_cli_help():
    """Test that the worker CLI --help works."""
    result = subprocess.run(
        [sys.executable, "-m", "worker", "--help"],
        cwd=str(WORKER_DIR),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "--stub-extractor" in result.stdout


@pytest.mark.integration
def test_worker_stub_extractor_flag():
    """Test that the worker runs and exits cleanly with --stub-extractor and --once."""
    result = subprocess.run(
        [sys.executable, "-m", "worker", "--stub-extractor", "--once"],
        cwd=str(WORKER_DIR),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "STUB extractor" in result.stderr


def test_worker_fails_without_stub_extractor():
    """Test that the worker exits with code 2 if --stub-extractor is missing."""
    result = subprocess.run(
        [sys.executable, "-m", "worker"],
        cwd=str(WORKER_DIR),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2


def test_worker_sigterm_clean_shutdown():
    """Test that run_worker_loop gracefully finishes in-flight message and stops on SIGTERM."""
    from unittest.mock import MagicMock
    from worker.__main__ import run_worker_loop

    mock_queue = MagicMock()
    mock_processor = MagicMock()

    # Two messages available
    msg1 = MagicMock()
    msg1.id = "msg-1"
    msg2 = MagicMock()
    msg2.id = "msg-2"

    mock_queue.receive.side_effect = [msg1, msg2, None]
    mock_processor.process_message.return_value = "processed"

    # Simulate SIGTERM arriving during message 1 processing
    running = True

    def mock_process(msg):
        nonlocal running
        if msg.id == "msg-1":
            # Simulate SIGTERM triggered while processing msg-1
            running = False
        return "processed"

    mock_processor.process_message.side_effect = mock_process

    processed_count = run_worker_loop(
        processor=mock_processor,
        queue=mock_queue,
        poll_interval=0.01,
        is_running_fn=lambda: running,
    )

    # Must process message 1 completely, then stop before message 2
    assert processed_count == 1
    mock_processor.process_message.assert_called_once_with(msg1)


def test_worker_unset_notify_url_skips_notify():
    """Test that WorkerProcessor cleanly skips notify without error when notify URL is unset."""
    import uuid
    from unittest.mock import MagicMock
    from worker.processor import WorkerProcessor

    processor = WorkerProcessor(
        conn=MagicMock(),
        queue=MagicMock(),
        store=MagicMock(),
        extractor=MagicMock(),
        api_internal_url="",
        internal_api_key="some-secret",
    )

    # Calling _notify_api with empty URL must return without raising any exception
    job_id = uuid.uuid4()
    processor._notify_api(job_id, "processed")


def test_worker_config_cloud_env_defaults_empty_notify_url(monkeypatch):
    """Test that in cloud environments, empty API_INTERNAL_URL defaults to empty string."""
    from worker.config import load_config

    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)

    config = load_config()
    assert config["api_internal_url"] == ""



