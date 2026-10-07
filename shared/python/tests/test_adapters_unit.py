"""Unit tests for Azure adapters (BlobStore and ServiceBusQueue) without live Azure."""

import io
import pytest

from credenviel_shared.blob_store import BlobStore, BlobStream
from credenviel_shared.service_bus_queue import ServiceBusQueue


def test_blob_store_key_splitting():
    """Verify BlobStore key splitting rules."""
    store = BlobStore(storage_account_name="dummyaccount")

    # Valid keys
    c, b = store._split_key("raw-uploads/job-1/cert.pdf")
    assert c == "raw-uploads"
    assert b == "job-1/cert.pdf"

    c, b = store._split_key("test-scratch/deep/nested/path/file.txt")
    assert c == "test-scratch"
    assert b == "deep/nested/path/file.txt"

    # Windows-style backslash normalized
    c, b = store._split_key("raw-uploads\\job-2\\cert.pdf")
    assert c == "raw-uploads"
    assert b == "job-2/cert.pdf"

    # Leading/trailing slashes stripped
    c, b = store._split_key("/raw-uploads/job-3/cert.pdf/")
    assert c == "raw-uploads"
    assert b == "job-3/cert.pdf"

    # Invalid keys
    with pytest.raises(ValueError, match="Key cannot be empty"):
        store._split_key("")

    with pytest.raises(ValueError, match="Key cannot be empty"):
        store._split_key("   ")

    with pytest.raises(ValueError, match="expected 'container/blob-path'"):
        store._split_key("justacontainer")

    with pytest.raises(ValueError, match="container and blob-path must be non-empty"):
        store._split_key("container/")


def test_blob_store_config_validation():
    """Verify BlobStore requires STORAGE_ACCOUNT_NAME."""
    with pytest.raises(ValueError, match="STORAGE_ACCOUNT_NAME must be set"):
        BlobStore(storage_account_name="")


def test_service_bus_queue_config_validation():
    """Verify ServiceBusQueue requires SERVICEBUS_FQDN and SERVICEBUS_QUEUE."""
    with pytest.raises(ValueError, match="SERVICEBUS_FQDN must be set"):
        ServiceBusQueue(fully_qualified_namespace="", queue_name="job-processing")

    with pytest.raises(ValueError, match="SERVICEBUS_QUEUE must be set"):
        ServiceBusQueue(fully_qualified_namespace="sb.servicebus.windows.net", queue_name="")


class MockDownloader:
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)

    def read(self, size: int = -1) -> bytes:
        return self.stream.read(size)


class MockBlobClient:
    def __init__(self, data: bytes):
        self.data = data

    def download_blob(self):
        return MockDownloader(self.data)


def test_blob_stream_reading():
    """Verify BlobStream reads stream chunks correctly and handles context manager."""
    client = MockBlobClient(b"0123456789ABCDEF")
    with BlobStream(client) as stream:
        assert stream.readable() is True
        part1 = stream.read(4)
        assert part1 == b"0123"
        part2 = stream.read(6)
        assert part2 == b"456789"
        rest = stream.read()
        assert rest == b"ABCDEF"
        eof = stream.read()
        assert eof == b""

    # After close
    with pytest.raises(ValueError, match="closed file"):
        stream.read()
