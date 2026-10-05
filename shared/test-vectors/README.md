# Deterministic Canonical Fields Hash Test Vectors

This directory contains `fields_hash.json` test vectors for verifying cross-language deterministic hashing of extracted certificate and marksheet records.

## Specification

Follows `docs/CONTRACTS.md` § 6 and `docs/PHASE1_SPEC.md` § 5.8:
- 7 canonical keys in order: `name, roll_number, register_number, degree, marks_json, cgpa, issue_date`
- Strings: Unicode NFC -> collapse whitespace `\s+` -> strip -> lower -> NFC
- Numerics (`cgpa`, `marks_obtained`, `max_marks`): plain decimal strings, no exponent, trailing zeros stripped (`92.0` -> `"92"`, `3.50` -> `"3.5"`, `-0` -> `"0"`)
- Dates: `YYYY-MM-DD`
- Marks rows: exactly 5 keys (`subject_code, subject_name, marks_obtained, max_marks, grade`), sorted by normalized `subject_code` (null first), ties broken by canonical row string
- Serialization: separators `(',', ':')`, `ensure_ascii=False`, UTF-8, SHA-256 lowercase hex

## Independent Hash Verification (Change F)

Each `expected_hash` in `fields_hash.json` is verified independently using the system GNU `sha256sum` utility directly against the raw UTF-8 canonical byte stream without importing or invoking the Python normalizer.

An automated independent verification script is provided at `scripts/verify_vectors.py`:
```bash
python scripts/verify_vectors.py
```
This script iterates through all 13 test vectors in `fields_hash.json`, writes each canonical JSON string's UTF-8 bytes to an isolated temporary file, invokes the system `sha256sum` binary, and confirms the output matches `expected_hash` exactly.

Example manual command:
```bash
printf '%s' '{"name":"jane doe","roll_number":"cs2026-001","register_number":"reg-987654","degree":"bachelor of technology in computer science","marks_json":[{"subject_code":"cs101","subject_name":"data structures","marks_obtained":"88","max_marks":"100","grade":"a"},{"subject_code":"cs102","subject_name":"algorithms","marks_obtained":"92","max_marks":"100","grade":"a+"},{"subject_code":"cs103","subject_name":"operating systems","marks_obtained":"85","max_marks":"100","grade":"a"}],"cgpa":"8.85","issue_date":"2026-05-15"}' > case01.txt
sha256sum case01.txt
# Output: a9c10c881a985266fc9d382a237e670d87560a0ca508b0de650032208284b04a *case01.txt
```

## Parity Risk Flags

Cases with `"parity_risk": true` flag known divergences between Go standard library and Python Unicode semantics (e.g. Turkish `İ`, Greek final sigma `ς` vs `σ`, and Unicode whitespace characters like non-breaking space `\u00a0`). These must be resolved before Go implements its own normalizer in Phase 4.
