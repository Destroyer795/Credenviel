"""Magic bytes filetype detection and validation."""

import os
from pathlib import Path


PDF_MAGIC = b"%PDF-"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


def detect_magic(data: bytes) -> str | None:
    """Detect format from leading bytes. Returns 'pdf', 'png', 'jpeg', or None."""
    if data.startswith(PDF_MAGIC):
        return "pdf"
    if data.startswith(PNG_MAGIC):
        return "png"
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    return None


def validate_magic(data: bytes, filename_or_ext: str) -> bool:
    """Validate that the file bytes match the expected extension.

    Supports 'pdf', 'png', 'jpg', 'jpeg'.
    """
    ext = filename_or_ext.lower()
    if "." in ext:
        ext = ext.rsplit(".", 1)[-1]
    ext = ext.lstrip(".")

    detected = detect_magic(data)
    if detected is None:
        return False

    if ext == "pdf" and detected == "pdf":
        return True
    if ext == "png" and detected == "png":
        return True
    if ext in ("jpg", "jpeg") and detected == "jpeg":
        return True

    return False
