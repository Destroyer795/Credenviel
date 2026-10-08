"""QR-stamped PDF certificate generator for Credenviel pipeline."""

import io
import logging
import fitz
import qrcode

logger = logging.getLogger("worker.stamper")


def generate_qr_png(data: str, box_size: int = 4, border: int = 1) -> bytes:
    """Generate a high-contrast PNG image of a QR code encoding data."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def stamp_certificate(
    raw_bytes: bytes,
    job_id: str,
    public_verification_id: str,
    fields_hash: str,
    source_hash: str,
    base_url: str = "https://credenviel.dev",
) -> bytes:
    """Stamp a certificate with a cryptographic audit banner and verification QR code.

    Args:
        raw_bytes: Raw bytes of the uploaded certificate (PDF, image, or text fixture).
        job_id: Internal UUID string of the digitization job.
        public_verification_id: Unambiguous public verification identifier.
        fields_hash: SHA-256 digest of canonically normalized extracted fields.
        source_hash: SHA-256 digest of original uploaded raw document.
        base_url: Base verification URL hostname.

    Returns:
        bytes: Stamped PDF document bytes.
    """
    verify_url = f"{base_url.rstrip('/')}/verify/{public_verification_id}"
    qr_bytes = generate_qr_png(verify_url)

    doc = None
    is_pdf = raw_bytes.startswith(b"%PDF")
    if is_pdf:
        try:
            doc = fitz.open(stream=raw_bytes, filetype="pdf")
            if len(doc) == 0:
                doc = None
        except Exception as e:
            logger.warning("Failed to open source bytes as PDF: %s; falling back to generating new PDF", e)
            doc = None

    if doc is None:
        # Generate clean A4 page (595.3 x 841.9 pt)
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)

        # Try inserting raw bytes as an image (e.g. PNG / JPEG scan)
        inserted_image = False
        try:
            img_rect = fitz.Rect(40, 40, 555, 720)
            page.insert_image(img_rect, stream=raw_bytes)
            inserted_image = True
        except Exception:
            pass

        if not inserted_image:
            # Render formatted academic credential layout
            page.draw_rect(fitz.Rect(30, 30, 565, 740), color=(0.85, 0.9, 0.95), width=2)
            page.draw_rect(fitz.Rect(35, 35, 560, 735), color=(0.2, 0.35, 0.6), width=1)
            page.insert_text(
                fitz.Point(70, 90),
                "NATIONAL INSTITUTE OF TECHNOLOGY",
                fontsize=16,
                fontname="helv",
                color=(0.1, 0.25, 0.5),
            )
            page.insert_text(
                fitz.Point(70, 115),
                "OFFICIAL ACADEMIC CREDENTIAL TRANSCRIPT",
                fontsize=11,
                fontname="helv",
                color=(0.3, 0.4, 0.5),
            )
            page.insert_text(
                fitz.Point(70, 160),
                f"Job ID: {job_id}",
                fontsize=9,
                fontname="helv",
                color=(0.4, 0.4, 0.4),
            )
            page.insert_text(
                fitz.Point(70, 185),
                f"Public Verification ID: {public_verification_id}",
                fontsize=10,
                fontname="helv",
                color=(0.1, 0.1, 0.1),
            )
    else:
        # Target last page for verification seal
        page = doc[len(doc) - 1]

    # Calculate audit banner positioning in the bottom margin
    page_w = page.rect.width
    page_h = page.rect.height

    banner_w = page_w - 40
    banner_h = 70
    banner_x0 = 20
    banner_y0 = page_h - banner_h - 15
    banner_rect = fitz.Rect(banner_x0, banner_y0, banner_x0 + banner_w, banner_y0 + banner_h)

    # Draw rounded background card for verification banner
    page.draw_rect(
        banner_rect,
        color=(0.7, 0.82, 0.94),
        fill=(0.97, 0.99, 1.0),
        width=1.0,
    )

    # Insert QR code on the right side of the banner
    qr_size = banner_h - 10
    qr_rect = fitz.Rect(
        banner_rect.x1 - qr_size - 6,
        banner_rect.y0 + 5,
        banner_rect.x1 - 6,
        banner_rect.y0 + 5 + qr_size,
    )
    page.insert_image(qr_rect, stream=qr_bytes)

    # Insert verification text labels
    text_x = banner_rect.x0 + 10
    page.insert_text(
        fitz.Point(text_x, banner_rect.y0 + 15),
        "CREDENVIEL CRYPTOGRAPHICALLY VERIFIED CREDENTIAL",
        fontsize=8,
        fontname="helv",
        color=(0.01, 0.35, 0.65),
    )
    page.insert_text(
        fitz.Point(text_x, banner_rect.y0 + 28),
        f"Public Verification ID: {public_verification_id}",
        fontsize=7.5,
        fontname="helv",
        color=(0.1, 0.15, 0.2),
    )
    page.insert_text(
        fitz.Point(text_x, banner_rect.y0 + 40),
        f"Fields SHA-256: {fields_hash}",
        fontsize=6.5,
        fontname="helv",
        color=(0.25, 0.3, 0.35),
    )
    page.insert_text(
        fitz.Point(text_x, banner_rect.y0 + 51),
        f"Source SHA-256: {source_hash}",
        fontsize=6.5,
        fontname="helv",
        color=(0.25, 0.3, 0.35),
    )
    page.insert_text(
        fitz.Point(text_x, banner_rect.y0 + 62),
        f"Scan QR code or verify online at: {verify_url}",
        fontsize=6.5,
        fontname="helv",
        color=(0.01, 0.45, 0.75),
    )

    output_bytes = doc.tobytes(deflate=True)
    doc.close()
    return output_bytes
