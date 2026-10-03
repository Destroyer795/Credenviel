"""Unit tests for magic bytes filetype detection and validation."""

import pytest
from credenviel_shared.filetype import (
    PDF_MAGIC,
    PNG_MAGIC,
    JPEG_MAGIC,
    detect_magic,
    validate_magic,
)


def test_detect_magic_pdf():
    data = b"%PDF-1.7\r\nsome content"
    assert detect_magic(data) == "pdf"


def test_detect_magic_png():
    data = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    assert detect_magic(data) == "png"


def test_detect_magic_jpeg():
    data = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    assert detect_magic(data) == "jpeg"


def test_detect_magic_unknown():
    assert detect_magic(b"") is None
    assert detect_magic(b"HELLO WORLD") is None
    assert detect_magic(b"<!DOCTYPE html>") is None
    assert detect_magic(b"\x00\x00\x00\x00") is None


def test_validate_magic_matches():
    pdf_bytes = b"%PDF-1.4 header"
    assert validate_magic(pdf_bytes, "pdf") is True
    assert validate_magic(pdf_bytes, ".pdf") is True
    assert validate_magic(pdf_bytes, "document.PDF") is True

    png_bytes = PNG_MAGIC + b"extra"
    assert validate_magic(png_bytes, "png") is True
    assert validate_magic(png_bytes, "image.png") is True

    jpeg_bytes = JPEG_MAGIC + b"extra"
    assert validate_magic(jpeg_bytes, "jpg") is True
    assert validate_magic(jpeg_bytes, "jpeg") is True
    assert validate_magic(jpeg_bytes, "photo.JPEG") is True


def test_validate_magic_mismatches():
    # PDF extension with PNG content
    png_bytes = PNG_MAGIC + b"extra"
    assert validate_magic(png_bytes, "pdf") is False

    # JPEG extension with PDF content
    pdf_bytes = PDF_MAGIC + b"extra"
    assert validate_magic(pdf_bytes, "jpg") is False

    # Unknown data with valid extension
    assert validate_magic(b"not an image", "png") is False

    # Valid data with unsupported extension
    assert validate_magic(pdf_bytes, "exe") is False
    assert validate_magic(pdf_bytes, "txt") is False
