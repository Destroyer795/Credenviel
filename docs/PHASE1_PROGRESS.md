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


