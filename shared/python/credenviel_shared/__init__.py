"""Credenviel shared library."""

from credenviel_shared.queue import Queue, Message, QueueError, LockLostError, MessageNotFoundError
from credenviel_shared.local_queue import LocalQueue
from credenviel_shared.store import Store, LocalFileStore
from credenviel_shared.filetype import detect_magic, validate_magic

__all__ = [
    "Queue",
    "Message",
    "QueueError",
    "LockLostError",
    "MessageNotFoundError",
    "LocalQueue",
    "Store",
    "LocalFileStore",
    "detect_magic",
    "validate_magic",
]
