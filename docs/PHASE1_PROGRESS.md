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



