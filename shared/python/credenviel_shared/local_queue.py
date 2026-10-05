"""PostgreSQL implementation of peek-lock queue using local_queue_messages table."""

from contextlib import contextmanager
from datetime import datetime
import json
from typing import Any
import uuid

import psycopg
from psycopg.types.json import Jsonb

from credenviel_shared.queue import (
    Queue,
    Message,
    LockLostError,
)


class LocalQueue(Queue):
    """PostgreSQL-backed queue simulating Azure Service Bus peek-lock semantics.

    Dev-only: operates on the local_queue_messages table.
    """

    def __init__(
        self,
        conn_or_dsn: psycopg.Connection | str,
        max_delivery: int = 5,
        default_lock_duration: int = 60,
    ):
        self.conn_or_dsn = conn_or_dsn
        self.max_delivery = max_delivery
        self.default_lock_duration = default_lock_duration

    @contextmanager
    def _get_connection(self):
        if isinstance(self.conn_or_dsn, str):
            with psycopg.connect(self.conn_or_dsn, autocommit=True) as conn:
                yield conn
        else:
            yield self.conn_or_dsn

    def send(self, body: dict[str, Any], job_id: str | uuid.UUID | None = None) -> None:
        """Enqueue a message."""
        if job_id is None:
            if "job_id" not in body:
                raise ValueError("job_id must be provided or present in message body")
            job_id = body["job_id"]

        if isinstance(job_id, str):
            job_id = uuid.UUID(job_id)

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO local_queue_messages (job_id, body)
                    VALUES (%s, %s)
                    """,
                    (job_id, Jsonb(body)),
                )
                if not conn.autocommit:
                    conn.commit()

    def receive(self, lock_duration_seconds: int | None = None) -> Message | None:
        """Receive a single message using FOR UPDATE SKIP LOCKED FIFO by (enqueued_at, id).

        If delivery_count >= max_delivery, automatically dead-letters with MaxDeliveryCountExceeded
        and tries the next eligible message.
        """
        duration = (
            lock_duration_seconds
            if lock_duration_seconds is not None
            else self.default_lock_duration
        )

        while True:
            with self._get_connection() as conn:
                with conn.transaction():
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT id, job_id, body, delivery_count, enqueued_at
                            FROM local_queue_messages
                            WHERE dead_lettered_at IS NULL
                              AND available_at <= now()
                              AND (locked_until IS NULL OR locked_until < now())
                            ORDER BY enqueued_at ASC, id ASC
                            LIMIT 1
                            FOR UPDATE SKIP LOCKED
                            """
                        )
                        row = cur.fetchone()
                        if row is None:
                            return None

                        msg_id, job_id, body, delivery_count, enqueued_at = row

                        if delivery_count >= self.max_delivery:
                            cur.execute(
                                """
                                UPDATE local_queue_messages
                                SET dead_lettered_at = now(),
                                    dead_letter_reason = 'MaxDeliveryCountExceeded',
                                    locked_until = NULL,
                                    lock_token = NULL
                                WHERE id = %s
                                """,
                                (msg_id,),
                            )
                            # Loop to claim next eligible message
                            continue

                        new_token = uuid.uuid4()
                        cur.execute(
                            """
                            UPDATE local_queue_messages
                            SET locked_until = now() + (%s || ' seconds')::interval,
                                delivery_count = delivery_count + 1,
                                lock_token = %s
                            WHERE id = %s
                            RETURNING locked_until, delivery_count
                            """,
                            (duration, new_token, msg_id),
                        )
                        locked_until, updated_count = cur.fetchone()

                        # Parse body if psycopg returned a string/JSON
                        parsed_body = body
                        if isinstance(body, str):
                            parsed_body = json.loads(body)

                        return Message(
                            id=msg_id,
                            job_id=job_id,
                            body=parsed_body,
                            delivery_count=updated_count,
                            lock_token=new_token,
                            enqueued_at=enqueued_at,
                            locked_until=locked_until,
                        )

    def complete(self, message: Message) -> None:
        """Complete the message (deletes the row)."""
        if message.lock_token is None:
            raise LockLostError(f"Cannot complete message {message.id}: lock_token is None")

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM local_queue_messages
                    WHERE id = %s
                      AND lock_token = %s
                      AND locked_until IS NOT NULL
                      AND locked_until >= now()
                    """,
                    (message.id, message.lock_token),
                )
                if cur.rowcount == 0:
                    raise LockLostError(
                        f"Lock lost for message {message.id} (expired, token mismatch, or already completed)"
                    )
                if not conn.autocommit:
                    conn.commit()

    def abandon(self, message: Message) -> None:
        """Abandon the message (clears lock, makes available immediately)."""
        if message.lock_token is None:
            raise LockLostError(f"Cannot abandon message {message.id}: lock_token is None")

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE local_queue_messages
                    SET locked_until = NULL,
                        lock_token = NULL,
                        available_at = now()
                    WHERE id = %s
                      AND lock_token = %s
                      AND locked_until IS NOT NULL
                      AND locked_until >= now()
                    """,
                    (message.id, message.lock_token),
                )
                if cur.rowcount == 0:
                    raise LockLostError(
                        f"Lock lost for message {message.id} (expired or token mismatch)"
                    )
                if not conn.autocommit:
                    conn.commit()

    def dead_letter(self, message: Message, reason: str) -> None:
        """Dead-letter the message with a reason."""
        if message.lock_token is None:
            raise LockLostError(f"Cannot dead-letter message {message.id}: lock_token is None")

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE local_queue_messages
                    SET dead_lettered_at = now(),
                        dead_letter_reason = %s,
                        locked_until = NULL,
                        lock_token = NULL
                    WHERE id = %s
                      AND lock_token = %s
                      AND locked_until IS NOT NULL
                      AND locked_until >= now()
                    """,
                    (reason, message.id, message.lock_token),
                )
                if cur.rowcount == 0:
                    raise LockLostError(
                        f"Lock lost for message {message.id} (expired or token mismatch)"
                    )
                if not conn.autocommit:
                    conn.commit()
