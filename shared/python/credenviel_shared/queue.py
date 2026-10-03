"""Queue interfaces and exceptions for Credenviel pipeline."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any
import uuid


class QueueError(Exception):
    """Base exception for queue operations."""
    pass


class LockLostError(QueueError):
    """Raised when an operation (complete, abandon, dead_letter) fails because
    the lock was lost (expired or lock_token mismatch)."""
    pass


class MessageNotFoundError(QueueError):
    """Raised when an operation is attempted on a non-existent message."""
    pass


@dataclass
class Message:
    """Represents a message received from a peek-lock queue."""
    id: int
    job_id: uuid.UUID
    body: dict[str, Any]
    delivery_count: int
    lock_token: uuid.UUID | None
    enqueued_at: datetime
    locked_until: datetime | None


class Queue(ABC):
    """Abstract base class for a peek-lock queue (simulating Azure Service Bus)."""

    @abstractmethod
    def send(self, body: dict[str, Any], job_id: str | uuid.UUID | None = None) -> None:
        """Enqueue a message. If job_id is not provided, extracts it from body['job_id']."""
        pass

    @abstractmethod
    def receive(self, lock_duration_seconds: int = 60) -> Message | None:
        """Receive a single message with peek-lock semantics.
        Returns None if no message is available."""
        pass

    @abstractmethod
    def complete(self, message: Message) -> None:
        """Complete the message (deletes it).
        Requires matching lock_token and unexpired lock, else raises LockLostError."""
        pass

    @abstractmethod
    def abandon(self, message: Message) -> None:
        """Abandon the message (clears lock and makes it available immediately).
        Requires matching lock_token and unexpired lock, else raises LockLostError."""
        pass

    @abstractmethod
    def dead_letter(self, message: Message, reason: str) -> None:
        """Dead-letter the message with a reason.
        Requires matching lock_token and unexpired lock, else raises LockLostError."""
        pass
