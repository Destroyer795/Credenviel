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


