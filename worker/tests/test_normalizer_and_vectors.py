"""Unit and property tests for normalization and test vectors (Acceptance Test 17)."""

from decimal import Decimal
import json
import os
from pathlib import Path
import pytest
from hypothesis import given, strategies as st

from credenviel_shared.normalizer import (
    compute_fields_hash,
    to_canonical_json,
    canonicalize_fields,
    normalize_string,
    normalize_numeric,
    normalize_marks,
)

VECTORS_PATH = Path(__file__).resolve().parents[2] / "shared" / "test-vectors" / "fields_hash.json"


def test_vectors():
    """Verify all test vectors in shared/test-vectors/fields_hash.json."""
    assert VECTORS_PATH.is_file(), f"Vectors file missing: {VECTORS_PATH}"

    # Load with parse_float=Decimal so 3.50 survives without float conversion
    with open(VECTORS_PATH, "r", encoding="utf-8") as f:
        cases = json.load(f, parse_float=Decimal)

    assert len(cases) >= 10, f"Expected at least 10 vectors, got {len(cases)}"

    for case in cases:
        cid = case["id"]
        fields = case["fields"]
        expected_canonical = case["canonical_json"]
        expected_hash = case["expected_hash"]

        actual_canonical = to_canonical_json(fields)
        assert actual_canonical == expected_canonical, (
            f"[{cid}] Canonical JSON mismatch:\nGot:  {actual_canonical}\nWant: {expected_canonical}"
        )

        actual_hash = compute_fields_hash(fields)
        assert actual_hash == expected_hash, (
            f"[{cid}] Hash mismatch:\nGot:  {actual_hash}\nWant: {expected_hash}"
        )


def test_numeric_trailing_zeros():
    """Verify numeric decimal formatting removes trailing zeros."""
    assert normalize_numeric("92.0") == "92"
    assert normalize_numeric("3.50") == "3.5"
    assert normalize_numeric("100.000") == "100"
    assert normalize_numeric("-0") == "0"
    assert normalize_numeric("0.0") == "0"
    assert normalize_numeric(Decimal("8.80")) == "8.8"
    assert normalize_numeric(Decimal("90.00")) == "90"


def test_property_key_ordering():
    """Key ordering in input dictionary does not change hash."""
    f1 = {
        "name": "Alice",
        "roll_number": "1",
        "register_number": "R1",
        "degree": "BTech",
        "marks_json": None,
        "cgpa": "9.5",
        "issue_date": "2026-01-01",
    }
    f2 = {
        "issue_date": "2026-01-01",
        "degree": "BTech",
        "cgpa": "9.5",
        "name": "Alice",
        "register_number": "R1",
        "marks_json": None,
        "roll_number": "1",
    }
    assert compute_fields_hash(f1) == compute_fields_hash(f2)


def test_property_whitespace_collapsing():
    """Extra whitespace collapses to single space."""
    f1 = {"name": "Bob Builder", "cgpa": "8.0", "issue_date": "2026-01-01"}
    f2 = {"name": "  Bob   \t  Builder  \n", "cgpa": "  8.0  ", "issue_date": " 2026-01-01 "}
    assert compute_fields_hash(f1) == compute_fields_hash(f2)


def test_property_modifying_field_changes_hash():
    """Changing any field must change the fields_hash."""
    base = {
        "name": "Jane Doe",
        "roll_number": "CS01",
        "register_number": "REG01",
        "degree": "CS",
        "marks_json": [
            {"subject_code": "CS1", "subject_name": "DS", "marks_obtained": "80", "max_marks": "100", "grade": "A"}
        ],
        "cgpa": "8.5",
        "issue_date": "2026-05-01",
    }
    base_hash = compute_fields_hash(base)

    mutations = [
        {"name": "Jane Roe"},
        {"roll_number": "CS02"},
        {"register_number": "REG02"},
        {"degree": "IT"},
        {"cgpa": "8.6"},
        {"issue_date": "2026-05-02"},
        {"marks_json": [{"subject_code": "CS1", "subject_name": "DS", "marks_obtained": "81", "max_marks": "100", "grade": "A"}]},
    ]

    for mut in mutations:
        modified = dict(base)
        modified.update(mut)
        assert compute_fields_hash(modified) != base_hash
