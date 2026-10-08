"""Unit tests for worker PDF certificate stamper."""

import io
import uuid
import fitz
import pytest

from worker.stamper import generate_qr_png, stamp_certificate


def test_generate_qr_png():
    """Verify QR code generator produces valid PNG image bytes."""
    data = "https://credenviel.dev/verify/test-verification-uuid-1234"
    qr_png = generate_qr_png(data)
    assert isinstance(qr_png, bytes)
    assert len(qr_png) > 100
    # PNG signature check: \x89PNG\r\n\x1a\n
    assert qr_png.startswith(b"\x89PNG\r\n\x1a\n")


def test_stamp_existing_pdf():
    """Verify stamping an existing PDF appends the QR code and audit banner."""
    # Create a simple 1-page sample source PDF
    src_doc = fitz.open()
    src_page = src_doc.new_page(width=595, height=842)
    src_page.insert_text(fitz.Point(72, 100), "Sample Academic Transcript", fontsize=14)
    raw_pdf_bytes = src_doc.tobytes()
    src_doc.close()

    job_id = str(uuid.uuid4())
    public_id = str(uuid.uuid4())
    fields_hash = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff"
    source_hash = "aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900"

    stamped_bytes = stamp_certificate(
        raw_bytes=raw_pdf_bytes,
        job_id=job_id,
        public_verification_id=public_id,
        fields_hash=fields_hash,
        source_hash=source_hash,
        base_url="https://credenviel.dev",
    )

    assert isinstance(stamped_bytes, bytes)
    assert stamped_bytes.startswith(b"%PDF")

    # Verify stamped PDF contents using fitz
    out_doc = fitz.open(stream=stamped_bytes, filetype="pdf")
    assert len(out_doc) == 1
    page = out_doc[0]
    text = page.get_text()

    assert "Sample Academic Transcript" in text
    assert "CREDENVIEL CRYPTOGRAPHICALLY VERIFIED CREDENTIAL" in text
    assert public_id in text
    assert fields_hash in text
    assert source_hash in text
    assert f"https://credenviel.dev/verify/{public_id}" in text

    # Verify an image was inserted (the QR code)
    images = page.get_images()
    assert len(images) >= 1
    out_doc.close()


def test_stamp_non_pdf_fallback():
    """Verify stamping non-PDF bytes gracefully generates a formatted PDF certificate with QR seal."""
    raw_text_bytes = b"Student Name: Bob Vance\nDegree: Bachelor of Science\nCGPA: 3.85"
    job_id = str(uuid.uuid4())
    public_id = str(uuid.uuid4())
    fields_hash = "445566778899aabbccddeeff11223344445566778899aabbccddeeff11223344"
    source_hash = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"

    stamped_bytes = stamp_certificate(
        raw_bytes=raw_text_bytes,
        job_id=job_id,
        public_verification_id=public_id,
        fields_hash=fields_hash,
        source_hash=source_hash,
        base_url="https://credenviel.dev",
    )

    assert isinstance(stamped_bytes, bytes)
    assert stamped_bytes.startswith(b"%PDF")

    out_doc = fitz.open(stream=stamped_bytes, filetype="pdf")
    assert len(out_doc) == 1
    page = out_doc[0]
    text = page.get_text()

    assert "CREDENVIEL CRYPTOGRAPHICALLY VERIFIED CREDENTIAL" in text
    assert public_id in text
    assert fields_hash in text

    images = page.get_images()
    assert len(images) >= 1
    out_doc.close()
