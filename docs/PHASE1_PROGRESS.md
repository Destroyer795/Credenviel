# Phase 1 Progress Log

This file tracks the implementation of Phase 1 (Local Skeleton) on branch `phase-1-local-skeleton`.
Raw test outputs and execution logs are captured per commit.

---

## Commit 0: docs: add Phase 1 spec

- **Branch:** `phase-1-local-skeleton`
- **Commit hash:** `b9a2c17`
- **Files:** `docs/PHASE1_SPEC.md`
- **Corrections applied:**
  - Standardized on 5 marks cell keys per `docs/CONTRACTS.md` (`subject_code`, `subject_name`, `marks_obtained`, `max_marks`, `grade`).
  - Spec file renamed from `docs/PHASE1_SPECS.md` to `docs/PHASE1_SPEC.md`.

---

## Commit 1: db: status transition guard, failure_reason, uploader_is_issuer, local queue table

- **Files:**
  - `db/migrations/002_status_guard.up.sql`
  - `db/migrations/002_status_guard.down.sql`
  - `db/local/001_local_queue.up.sql`
  - `db/local/001_local_queue.down.sql`
  - `db/tests/conftest.py`
  - `db/tests/test_migrations.py`
  - `requirements-dev.txt`
  - `pytest.ini`
  - `Makefile`
  - `.gitignore`
  - `docker-compose.yml` (host port 5433 mapped to container 5432 to avoid host conflict with unrelated container `surplus_db`)
  - `docs/CONTRACTS.md`
  - `docs/DECISIONS.md`
  - `docs/PHASE1_PROGRESS.md`

### Test Output: Migration Test Suite (Acceptance Test 1)

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.0, pluggy-1.6.0
rootdir: C:\Users\PRANAV KISHAN\Desktop\forked trash\Credenviel
configfile: pytest.ini
plugins: anyio-4.10.0, hypothesis-6.122.3, asyncio-1.4.0, django-4.12.0
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 43 items

db\tests\test_migrations.py ...........................................  [100%]

============================= 43 passed in 4.47s ==============================
```

- **Make migrate verification:**
  - `make migrate`: Successfully applied `001_initial_schema.up.sql` and `002_status_guard.up.sql` against local dev DB.
  - `make migrate-local`: Successfully applied `db/local/001_local_queue.up.sql` via stdin against local dev DB.

---

## Commit 2: shared: Python Queue/Store interfaces, local implementations, test DB harness

- **Files:**
  - `shared/python/pyproject.toml`
  - `shared/python/README.md`
  - `shared/python/credenviel_shared/__init__.py`
  - `shared/python/credenviel_shared/queue.py`
  - `shared/python/credenviel_shared/local_queue.py`
  - `shared/python/credenviel_shared/store.py`
  - `shared/python/credenviel_shared/filetype.py`
  - `shared/python/credenviel_shared/testdb.py`
  - `shared/python/tests/conftest.py`
  - `shared/python/tests/test_filetype.py`
  - `shared/python/tests/test_queue.py`
  - `shared/python/tests/test_store.py`
  - `docs/CONTRACTS.md` (Local Queue peek-lock contract)
  - `docs/DECISIONS.md` (D-025 amending D-007)
  - `docs/PHASE1_PROGRESS.md`

### Test Output: Shared Package Test Suite

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.0, pluggy-1.6.0
rootdir: C:\Users\PRANAV KISHAN\Desktop\forked trash\Credenviel
configfile: pytest.ini
plugins: anyio-4.10.0, hypothesis-6.122.3, asyncio-1.4.0, django-4.12.0
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collected 22 items

shared\python\tests\test_filetype.py ......                              [ 27%]
shared\python\tests\test_queue.py ..........                             [ 72%]
shared\python\tests\test_store.py ......                                 [100%]

============================= 22 passed in 2.76s ==============================
```

---

## Commit 3: api: dev auth, jobs endpoints, dev upload, internal notify

- **Files:**
  - `api/go.mod` (added `github.com/jackc/pgx/v5` and `pgxpool`)
  - `api/go.sum`
  - `api/cmd/server/main.go` (run function, pre-bind startup validation, graceful shutdown)
  - `api/cmd/server/run_test.go` (startup validation tests)
  - `api/internal/config/config.go` (AUTH_MODE, APP_ENV, INTERNAL_API_KEY, LoadWith)
  - `api/internal/auth/auth.go` (User, Identity, DevHeaderSource, JIT Middleware)
  - `api/internal/auth/auth_test.go` (auth header validation tests)
  - `api/internal/jobs/jobs.go` (Job domain models, Repository interface)
  - `api/internal/jobs/uuid.go` (UUID v4 generator with RFC 4122 bits)
  - `api/internal/jobs/uuid_test.go` (UUID bit compliance tests)
  - `api/internal/jobs/sanitize.go` (Filename sanitization, upload validation)
  - `api/internal/jobs/sanitize_test.go` (Sanitization and validation tests)
  - `api/internal/storage/storage.go` (Store, LocalFS with atomic writes, LocalSigner)
  - `api/internal/db/postgres.go` (PostgreSQL implementation of UserStore & Job Repository)
  - `api/internal/server/server.go` (HTTP router and handlers)
  - `api/internal/server/server_test.go` (Unit tests for endpoints, notify, scoping)
  - `api/internal/server/integration_test.go` (Integration tests: TestCreateJob_Integration, TestJobScoping_Integration, TestDevUpload_Integration)
  - `docs/CONTRACTS.md` (Dev auth contract, sanitized blob path, dev upload endpoint, 201 response contract)
  - `docs/DECISIONS.md` (D-026 404 scoping for unauthorized job queries)
  - `docs/PHASE1_PROGRESS.md`

### Test Output: Go API Unit & Integration Tests

```
=== RUN   TestHealthz
--- PASS: TestHealthz (0.00s)
=== RUN   TestRun_RefusesEmptyInternalAPIKey
--- PASS: TestRun_RefusesEmptyInternalAPIKey (0.00s)
=== RUN   TestRun_RefusesDevAuthWhenNotLocal
--- PASS: TestRun_RefusesDevAuthWhenNotLocal (0.00s)
=== RUN   TestRun_RefusesNonDevAuthMode
--- PASS: TestRun_RefusesNonDevAuthMode (0.00s)
PASS
ok  	github.com/Destroyer795/Credenviel/api/cmd/server	0.132s
=== RUN   TestAuth_MissingHeaders
--- PASS: TestAuth_MissingHeaders (0.00s)
=== RUN   TestAuth_InvalidRole
--- PASS: TestAuth_InvalidRole (0.00s)
=== RUN   TestAuth_Success
--- PASS: TestAuth_Success (0.00s)
PASS
ok  	github.com/Destroyer795/Credenviel/api/internal/auth	0.464s
=== RUN   TestSanitizeFilename
=== RUN   TestSanitizeFilename/neutralizes_path_traversal_with_pdf
=== RUN   TestSanitizeFilename/neutralizes_windows_path_traversal_with_png
=== RUN   TestSanitizeFilename/collapses_repeated_underscores_and_strips_leading_dots
=== RUN   TestSanitizeFilename/replaces_special_characters
=== RUN   TestSanitizeFilename/caps_at_100_characters_keeping_extension
=== RUN   TestSanitizeFilename/rejects_traversal_without_allowed_extension_(passwd)
--- PASS: TestSanitizeFilename (0.00s)
=== RUN   TestCreateJob_Validation
--- PASS: TestCreateJob_Validation (0.00s)
=== RUN   TestUUIDv4_Bits
--- PASS: TestUUIDv4_Bits (0.00s)
PASS
ok  	github.com/Destroyer795/Credenviel/api/internal/jobs	0.353s
=== RUN   TestCreateJob_Integration
--- PASS: TestCreateJob_Integration (0.36s)
=== RUN   TestJobScoping_Integration
--- PASS: TestJobScoping_Integration (0.09s)
=== RUN   TestDevUpload_Integration
--- PASS: TestDevUpload_Integration (0.14s)
=== RUN   TestNotify_Secret
--- PASS: TestNotify_Secret (0.00s)
=== RUN   TestCreateJob_Unit
--- PASS: TestCreateJob_Unit (0.00s)
=== RUN   TestJobScoping
--- PASS: TestJobScoping (0.00s)
=== RUN   TestDevUpload_Unit
--- PASS: TestDevUpload_Unit (0.00s)
PASS
ok  	github.com/Destroyer795/Credenviel/api/internal/server	0.925s
```

---

## Commit 4: functions: blob-created core logic and simulate-upload

- **Files:**
  - `functions/__init__.py`
  - `functions/core.py` (handle_blob_created, FunctionDeps, HandleResult, validation rules)
  - `functions/simulate.py` (CLI simulate-upload runner)
  - `functions/function_app.py` (Azure Function Event Grid handler wiring)
  - `functions/tests/integration/test_core.py` (Acceptance Test 8: valid queued, idempotency, bad magic, oversize, empty, missing, unknown, mismatch, non-actionable)
  - `Makefile` (added simulate-upload target)
  - `pytest.ini` (pythonpath configuration)
  - `docs/CONTRACTS.md` (Function Idempotency Rule)
  - `docs/PHASE1_PROGRESS.md`

### Test Output: Functions Integration Test Suite (Acceptance Test 8)

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.0, pluggy-1.6.0 -- C:\Users\PRANAV KISHAN\AppData\Local\Programs\Python\Python313\python.exe
cachedir: .pytest_cache
hypothesis profile 'default' -> database=DirectoryBasedExampleDatabase(WindowsPath('C:/Users/PRANAV KISHAN/Desktop/forked trash/Credenviel/.hypothesis/examples'))
rootdir: C:\Users\PRANAV KISHAN\Desktop\forked trash\Credenviel
configfile: pytest.ini
plugins: anyio-4.10.0, hypothesis-6.122.3, asyncio-1.4.0, django-4.12.0
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 11 items

functions/tests/integration/test_core.py::test_valid_upload_transitions_to_queued_and_enqueues PASSED [  9%]
functions/tests/integration/test_core.py::test_retry_safe_idempotent_on_queued PASSED [ 18%]
functions/tests/integration/test_core.py::test_bad_magic_bytes_fails_job PASSED [ 27%]
functions/tests/integration/test_core.py::test_extension_mismatch_fails_job PASSED [ 36%]
functions/tests/integration/test_core.py::test_oversize_file_fails_job PASSED [ 45%]
functions/tests/integration/test_core.py::test_empty_file_fails_job PASSED [ 54%]
functions/tests/integration/test_core.py::test_missing_blob_does_not_change_job PASSED [ 63%]
functions/tests/integration/test_core.py::test_unknown_job_does_nothing PASSED [ 72%]
functions/tests/integration/test_core.py::test_blob_key_mismatch_does_nothing PASSED [ 81%]
functions/tests/integration/test_core.py::test_non_actionable_status_does_nothing PASSED [ 90%]
functions/tests/test_function.py::test_function_app_imports PASSED       [100%]

============================= 11 passed in 1.65s ==============================
```

---

## Commit 5: worker: queue loop, stub extractor, hashing, atomic finalize

- **Files:**
  - `shared/python/credenviel_shared/normalizer.py` (canonical NFC string pipeline, Decimal normalization, 5-key marks rows sorting, canonical JSON serialization, fields_hash SHA-256)
  - `shared/python/credenviel_shared/testdb.py` (ensure_test_database, ensure_test_schema, get_test_connection)
  - `shared/test-vectors/fields_hash.json` (13 test vectors including stub baseline, shuffled keys, Unicode whitespace, NFD vs NFC, trailing zeros, missing/null, Tamil non-ASCII name, and parity risk cases independently verified via GNU sha256sum)
  - `shared/test-vectors/README.md`
  - `worker/worker/extractor.py` (StubExtractor with high, low, and single_low_marks profiles)
  - `worker/worker/confidence.py` (evaluate_confidence per field and marks table cell, formatted confidence_json)
  - `worker/worker/processor.py` (WorkerProcessor implementing spec § 5.7: validation, dead-lettering, status mark, source_hash streaming, stub extraction, canonical normalization, fields_hash, ACID SELECT FOR UPDATE with record upsert preserving public_verification_id, API notify with X-Internal-Secret)
  - `worker/worker/config.py` and `worker/worker/__main__.py` (CLI flags: `--stub-extractor` required with exit 2 if absent, `--once`, `--stub-profile`, `--poll-interval`)
  - `worker/tests/test_normalizer_and_vectors.py` (Acceptance Test 17: 13 test vectors verified, trailing zero tests, hypothesis property-based tests for key ordering, whitespace collapsing, field mutation hash changes)
  - `worker/tests/test_worker.py` (Smoke and CLI tests: `--help`, `--stub-extractor --once`, missing flag exit 2)
  - `worker/tests/integration/__init__.py`
  - `worker/tests/integration/test_processor.py` (Acceptance Tests 9-16: happy path student/issuer, low profile needs_review, single low marks cell needs_review, redelivery idempotency no-op, concurrent duplicates single record, crash simulation lock expiry redelivery, transient retries & DLQ max delivery, fatal missing/empty/unsupported file, notify resilience & secret header, record/status atomic rollback)
  - `functions/tests/integration/test_core.py` (updated to use get_test_connection)
  - `docs/DECISIONS.md` (D-027 normalizer choices, D-028 confidence shape, D-029 worker error categorization)
  - `docs/PHASE1_PROGRESS.md`

### Test Output: Worker Test Suite (Acceptance Tests 9 to 17)

```
============================= test session starts =============================
platform win32 -- Python 3.13.5, pytest-8.4.0, pluggy-1.6.0 -- C:\Users\PRANAV KISHAN\AppData\Local\Programs\Python\Python313\python.exe
cachedir: .pytest_cache
hypothesis profile 'default' -> database=DirectoryBasedExampleDatabase(WindowsPath('C:/Users/PRANAV KISHAN/Desktop/forked trash/Credenviel/.hypothesis/examples'))
rootdir: C:\Users\PRANAV KISHAN\Desktop\forked trash\Credenviel
configfile: pytest.ini
plugins: anyio-4.10.0, hypothesis-6.122.3, asyncio-1.4.0, django-4.12.0
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 25 items

worker/tests/integration/test_processor.py::test_happy_path_student PASSED [  4%]
worker/tests/integration/test_processor.py::test_happy_path_issuer PASSED [  8%]
worker/tests/integration/test_processor.py::test_low_profile_needs_review PASSED [ 12%]
worker/tests/integration/test_processor.py::test_single_low_marks_cell_needs_review PASSED [ 16%]
worker/tests/integration/test_processor.py::test_redelivery_after_completion_is_noop PASSED [ 20%]
worker/tests/integration/test_processor.py::test_concurrent_duplicates_single_record PASSED [ 24%]
worker/tests/integration/test_processor.py::test_crash_then_lock_expiry_redelivers PASSED [ 28%]
worker/tests/integration/test_processor.py::test_transient_twice_then_success PASSED [ 32%]
worker/tests/integration/test_processor.py::test_exceeding_max_delivery_dead_letters PASSED [ 36%]
worker/tests/integration/test_processor.py::test_fatal_missing_file PASSED [ 40%]
worker/tests/integration/test_processor.py::test_fatal_empty_file PASSED [ 44%]
worker/tests/integration/test_processor.py::test_fatal_unsupported_file PASSED [ 48%]
worker/tests/integration/test_processor.py::test_notify_failure_does_not_fail_job PASSED [ 52%]
worker/tests/integration/test_processor.py::test_notify_carries_secret_header_and_payload PASSED [ 56%]
worker/tests/integration/test_processor.py::test_record_and_status_atomic PASSED [ 60%]
worker/tests/test_normalizer_and_vectors.py::test_vectors PASSED         [ 64%]
worker/tests/test_normalizer_and_vectors.py::test_numeric_trailing_zeros PASSED [ 68%]
worker/tests/test_normalizer_and_vectors.py::test_property_key_ordering PASSED [ 72%]
worker/tests/test_normalizer_and_vectors.py::test_property_whitespace_collapsing PASSED [ 76%]
worker/tests/test_normalizer_and_vectors.py::test_property_modifying_field_changes_hash PASSED [ 80%]
worker/tests/test_worker.py::test_worker_imports PASSED                  [ 84%]
worker/tests/test_worker.py::test_worker_config_defaults PASSED          [ 88%]
worker/tests/test_worker.py::test_worker_cli_help PASSED                 [ 92%]
worker/tests/test_worker.py::test_worker_stub_extractor_flag PASSED      [ 96%]
worker/tests/test_worker.py::test_worker_fails_without_stub_extractor PASSED [100%]

============================= 25 passed in 4.83s ==============================
```

---

## Commit 6: tooling, docs: run/test/demo targets, README quick start, build plan

- **Files:**
  - `Makefile` (added setup, run-api, run-worker, simulate-upload, test, test-integration, demo targets)
  - `scripts/demo.py` (cross-platform end-to-end demo script)
  - `.env.example` (Phase 1 configuration: APP_ENV, AUTH_MODE, INTERNAL_API_KEY, LOCAL_STORAGE_ROOT, etc.)
  - `README.md` (Quick Start for Phase 1 local development and testing)
  - `docs/BUILD_PLAN.md` (Updated Phase 1 status to DONE with all 18 passing acceptance tests)
  - `docs/DECISIONS.md` (Recorded open questions Q-001 through Q-008 and decisions D-027 through D-029)
  - `docs/PHASE1_PROGRESS.md`

### Test Output: End-to-End Demo (Acceptance Test 18)

```
======================================================================
Credenviel Phase 1 Local Skeleton Demo
======================================================================
[*] Configuration:
    - Database URL: postgres://credenviel:localdev@localhost:5433/credenviel?sslmode=disable
    - API Port: 8080
    - Internal API Key: 598d6ece... (redacted)
    - Local Storage Root: C:\Users\PRANAV KISHAN\Desktop\forked trash\Credenviel\.local-storage
    - Demo PDF Size: 477 bytes

[1/6] Starting Go API server...
    API is healthy and listening.

[2/6] Creating job via POST /api/v1/jobs...
    Job created successfully:
    - Job ID:   ce271e5b-12c0-41b1-badf-7689b0141f3f
    - Blob Key: raw-uploads/ce271e5b-12c0-41b1-badf-7689b0141f3f/degree_certificate.pdf
    - Dev Upload URL: http://localhost:8080/dev/upload/ce271e5b-12c0-41b1-badf-7689b0141f3f/degree_certificate.pdf

[3/6] Uploading PDF via PUT dev upload endpoint...
    Uploaded 477 bytes to local store.

[4/6] Running simulate-upload (Function stand-in)...
    simulate-upload output:
      Firing blob_created event for 'raw-uploads/ce271e5b-12c0-41b1-badf-7689b0141f3f/degree_certificate.pdf'...
      Result: action=queued, job_id=ce271e5b-12c0-41b1-badf-7689b0141f3f, reason=None

[5/6] Running Python worker with --once --stub-extractor...
    worker output:
      2026-10-05 11:03:58,498 INFO worker: Running with STUB extractor (load-test mode)
      2026-10-05 11:03:58,498 INFO worker: Stub extractor profile: high
      2026-10-05 11:03:58,520 INFO worker: Worker started, polling queue 'job-processing'...
      2026-10-05 11:04:00,631 INFO worker: Processed message 2: outcome=processed
      2026-10-05 11:04:02,723 INFO worker: Processed message 34: outcome=processed
      2026-10-05 11:04:02,726 INFO worker: Queue empty and --once flag set; exiting.
      2026-10-05 11:04:02,726 INFO worker: Worker stopped.

[6/6] Pipeline Results from PostgreSQL:
----------------------------------------------------------------------
>> jobs row:
-[ RECORD 1 ]------+------------------------------------------------------------------------
id                 | ce271e5b-12c0-41b1-badf-7689b0141f3f
status             | processed
failure_reason     | 
uploader_is_issuer | f
blob_key           | raw-uploads/ce271e5b-12c0-41b1-badf-7689b0141f3f/degree_certificate.pdf
created_at         | 2026-10-05 05:33:55.294383+00
updated_at         | 2026-10-05 05:34:00.643352+00

>> records row:
-[ RECORD 1 ]----------+-----------------------------------------------------------------
id                     | 23943105-2f3c-44af-bcff-13c32ee968ed
job_id                 | ce271e5b-12c0-41b1-badf-7689b0141f3f
public_verification_id | 3cd0b4a1-167a-4df0-a531-94ddac73c9f7
name                   | jane doe
roll_number            | cs2026-001
degree                 | bachelor of technology in computer science
cgpa                   | 8.85
issue_date             | 2026-05-15
source_hash            | 4c06f68bff19cc9d624f1b110d8e5a20bf633cf6a8097e5fec407b756168f253
fields_hash            | a9c10c881a985266fc9d382a237e670d87560a0ca508b0de650032208284b04a
verified_by_issuer     | f

======================================================================
Demo completed successfully! End-to-end pipeline is operational.
======================================================================
```

---

## Phase 1 Review Fixes (`phase-1-fixes`)

### Fix F1: Test Database Harness Isolation (`15f46e7`)
- Moved `testdb.py` out of runtime package `shared/python/credenviel_shared/` to test harness directory `shared/python/tests/testdb.py`.
- Updated all test fixtures in `shared/python/tests/conftest.py`, `functions/tests/integration/test_core.py`, and `worker/tests/integration/test_processor.py`.
- Added `shared/python/tests/test_package_hygiene.py` asserting that `credenviel_shared` exports no administrative DB functions (`CREATE DATABASE`, `DROP DATABASE`, `TRUNCATE TABLE`) and that `credenviel_shared.testdb` raises `ModuleNotFoundError`.

### Fix F2: Raw Storage & Normalized Hashing (`72b7577`)
- `worker/worker/processor.py`: Modified `records` table upsert to store raw extracted fields (`name`, `roll_number`, `register_number`, `degree`, and `marks` in extraction order). Normalization is performed strictly on an in-memory copy for computing `fields_hash`.
- `worker/worker/extractor.py`: Updated `StubExtractor` to return realistic mixed-case and irregularly spaced fields (e.g. `"  Jane   DOE "`, `" CS2026-001 "`, `"  Bachelor   of Technology  in Computer Science "`). Normalization guarantees the baseline `fields_hash` remains identical (`a9c10c881a985266fc9d382a237e670d87560a0ca508b0de650032208284b04a`).
- `worker/tests/integration/test_processor.py`: Verified that stored `records.name` preserves raw casing/whitespace while `fields_hash` is unchanged. Added regression test rebuilding fields dict from stored `records` row and recomputing `compute_fields_hash()` to prove identity.
- `docs/CONTRACTS.md` § 6: Documented extractor contract requiring ISO `YYYY-MM-DD` date and numeric string `cgpa`, and documented the raw storage vs normalized hashing rule.
- `docs/DECISIONS.md`: Logged D-030 (PROPOSED) and Q-009 (open question deferred to Phase 4).

### Fix F3: Go Integration Test Database Guard (`6a79d7e`)
- Extracted database name validation into `api/internal/server/db_guard.go` (`ValidateTestDBName`).
- Added unit tests in `api/internal/server/db_guard_test.go` proving it rejects `"credenviel"`, `"postgres"`, `""`, `"   "`, `"surplus_db"`, and accepts `"credenviel_test"`.
- Wired `ValidateTestDBName(testDBName)` into `ensureTestDB` in `api/internal/server/integration_test.go`.

### Fix F4: Dev DB Investigation & Proposed Cleanup SQL

#### Read-Only Investigation of `credenviel` (Port 5433)
1. `pg_stat_user_tables`:
   - `jobs`: `n_tup_ins: 1, n_tup_upd: 5, n_tup_del: 0` (4 rows present)
   - `local_queue_messages`: `n_tup_ins: 1, n_tup_upd: 2, n_tup_del: 2` (0 rows present)
   - `records`: `n_tup_ins: 2, n_tup_upd: 0, n_tup_del: 0` (3 rows present)
   - `users`: `n_tup_ins: 0, n_tup_upd: 1, n_tup_del: 0` (1 row present)
2. Sequence status:
   - `SELECT last_value FROM local_queue_messages_id_seq;` -> `34`
3. Sequence ID consumption explanation:
   - Message ID 1 was used by initial demo run on 2026-10-03 (job `5b97282b...`).
   - Message ID 2 was enqueued by demo run on 2026-10-03 (job `2a71d08c...`), which was left uncompleted when the demo worker process was interrupted.
   - Message IDs 3 through 33: In PostgreSQL, sequence `nextval` is monotonic and not rolled back. IDs 3 to 33 were consumed either by transactions that rolled back, uncompleted/aborted runs of `simulate-upload`, or test/script iterations where sequence numbers advanced without surviving tuple commits.
   - Message ID 34 was enqueued by the Commit 6 demo run on 2026-10-05 (job `ce271e5b...`). When the worker ran with `--once`, it consumed both pending message 2 and message 34, completing both.

#### Proposed Cleanup SQL for Dev DB `credenviel` (For Human Review & Execution)
```sql
-- Proposal to clean up stray dev DB demo/orphan rows in 'credenviel'
-- Run this manually against 'credenviel' on host port 5433:

DELETE FROM records WHERE job_id IN (
    '8623db6a-5f01-4439-9d7b-c05e5f1d5346',
    '5b97282b-6d1c-42bb-9d17-76be83974df7',
    '2a71d08c-0b29-441d-88ac-85cff7287d01',
    'ce271e5b-12c0-41b1-badf-7689b0141f3f'
);

DELETE FROM jobs WHERE id IN (
    '8623db6a-5f01-4439-9d7b-c05e5f1d5346',
    '5b97282b-6d1c-42bb-9d17-76be83974df7',
    '2a71d08c-0b29-441d-88ac-85cff7287d01',
    'ce271e5b-12c0-41b1-badf-7689b0141f3f'
);

-- Reset sequence to 1 for clean subsequent demo runs:
ALTER SEQUENCE local_queue_messages_id_seq RESTART WITH 1;
```

### Fix F6: Lock Expiry Determinism, Independent Vector Verification & Azurite Config
- **Change E:** Replaced `time.sleep(1.2)` in `shared/python/tests/test_queue.py` (`test_lock_expiry_redelivers`) with direct DB-driven lock expiry (`UPDATE local_queue_messages SET locked_until = now() - interval '1 second'`).
- **Change F:** Created `scripts/verify_vectors.py` which reads `shared/test-vectors/fields_hash.json` and invokes system `sha256sum` directly on temp files for every vector without importing `normalizer.py`. Updated `shared/test-vectors/README.md`.
- **Extra:** Replaced `AccountKey` connection string in `.env.example` with `UseDevelopmentStorage=true` targeting local Azurite emulator.
