"""Storage interfaces and local file store implementation."""

from abc import ABC, abstractmethod
import os
from pathlib import Path
from typing import BinaryIO
import uuid


class Store(ABC):
    """Abstract storage interface."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return True if the key exists in storage."""
        pass

    @abstractmethod
    def size(self, key: str) -> int:
        """Return size in bytes of the key. Raise FileNotFoundError if missing."""
        pass

    @abstractmethod
    def open(self, key: str) -> BinaryIO:
        """Open and return a readable binary stream for the key."""
        pass

    @abstractmethod
    def put(self, key: str, data: BinaryIO | bytes) -> None:
        """Write stream or bytes atomically to key."""
        pass


class LocalFileStore(Store):
    """Local filesystem storage with path traversal protection and atomic writes."""

    def __init__(self, root: str | Path | None = None):
        if root is None:
            root = os.environ.get("LOCAL_STORAGE_ROOT", ".local-storage")
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        """Resolve key and ensure it is strictly within root directory."""
        if not key or not key.strip():
            raise ValueError("Key cannot be empty")

        # Reject absolute paths or drive letters
        if key.startswith("/") or key.startswith("\\") or ":" in key:
            raise ValueError(f"Absolute paths or drive letters are not permitted: '{key}'")

        # Normalize slashes
        clean_key = key.replace("\\", "/")
        target = (self.root / clean_key).resolve()

        # Reject path traversal
        try:
            target.relative_to(self.root)
        except ValueError:
            raise ValueError(f"Path traversal detected: '{key}' resolves outside storage root")

        # Also ensure target is not the root directory itself
        if target == self.root:
            raise ValueError("Target key cannot be the storage root directory")

        return target

    def exists(self, key: str) -> bool:
        try:
            path = self._resolve(key)
            return path.is_file()
        except ValueError:
            return False

    def size(self, key: str) -> int:
        path = self._resolve(key)
        if not path.is_file():
            raise FileNotFoundError(f"Key not found: {key}")
        return path.stat().st_size

    def open(self, key: str) -> BinaryIO:
        path = self._resolve(key)
        if not path.is_file():
            raise FileNotFoundError(f"Key not found: {key}")
        return open(path, "rb")

    def put(self, key: str, data: BinaryIO | bytes) -> None:
        path = self._resolve(key)
        path.parent.mkdir(parents=True, exist_ok=True)

        temp_path = path.with_suffix(path.suffix + f".tmp.{uuid.uuid4().hex}")
        try:
            with open(temp_path, "wb") as f:
                if isinstance(data, (bytes, bytearray)):
                    f.write(data)
                else:
                    # Stream chunks
                    while chunk := data.read(65536):
                        f.write(chunk)
            # Atomic replace
            temp_path.replace(path)
        except Exception:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass
            raise

    def list_keys(self, prefix: str = "") -> list[str]:
        """List all keys starting with prefix, relative to root using forward slashes."""
        prefix_clean = prefix.replace("\\", "/").lstrip("/")
        search_dir = (self.root / prefix_clean).resolve()

        # Check traversal
        try:
            search_dir.relative_to(self.root)
        except ValueError:
            raise ValueError(f"Prefix '{prefix}' resolves outside storage root")

        if not search_dir.exists():
            return []

        keys = []
        if search_dir.is_file():
            rel = search_dir.relative_to(self.root).as_posix()
            return [rel]

        for p in search_dir.rglob("*"):
            if p.is_file():
                rel = p.relative_to(self.root).as_posix()
                keys.append(rel)

        return sorted(keys)
