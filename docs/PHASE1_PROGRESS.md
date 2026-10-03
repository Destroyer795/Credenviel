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
