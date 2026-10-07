"""Azure Blob Storage implementation of Store interface."""

import io
import logging
import os
from typing import Any, BinaryIO

from azure.core.exceptions import ResourceNotFoundError
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobClient, BlobServiceClient

from credenviel_shared.store import Store

logger = logging.getLogger("credenviel.blob_store")


class BlobStream(io.RawIOBase, BinaryIO):
    """File-like streaming wrapper around Azure Storage download stream."""

    def __init__(self, blob_client: BlobClient):
        self._blob_client = blob_client
        self._downloader = None
        self._closed = False

    def readable(self) -> bool:
        return True

    def read(self, size: int = -1) -> bytes:
        if self._closed:
            raise ValueError("I/O operation on closed file")
        if self._downloader is None:
            self._downloader = self._blob_client.download_blob()
        data = self._downloader.read(size)
        return data if data is not None else b""

    def readinto(self, b) -> int:
        data = self.read(len(b))
        n = len(data)
        b[:n] = data
        return n

    def close(self) -> None:
        self._closed = True
        self._downloader = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class BlobStore(Store):
    """Store implementation backed by Azure Blob Storage.

    Keys have the form: container/blob-path (split at first '/').
    """

    def __init__(
        self,
        storage_account_name: str | None = None,
        credential: Any = None,
        managed_identity_client_id: str | None = None,
        service_client: BlobServiceClient | None = None,
    ) -> None:
        self.account_name = os.environ.get("STORAGE_ACCOUNT_NAME", "") if storage_account_name is None else storage_account_name

        if service_client is not None:
            self._service_client = service_client
        else:
            if not self.account_name:
                raise ValueError("STORAGE_ACCOUNT_NAME must be set or passed to BlobStore")

            if credential is None:
                client_id = managed_identity_client_id or os.environ.get("AZURE_CLIENT_ID")
                if client_id:
                    self.credential = DefaultAzureCredential(managed_identity_client_id=client_id)
                else:
                    self.credential = DefaultAzureCredential()
            else:
                self.credential = credential

            account_url = f"https://{self.account_name}.blob.core.windows.net"
            self._service_client = BlobServiceClient(
                account_url=account_url,
                credential=self.credential,
            )

    def _split_key(self, key: str) -> tuple[str, str]:
        """Split key into (container, blob_name) at first '/'."""
        if not key or not key.strip():
            raise ValueError("Key cannot be empty")

        clean_key = key.replace("\\", "/").lstrip("/")
        if "/" not in clean_key:
            raise ValueError(f"Invalid key '{key}': expected 'container/blob-path'")

        container, blob_name = clean_key.split("/", 1)
        blob_name = blob_name.rstrip("/")
        if not container or not blob_name:
            raise ValueError(f"Invalid key '{key}': container and blob-path must be non-empty")

        return container, blob_name

    def _get_blob_client(self, key: str) -> BlobClient:
        container, blob_name = self._split_key(key)
        return self._service_client.get_blob_client(container=container, blob=blob_name)

    def exists(self, key: str) -> bool:
        """Return True if the blob exists in storage."""
        try:
            blob_client = self._get_blob_client(key)
            return blob_client.exists()
        except Exception:
            return False

    def size(self, key: str) -> int:
        """Return size in bytes of the key. Raise FileNotFoundError if missing."""
        blob_client = self._get_blob_client(key)
        try:
            props = blob_client.get_blob_properties()
            return props.size
        except ResourceNotFoundError as e:
            raise FileNotFoundError(f"Key not found: {key}") from e

    def open(self, key: str) -> BinaryIO:
        """Open and return a readable binary stream for the key.

        For checking magic bytes or reading headers, only stream what is read.
        """
        blob_client = self._get_blob_client(key)
        try:
            # Verify existence first
            if not blob_client.exists():
                raise FileNotFoundError(f"Key not found: {key}")
        except ResourceNotFoundError as e:
            raise FileNotFoundError(f"Key not found: {key}") from e
        return BlobStream(blob_client)

    def read_header(self, key: str, length: int = 32) -> bytes:
        """Read only the first `length` bytes of a blob using a ranged download."""
        blob_client = self._get_blob_client(key)
        try:
            downloader = blob_client.download_blob(offset=0, length=length)
            return downloader.readall()
        except ResourceNotFoundError as e:
            raise FileNotFoundError(f"Key not found: {key}") from e

    def put(self, key: str, data: BinaryIO | bytes) -> None:
        """Write stream or bytes to key in storage."""
        blob_client = self._get_blob_client(key)
        blob_client.upload_blob(data, overwrite=True)
