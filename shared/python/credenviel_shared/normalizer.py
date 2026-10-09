"""Deterministic canonical normalization and hashing for fields_hash.

Follows docs/CONTRACTS.md § 6 and docs/PHASE1_SPEC.md § 5.8.
"""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
from typing import Any
import unicodedata

CANONICAL_KEYS = [
    "name",
    "roll_number",
    "register_number",
    "degree",
    "marks_json",
    "cgpa",
    "issue_date",
]

MARKS_CELL_KEYS = [
    "subject_code",
    "subject_name",
    "marks_obtained",
    "max_marks",
    "grade",
]

_WHITESPACE_RE = re.compile(r"\s+")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_string(val: Any) -> str | None:
    """Normalize a string: NFC -> collapse whitespace -> trim -> lower -> NFC.

    Empty or whitespace-only strings become None (JSON null).
    Booleans raise TypeError.
    """
    if val is None:
        return None
    if isinstance(val, bool):
        raise TypeError("Booleans not permitted for text fields")

    s = str(val)
    s = unicodedata.normalize("NFC", s)
    s = _WHITESPACE_RE.sub(" ", s).strip()
    s = s.lower()
    s = unicodedata.normalize("NFC", s)

    return s if s != "" else None


def normalize_numeric(val: Any) -> str | None:
    """Normalize numeric fields (cgpa, marks_obtained, max_marks).

    Numbers become plain decimal strings: no exponent, no trailing zeros.
    e.g. 92.0 -> "92", 3.50 -> "3.5", -0 -> "0".
    Non-numeric strings treated as text via normalize_string.
    Booleans raise TypeError.
    """
    if val is None:
        return None
    if isinstance(val, bool):
        raise TypeError("Booleans not permitted for numeric fields")

    # If it's a float, convert via repr to preserve precision
    if isinstance(val, float):
        d_str = repr(val)
    else:
        d_str = str(val).strip()

    try:
        d = Decimal(d_str)
        # Check if -0
        if d == 0:
            return "0"
        # Format as fixed point and strip trailing zeros
        s = f"{d:f}"
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        if s in ("-0", ""):
            s = "0"
        return s
    except InvalidOperation:
        # Non-numeric string: normalize as string
        return normalize_string(val)


def normalize_date(val: Any) -> str | None:
    """Normalize issue_date. Must be a date object or valid YYYY-MM-DD string."""
    if val is None:
        return None
    if isinstance(val, bool):
        raise TypeError("Booleans not permitted for date field")

    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")

    s = str(val).strip()
    if not _DATE_RE.match(s):
        raise ValueError(f"Invalid date format: '{val}'. Expected YYYY-MM-DD.")

    # Validate real calendar date
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError as e:
        raise ValueError(f"Invalid date: '{val}': {e}")

    return s


def normalize_marks_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single marks row with exactly the 5 keys."""
    # Check for unknown keys
    for k in row.keys():
        if k not in MARKS_CELL_KEYS:
            raise ValueError(f"Unknown key in marks row: '{k}'. Allowed: {MARKS_CELL_KEYS}")

    norm_row = {
        "subject_code": normalize_string(row.get("subject_code")),
        "subject_name": normalize_string(row.get("subject_name")),
        "marks_obtained": normalize_numeric(row.get("marks_obtained")),
        "max_marks": normalize_numeric(row.get("max_marks")),
        "grade": normalize_string(row.get("grade")),
    }
    return norm_row


def normalize_marks(val: Any) -> list[dict[str, Any]] | None:
    """Normalize marks array: exactly 5 cell keys, sorted by normalized subject_code (null first)."""
    if val is None:
        return None
    if isinstance(val, str):
        # Could be JSON string
        s = val.strip()
        if not s:
            return None
        val = json.loads(s)

    if not isinstance(val, list):
        raise ValueError("marks must be a list of subject rows")

    if len(val) == 0:
        return []

    norm_rows = [normalize_marks_row(r) for r in val]

    # Sort rows by normalized subject_code (null first), ties broken by canonical row string
    def sort_key(row):
        code = row["subject_code"]
        row_json = json.dumps(row, separators=(",", ":"), ensure_ascii=False)
        return (0 if code is None else 1, code or "", row_json)

    norm_rows.sort(key=sort_key)
    return norm_rows


def canonicalize_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Normalize all canonical fields into canonical structure."""
    marks_val = fields.get("marks_json")
    if marks_val is None:
        marks_val = fields.get("marks")

    res = {
        "name": normalize_string(fields.get("name")),
        "roll_number": normalize_string(fields.get("roll_number")),
        "register_number": normalize_string(fields.get("register_number")),
        "degree": normalize_string(fields.get("degree")),
        "marks_json": normalize_marks(marks_val),
        "cgpa": normalize_numeric(fields.get("cgpa")),
        "issue_date": normalize_date(fields.get("issue_date")),
    }

    doc_type = normalize_string(fields.get("document_type"))
    if doc_type and doc_type != "grade_sheet":
        res["document_type"] = doc_type

    attrs_val = fields.get("attributes")
    if attrs_val is None:
        attrs_val = fields.get("attributes_json")
    if attrs_val:
        if isinstance(attrs_val, str):
            try:
                attrs_val = json.loads(attrs_val)
            except Exception:
                attrs_val = {}
        if isinstance(attrs_val, dict) and attrs_val:
            norm_attrs = {}
            for k in sorted(attrs_val.keys()):
                k_norm = normalize_string(k)
                v_norm = normalize_string(attrs_val[k])
                if k_norm and v_norm:
                    norm_attrs[k_norm] = v_norm
            if norm_attrs:
                res["attributes"] = norm_attrs

    return res


def to_canonical_json(fields: dict[str, Any]) -> str:
    """Produce deterministic canonical JSON string."""
    canonical = canonicalize_fields(fields)
    return json.dumps(canonical, separators=(",", ":"), ensure_ascii=False)


def compute_fields_hash(fields: dict[str, Any]) -> str:
    """Compute SHA-256 hex digest of canonicalized fields JSON."""
    canonical_json = to_canonical_json(fields)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
