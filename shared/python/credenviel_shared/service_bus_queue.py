"""Azure Service Bus implementation of Queue interface."""

from datetime import datetime, timezone
import json
import logging
import os
from typing import Any
import uuid

from azure.identity import DefaultAzureCredential
from azure.servicebus import (
    ServiceBusClient,
    ServiceBusMessage,
    ServiceBusReceivedMessage,
    ServiceBusReceiveMode,
)
from azure.servicebus.exceptions import (
    MessageLockLostError,
    ServiceBusError,
)

from credenviel_shared.queue import (
    LockLostError,
    Message,
    MessageNotFoundError,
    Queue,
    QueueError,
)

logger = logging.getLogger("credenviel.service_bus_queue")


class ServiceBusQueue(Queue):
    """Queue implementation backed by Azure Service Bus using peek-lock semantics."""

    def __init__(
        self,
        fully_qualified_namespace: str | None = None,
        queue_name: str | None = None,
        credential: Any = None,
        managed_identity_client_id: str | None = None,
        client: ServiceBusClient | None = None,
    ) -> None:
        self.fqdn = os.environ.get("SERVICEBUS_FQDN", "") if fully_qualified_namespace is None else fully_qualified_namespace
        self.queue_name = os.environ.get("SERVICEBUS_QUEUE", "job-processing") if queue_name is None else queue_name

        if client is not None:
            self._client = client
            self.credential = getattr(client, "_credential", None)
        else:
            if not self.fqdn:
                raise ValueError("SERVICEBUS_FQDN must be set or passed to ServiceBusQueue")
            if not self.queue_name:
                raise ValueError("SERVICEBUS_QUEUE must be set or passed to ServiceBusQueue")

            if credential is None:
                client_id = managed_identity_client_id or os.environ.get("AZURE_CLIENT_ID")
                if client_id:
                    self.credential = DefaultAzureCredential(managed_identity_client_id=client_id)
                else:
                    self.credential = DefaultAzureCredential()
            else:
                self.credential = credential

            self._client = ServiceBusClient(
                fully_qualified_namespace=self.fqdn,
                credential=self.credential,
            )

        self._receiver = None
        self._held_messages: dict[int, ServiceBusReceivedMessage] = {}
        self._next_id = 1

    def _get_receiver(self):
        if self._receiver is None:
            self._receiver = self._client.get_queue_receiver(
                queue_name=self.queue_name,
                receive_mode=ServiceBusReceiveMode.PEEK_LOCK,
            )
        return self._receiver

    def send(self, body: dict[str, Any], job_id: str | uuid.UUID | None = None) -> None:
        """Enqueue a message. If job_id is not provided, extracts it from body['job_id']."""
        if job_id is None:
            job_id = body.get("job_id")

        payload = json.dumps(body)
        app_props = {}
        if job_id is not None:
            app_props["job_id"] = str(job_id)

        msg = ServiceBusMessage(
            body=payload,
            application_properties=app_props if app_props else None,
        )

        with self._client.get_queue_sender(queue_name=self.queue_name) as sender:
            try:
                sender.send_messages(msg)
            except ServiceBusError as e:
                raise QueueError(f"Failed to send Service Bus message: {e}") from e

    def receive(self, lock_duration_seconds: int = 60) -> Message | None:
        """Receive a single message with peek-lock semantics.

        Returns None if no message is available after a short wait.
        """
        receiver = self._get_receiver()
        try:
            received_batch = receiver.receive_messages(
                max_message_count=1,
                max_wait_time=2.0,
            )
        except MessageLockLostError as e:
            raise LockLostError(str(e)) from e
        except ServiceBusError as e:
            raise QueueError(f"Failed to receive from Service Bus: {e}") from e

        if not received_batch:
            return None

        sb_msg = received_batch[0]

        # Parse body
        raw_body = b"".join(sb_msg.body) if hasattr(sb_msg.body, "__iter__") and not isinstance(sb_msg.body, (bytes, bytearray)) else sb_msg.body
        if isinstance(raw_body, (bytes, bytearray)):
            raw_body = raw_body.decode("utf-8")
        elif not isinstance(raw_body, str):
            raw_body = str(sb_msg)

        try:
            body = json.loads(raw_body)
        except Exception:
            body = {"raw": str(raw_body)}

        # Extract job_id
        job_id_val = None
        if sb_msg.application_properties and "job_id" in sb_msg.application_properties:
            job_id_val = sb_msg.application_properties["job_id"]
        elif isinstance(body, dict) and "job_id" in body:
            job_id_val = body["job_id"]

        try:
            parsed_job_id = uuid.UUID(str(job_id_val)) if job_id_val else uuid.uuid4()
        except ValueError:
            parsed_job_id = uuid.uuid4()

        msg_id = self._next_id
        self._next_id += 1
        self._held_messages[msg_id] = sb_msg

        # Lock token
        lock_token = None
        if sb_msg.lock_token:
            try:
                lock_token = uuid.UUID(str(sb_msg.lock_token))
            except ValueError:
                pass

        enqueued_at = sb_msg.enqueued_time_utc or datetime.now(timezone.utc)
        locked_until = sb_msg.locked_until_utc

        return Message(
            id=msg_id,
            job_id=parsed_job_id,
            body=body,
            delivery_count=sb_msg.delivery_count,
            lock_token=lock_token,
            enqueued_at=enqueued_at,
            locked_until=locked_until,
        )

    def complete(self, message: Message) -> None:
        """Complete the message (deletes it)."""
        sb_msg = self._held_messages.pop(message.id, None)
        if sb_msg is None:
            raise MessageNotFoundError(f"No active held message with id {message.id}")

        receiver = self._get_receiver()
        try:
            receiver.complete_message(sb_msg)
        except MessageLockLostError as e:
            raise LockLostError(str(e)) from e
        except ServiceBusError as e:
            raise QueueError(f"Failed to complete message: {e}") from e

    def abandon(self, message: Message) -> None:
        """Abandon the message (clears lock, makes available immediately)."""
        sb_msg = self._held_messages.pop(message.id, None)
        if sb_msg is None:
            raise MessageNotFoundError(f"No active held message with id {message.id}")

        receiver = self._get_receiver()
        try:
            receiver.abandon_message(sb_msg)
        except MessageLockLostError as e:
            raise LockLostError(str(e)) from e
        except ServiceBusError as e:
            raise QueueError(f"Failed to abandon message: {e}") from e

    def dead_letter(self, message: Message, reason: str) -> None:
        """Dead-letter the message with a reason."""
        sb_msg = self._held_messages.pop(message.id, None)
        if sb_msg is None:
            raise MessageNotFoundError(f"No active held message with id {message.id}")

        receiver = self._get_receiver()
        try:
            receiver.dead_letter_message(sb_msg, reason=reason)
        except MessageLockLostError as e:
            raise LockLostError(str(e)) from e
        except ServiceBusError as e:
            raise QueueError(f"Failed to dead-letter message: {e}") from e

    def close(self) -> None:
        """Close receiver and client connections."""
        if self._receiver is not None:
            try:
                self._receiver.close()
            except Exception:
                pass
            self._receiver = None
        try:
            self._client.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
