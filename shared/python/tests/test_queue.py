"""Integration tests for LocalQueue PostgreSQL peek-lock implementation."""

import concurrent.futures
import time
import uuid
import pytest

from credenviel_shared.queue import LockLostError, Message
from credenviel_shared.local_queue import LocalQueue


pytestmark = pytest.mark.integration


def test_send_and_receive(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    body = {"job_id": str(job_id), "action": "process"}

    q.send(body)
    msg = q.receive(lock_duration_seconds=30)

    assert msg is not None
    assert msg.job_id == job_id
    assert msg.body == body
    assert msg.delivery_count == 1
    assert msg.lock_token is not None
    assert msg.locked_until is not None


def test_receive_empty_returns_none(queue_conn):
    q = LocalQueue(queue_conn)
    assert q.receive() is None


def test_receive_fifo(queue_conn):
    q = LocalQueue(queue_conn)
    id1 = uuid.uuid4()
    id2 = uuid.uuid4()

    q.send({"job_id": str(id1), "order": 1})
    q.send({"job_id": str(id2), "order": 2})

    m1 = q.receive()
    m2 = q.receive()

    assert m1 is not None and m1.job_id == id1
    assert m2 is not None and m2.job_id == id2


def test_complete_deletes_message(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    q.send({"job_id": str(job_id)})

    msg = q.receive()
    assert msg is not None

    q.complete(msg)

    # Queue should be empty now
    assert q.receive() is None
    # Row in DB is deleted
    res = queue_conn.execute("SELECT count(*) FROM local_queue_messages").fetchone()
    assert res[0] == 0


def test_abandon_makes_immediately_available(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    q.send({"job_id": str(job_id)})

    msg = q.receive()
    assert msg is not None
    assert msg.delivery_count == 1

    q.abandon(msg)

    # Immediately available again, with delivery_count incremented to 2
    msg2 = q.receive()
    assert msg2 is not None
    assert msg2.id == msg.id
    assert msg2.delivery_count == 2


def test_dead_letter_moves_out_of_queue(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    q.send({"job_id": str(job_id)})

    msg = q.receive()
    assert msg is not None

    q.dead_letter(msg, reason="CorruptPayload")

    # Message is no longer receivable
    assert q.receive() is None

    # Check database row has dead-letter fields
    res = queue_conn.execute(
        "SELECT dead_letter_reason, dead_lettered_at FROM local_queue_messages WHERE id = %s",
        (msg.id,),
    ).fetchone()
    assert res[0] == "CorruptPayload"
    assert res[1] is not None


def test_lock_lost_wrong_token(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    q.send({"job_id": str(job_id)})

    msg = q.receive()
    assert msg is not None

    # Tamper with lock_token
    bogus_msg = Message(
        id=msg.id,
        job_id=msg.job_id,
        body=msg.body,
        delivery_count=msg.delivery_count,
        lock_token=uuid.uuid4(),
        enqueued_at=msg.enqueued_at,
        locked_until=msg.locked_until,
    )

    with pytest.raises(LockLostError):
        q.complete(bogus_msg)

    with pytest.raises(LockLostError):
        q.abandon(bogus_msg)

    with pytest.raises(LockLostError):
        q.dead_letter(bogus_msg, reason="test")


def test_lock_expiry_redelivers(queue_conn):
    q = LocalQueue(queue_conn)
    job_id = uuid.uuid4()
    q.send({"job_id": str(job_id)})

    # Receive with 1-second lock
    msg = q.receive(lock_duration_seconds=1)
    assert msg is not None
    assert msg.delivery_count == 1

    # While locked, receive returns None
    assert q.receive() is None

    # Force lock expiry directly in DB (Change E: DB-driven expiry instead of sleep)
    queue_conn.execute(
        "UPDATE local_queue_messages SET locked_until = now() - interval '1 second' WHERE id = %s",
        (msg.id,),
    )

    # Now can be received again
    msg2 = q.receive(lock_duration_seconds=30)
    assert msg2 is not None
    assert msg2.id == msg.id
    assert msg2.delivery_count == 2

    # Original msg cannot be completed because its lock expired
    with pytest.raises(LockLostError):
        q.complete(msg)

    # But msg2 can be completed
    q.complete(msg2)
    assert q.receive() is None


def test_max_delivery_count_exceeded_dead_letters(queue_conn):
    # Queue configured with max_delivery = 3
    q = LocalQueue(queue_conn, max_delivery=3)
    job_id1 = uuid.uuid4()
    job_id2 = uuid.uuid4()

    q.send({"job_id": str(job_id1)})
    q.send({"job_id": str(job_id2)})

    # Delivery 1
    m = q.receive()
    assert m.job_id == job_id1 and m.delivery_count == 1
    q.abandon(m)

    # Delivery 2
    m = q.receive()
    assert m.job_id == job_id1 and m.delivery_count == 2
    q.abandon(m)

    # Delivery 3 (max delivery reached)
    m = q.receive()
    assert m.job_id == job_id1 and m.delivery_count == 3
    q.abandon(m)

    # On next receive, msg1 has delivery_count=3 >= max_delivery(3).
    # It must be dead-lettered with MaxDeliveryCountExceeded, and receive returns msg2!
    next_m = q.receive()
    assert next_m is not None
    assert next_m.job_id == job_id2

    # Verify msg1 is dead-lettered
    res = queue_conn.execute(
        "SELECT dead_letter_reason FROM local_queue_messages WHERE job_id = %s",
        (job_id1,),
    ).fetchone()
    assert res[0] == "MaxDeliveryCountExceeded"


def test_concurrent_claimers_skip_locked(queue_conn, test_db_setup):
    """Two concurrent connections claim distinct messages simultaneously via FOR UPDATE SKIP LOCKED."""
    id1 = uuid.uuid4()
    id2 = uuid.uuid4()

    q = LocalQueue(queue_conn)
    q.send({"job_id": str(id1)})
    q.send({"job_id": str(id2)})

    def claim_message(dsn):
        q_local = LocalQueue(dsn)
        return q_local.receive(lock_duration_seconds=30)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(claim_message, test_db_setup)
        f2 = executor.submit(claim_message, test_db_setup)

        m1 = f1.result()
        m2 = f2.result()

    assert m1 is not None
    assert m2 is not None
    # Must claim different messages
    assert m1.id != m2.id
    claimed_ids = {m1.job_id, m2.job_id}
    assert claimed_ids == {id1, id2}
