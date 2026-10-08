"""Azure adapter integration tests (marked with azure).

Runs against live Azure resources deployed in rg-credenviel-dev.
Uses ONLY the test-scratch container and job-processing-test queue.
Cleans up all test data.
Excluded from make test and make test-integration.
"""

import os
import time
import uuid
import pytest

from credenviel_shared.blob_store import BlobStore
from credenviel_shared.service_bus_queue import ServiceBusQueue

pytestmark = pytest.mark.azure


def _check_rg():
    rg = os.environ.get("AZURE_RESOURCE_GROUP", "")
    if rg != "rg-credenviel-dev":
        pytest.skip(f"Safety guard: AZURE_RESOURCE_GROUP must be 'rg-credenviel-dev' (got '{rg}')")


def test_blob_store_azure_roundtrip():
    """Verify BlobStore put, exists, size, open and delete in test-scratch container."""
    _check_rg()
    storage_account = os.environ.get("STORAGE_ACCOUNT_NAME")
    if not storage_account:
        pytest.skip("STORAGE_ACCOUNT_NAME is not set")

    store = BlobStore(storage_account_name=storage_account)
    test_id = uuid.uuid4().hex
    key = f"test-scratch/test-{test_id}.txt"
    test_data = b"Hello from Azure Blob Store integration test!"

    try:
        # 1. Put
        store.put(key, test_data)

        # 2. Exists
        assert store.exists(key) is True

        # 3. Size
        assert store.size(key) == len(test_data)

        # 4. Open and read
        with store.open(key) as f:
            read_bytes = f.read()
            assert read_bytes == test_data

        # 5. Read header (range read)
        header = store.read_header(key, length=5)
        assert header == b"Hello"

    finally:
        # Cleanup
        try:
            blob_client = store._get_blob_client(key)
            if blob_client.exists():
                blob_client.delete_blob()
        except Exception:
            pass

    assert store.exists(key) is False


def test_service_bus_azure_send_receive_complete():
    """Verify ServiceBusQueue send, receive, and complete on job-processing-test."""
    _check_rg()
    sb_fqdn = os.environ.get("SERVICEBUS_FQDN")
    if not sb_fqdn:
        pytest.skip("SERVICEBUS_FQDN is not set")

    queue = ServiceBusQueue(
        fully_qualified_namespace=sb_fqdn,
        queue_name="job-processing-test",
    )
    job_id = uuid.uuid4()
    body = {"job_id": str(job_id), "action": "test_send_receive_complete"}

    try:
        queue.send(body, job_id=job_id)

        msg = queue.receive()
        assert msg is not None, "Expected message to be received from job-processing-test"
        assert msg.job_id == job_id
        assert msg.body.get("action") == "test_send_receive_complete"

        queue.complete(msg)
    finally:
        queue.close()


def test_service_bus_azure_abandon_and_delivery_count():
    """Verify ServiceBusQueue abandon increments delivery_count upon redelivery."""
    _check_rg()
    sb_fqdn = os.environ.get("SERVICEBUS_FQDN")
    if not sb_fqdn:
        pytest.skip("SERVICEBUS_FQDN is not set")

    queue = ServiceBusQueue(
        fully_qualified_namespace=sb_fqdn,
        queue_name="job-processing-test",
    )
    job_id = uuid.uuid4()
    body = {"job_id": str(job_id), "action": "test_abandon"}

    try:
        queue.send(body, job_id=job_id)

        # First receive
        msg1 = queue.receive()
        assert msg1 is not None
        assert msg1.job_id == job_id
        count1 = msg1.delivery_count

        # Abandon
        queue.abandon(msg1)
        time.sleep(1.0)

        # Second receive
        msg2 = queue.receive()
        assert msg2 is not None
        assert msg2.job_id == job_id
        assert msg2.delivery_count > count1, f"Expected delivery_count > {count1}, got {msg2.delivery_count}"

        # Clean up
        queue.complete(msg2)
    finally:
        queue.close()


def test_service_bus_azure_dead_letter():
    """Verify ServiceBusQueue dead_letter moves the message to dead-letter subqueue."""
    _check_rg()
    sb_fqdn = os.environ.get("SERVICEBUS_FQDN")
    if not sb_fqdn:
        pytest.skip("SERVICEBUS_FQDN is not set")

    queue = ServiceBusQueue(
        fully_qualified_namespace=sb_fqdn,
        queue_name="job-processing-test",
    )
    job_id = uuid.uuid4()
    body = {"job_id": str(job_id), "action": "test_dead_letter"}

    try:
        queue.send(body, job_id=job_id)

        msg = queue.receive()
        assert msg is not None
        assert msg.job_id == job_id

        queue.dead_letter(msg, reason="test_failure_reason")
    finally:
        queue.close()
