# Phase 1 Spec: Local Skeleton

**Audience:** the coding agent implementing Phase 1. This file is self-contained. Re-read it at the start of every commit; do not rely on memory of earlier conversation.
**Status:** the plan in this file was drafted by one agent and then reviewed and **approved by a human with changes** (Section 3). Where this file and an older doc disagree, this file wins for Phase 1 work, and you must record the disagreement (Section 12).

---

## 1. Project context (read first)

- **What:** a Certificate Digitization & Verification Pipeline on Azure, built for a university cloud computing course. Issuers (exam cell staff) and students upload scanned certificates and marksheets. A worker extracts structured fields with per-field confidence, flags low-confidence results for human review, computes SHA-256 hashes, and exposes a public verification page.
- **Final cloud stack (NOT used in Phase 1):** React, Go API and Python worker on Azure Container Apps, Event Grid + Azure Function, Service Bus, KEDA scale-to-zero, Document Intelligence, PostgreSQL Flexible Server, Entra ID, SignalR, Key Vault, ACR, Bicep, GitHub Actions.
- **Repo layout:** `api/` (Go), `worker/` (Python), `functions/` (Python), `frontend/` (React/Vite), `db/migrations/`, `infra/` (Bicep), `scripts/`, `docs/`, `shared/` (new in this phase).
- **Docs to read before writing code:** `CLAUDE.md`, `docs/DESIGN.md`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`, `docs/BUILD_PLAN.md` (Phase 1), `db/migrations/001_initial_schema.up.sql` and `.down.sql`, and the existing `api/`, `worker/`, `functions/` skeletons.
- **Where we are:** Phase 0 (scaffolding and docs) is complete and committed. Phase 1 is the first time real logic runs, on a laptop, with no Azure.
- **Environment:** Windows host. Go 1.25.5, Python 3.13, Docker Desktop, `make`, and `sha256sum` (Git Bash) are installed. `psql` is NOT on the host; use `docker compose exec`. Containers `credenviel-postgres-1` and `credenviel-azurite-1` are normally running. Dev DB is `credenviel` (user `credenviel`). Repo path contains spaces; quote paths.
- `az` is installed but may not be on the PATH of an old terminal. You do not need it in this phase.

## 2. Hard rules (non-negotiable)

Earlier work by an agent broke some of these, which is why they are listed explicitly.

1. **No Azure.** Do not create or change any Azure resource. Do not run any `az` command. Do not add Azure SDK dependencies in this phase.
2. **Docker scope.** Only start, stop, or remove containers whose names start with `credenviel-`, and only via this project's `docker compose`. **Never** stop or remove any other container (an earlier run stopped an unrelated container named `surplus_db`; do not repeat that).
3. **Git safety.**
   - Work on a new branch `phase-1-local-skeleton`, created from the current branch.
   - Small logical commits as listed in Section 6.
   - **Never** rewrite history: no `reset`, `rebase`, `--amend` of earlier commits, or force operations. **Do not push.**
   - Never use `git add .` or `git add -A`. Add specific paths only. An untracked architecture PDF sits at the repo root; **do not touch or commit it.**
4. **No fake approvals.** Do not mark any decision or contract as APPROVED. New decisions go into `docs/DECISIONS.md` with status `PROPOSED`. (Existing "APPROVED / ACTIVE" labels were set by an earlier agent, not a human; leave them alone, do not add more.)
5. **Never claim a result you did not see.** A test "passes" only if you ran it and saw it pass. Paste raw command output into `docs/PHASE1_PROGRESS.md`. If you could not run something, write "NOT RUN" and why.
6. **Do not weaken tests to make them pass.** If a test fails three times, stop and report the failure with output. Do not delete tests, skip tests, loosen assertions without explaining why, or use `--no-verify`.
7. **Dev database safety.** Never drop, reset, or truncate the dev DB `credenviel`. Integration tests use a separate database `credenviel_test` that they create and wipe themselves. The test harness must refuse to run unless the database name is exactly `credenviel_test`.
8. **Minimal dependencies.** Go: standard library `net/http` plus `github.com/jackc/pgx/v5` only. Python: `psycopg[binary]` (v3), `pytest`, `hypothesis`. No web frameworks, no ORMs. Pin versions; commit `go.sum` and a Python requirements lock.
9. **No silent decisions.** If a doc is ambiguous or contradictory, do not quietly pick a side. Record it (Section 12) and, if it blocks you, stop and ask.
10. **Checkpoint protocol.** After each commit: run that commit's tests, paste the output into `docs/PHASE1_PROGRESS.md`, then continue. If anything is red, fix it before moving on.

## 3. Human decisions and required changes (already approved)

**Decisions**
1. Status transition guard: **exactly** this allowed set (same-status updates are no-ops):
   - `awaiting_upload -> queued | failed`
   - `queued -> processing | failed`
   - `processing -> processed | needs_review | failed`
   - `needs_review -> processed`
   Do **not** add `needs_review -> failed` or `processed -> failed`. Issuer rejection semantics are a Phase 4 decision; log them as an open question.
2. Create a shared Python package at `shared/python`, installed editable into both `worker` and `functions`.
3. Add a `lock_token UUID` column to the local queue table.
4. Add an insert guard so new `jobs` rows must start as `awaiting_upload`. Test fixtures must reach other states through valid transitions.
5. You may apply migration 002 and the local queue SQL to the dev DB `credenviel` (additive only). `make migrate` must **never** apply `db/local/`; only `make migrate-local` does.
6. You may create a repo-root `.venv` (gitignored), install the Python deps, and run `go get github.com/jackc/pgx/v5`.

**Required changes to the original plan**
- **A.** Add `jobs.uploader_is_issuer BOOLEAN NOT NULL DEFAULT false` in migration 002. Set it at job creation from the caller's role (`issuer` => true). The worker uses it for `verified_by_issuer`. Do **not** look up `users.role` at processing time (a role change must not alter authenticity after the fact).
- **B.** Verify the number of marks cell keys against `docs/CONTRACTS.md`. **Resolved by human: the contract lists five** (`subject_code`, `subject_name`, `marks_obtained`, `max_marks`, `grade`). Use all five everywhere (stub extractor, normalizer, vectors). No contract change needed.
- **C.** Add `fields_hash` test vectors for known Go/Python divergence cases: U+0130 `İ`, final sigma `Σ`, non-breaking space and other Unicode spaces. Flag them `"parity_risk": true` and list them in DECISIONS as must-resolve before Go implements the normalizer.
- **D.** The API listens on `127.0.0.1` by default. Generated job UUIDs must have valid v4 version and variant bits.
- **E.** Time-based tests (lock expiry) need generous margins or an injectable clock, to avoid flaky failures.
- **F.** Test-vector hashes: write each canonical string to a file using `printf '%s' '<canonical>' > file`, then hash with `sha256sum file`. Do not use shell command substitution. Paste the exact commands in DECISIONS or the vectors README.
- **G.** Mark every contract change clearly in CONTRACTS.md. Tick only BUILD_PLAN items whose tests you ran and saw pass.

## 4. Goal

Make the pipeline run end to end locally with no Azure:

`create job via API -> upload file to local storage -> Function stand-in validates and queues -> worker (stub extractor) processes -> hashes computed -> record upserted -> status updated -> API notified (log only)`

**Out of scope for Phase 1:** real auth (Entra), Document Intelligence, Service Bus, Blob, KEDA, QR codes, public verification page, SignalR, read-url, bulk upload, review/reject endpoints, any frontend work, any Azure SDK.

## 5. Design

### 5.1 Local queue (amends decision D-007; record the amendment as PROPOSED)

D-007 said "in-memory fake queue". That cannot work because the Go API, Python worker, and Function stand-in are separate processes. Instead:

- A Postgres table `local_queue_messages` with Service Bus-like peek-lock semantics, kept **out of** `db/migrations` (it is dev-only and must never ship to Azure). Put the SQL in `db/local/001_local_queue.up.sql` and `.down.sql`, applied by `make migrate-local` (pipe the SQL through stdin to `docker compose exec`, so the container is not recreated).
- Columns: `id`, `job_id`, `body jsonb`, `enqueued_at`, `available_at`, `locked_until`, `delivery_count`, `dead_lettered_at`, `dead_letter_reason`, `lock_token UUID`.
- **`receive`**: claims one message using `FOR UPDATE SKIP LOCKED`, FIFO by `(enqueued_at, id)`. Eligible when not dead-lettered, `available_at <= now`, and the lock is null or expired. If the claimed message already has `delivery_count >= MAX_DELIVERY (5)`, dead-letter it (`MaxDeliveryCountExceeded`) and try the next. Otherwise set `locked_until = now + lock duration` (configurable, default 60s), increment `delivery_count`, and set a fresh `lock_token`.
- **`complete`**: deletes the row. **`abandon`**: clears the lock and makes it available immediately. **`dead_letter`**: sets `dead_lettered_at` and the reason. All three require the matching `lock_token` and an unexpired lock, otherwise raise `LockLostError` (like Service Bus).
- A message whose lock expires becomes visible again (this simulates a crashed worker).
- The Go API does **not** use the queue.

### 5.2 Interfaces

**Python** (`shared/python/credenviel_shared/`: `queue.py`, `local_queue.py`, `store.py`, `filetype.py`, `testdb.py`)
```python
class Queue(ABC):  send(body: dict); receive() -> Message | None; complete(m); abandon(m); dead_letter(m, reason)
class Store(ABC):  exists(key); size(key); open(key) -> BinaryIO; put(key, stream)
# LocalFileStore(root): root from env (default .local-storage/, gitignored); rejects any key that resolves outside root
```

**Go** (handlers depend only on interfaces; Postgres implementations live in `internal/db`; unit tests use fakes)
- `auth.IdentitySource.Identify(r) (Identity, error)`. Today: `DevHeaderSource`. Phase 3 adds an Entra JWT source.
- `auth.UserStore.UpsertUser(ctx, Identity) (User, error)`. `auth.Middleware(src, users)` owns the just-in-time upsert (SQL as in CONTRACTS section 4) so changing the identity source never touches it.
- `jobs.Repository`: `Create`, `Get`, `List(filter)`.
- `storage.Store.Put(ctx, key, r, maxBytes)` and `storage.UploadSigner.SignUpload(key, ttl)`, with local implementations `LocalFS` and `LocalSigner`.
- `main` becomes `run(ctx, getenv) error`. It returns an error and **never binds a port** if: `AUTH_MODE=dev` and `APP_ENV != local`; `AUTH_MODE` is anything other than `dev` (Entra arrives in Phase 3); or `INTERNAL_API_KEY` is empty.

### 5.3 Dev auth

Headers `X-Dev-User` (entra_id), `X-Dev-Role` (`issuer` or `student`), `X-Dev-Name`. Enabled only when `AUTH_MODE=dev` AND `APP_ENV=local`. Missing or invalid headers => 401. Replace the old `AUTH_BYPASS` variable in `.env.example` and `config.go`.

### 5.4 Schema: migration 002 (additive only; do NOT edit 001)

- `jobs.failure_reason TEXT NULL` (PROPOSED; flag it).
- `jobs.uploader_is_issuer BOOLEAN NOT NULL DEFAULT false` (change A).
- Trigger `trg_jobs_status_guard` (`BEFORE UPDATE OF status`): same-status passes; anything outside the allowed set (Decision 1) raises `check_violation` naming both statuses.
- Insert guard (Decision 4): new rows must have status `awaiting_upload`.
- Use `IF NOT EXISTS` / `CREATE OR REPLACE` style to match 001. Provide a matching `.down.sql`.
- `make migrate` runs 001 + 002; `make migrate-down` reverses (002 then 001). Neither touches `db/local/`.

### 5.5 API behavior

**POST /api/v1/jobs**, body `{filename, content_type, size_bytes}`
- Sanitize filename: take the basename after splitting on `/` and `\`; replace characters outside `[A-Za-z0-9._-]` with `_`; collapse repeats; strip leading dots; cap at 100 characters keeping the extension.
- 400 if: any field missing, bad JSON, extension not in `pdf|png|jpg|jpeg`, content_type does not match the extension, or `size_bytes` not in `(0, MAX_UPLOAD_BYTES]` (default 4194304).
- `../../etc/passwd` => 400 (no allowed extension). `../../etc/passwd.pdf` => 201 with key `raw-uploads/{job_id}/passwd.pdf`. Test both.
- Generate the job UUID in Go with `crypto/rand` (valid v4 bits) so `blob_key` is written in the same INSERT. No uuid dependency.
- Insert status `awaiting_upload`, `uploader_is_issuer` from the caller's role, `blob_key = raw-uploads/{job_id}/{sanitized_filename}`.
- Response 201: `{job_id, blob_key, upload:{method:"PUT", url:"{PUBLIC_BASE_URL}/dev/upload/{job_id}/{file}", expires_at: now+15m}}` (local `expires_at` is informational).

**PUT /dev/upload/{job_id}/{file}** (registered only in dev mode; needs no dev headers, it mimics a SAS URL)
- 404 unknown job or filename not matching the job's `blob_key`; 409 if job is not `awaiting_upload`; 413 over the size cap.
- Write to a temp file then rename, so the Function never sees a partial file. No file left behind on failure.

**GET /api/v1/jobs** and **GET /api/v1/jobs/{id}**
- Students only see their own jobs. Another student's job, a missing job, or a malformed id => 404 (log this as a PROPOSED decision). Issuers see all. Optional `?status=` filter validated against the six statuses.

**POST /internal/v1/jobs/{id}/notify**
- Header `X-Internal-Secret` compared with `subtle.ConstantTimeCompare` against `INTERNAL_API_KEY`. Wrong or missing => 401. Correct => log `{job_id, status}` and return 204. No SignalR.

### 5.6 Function stand-in (`functions/core.py`)

Importable logic; both `make simulate-upload JOB=<id>` and the (still stubbed) Azure Function trigger will call it. `handle_blob_created(blob_key, deps)` parses `raw-uploads/{uuid}/{file}`.

- **Change nothing and log clearly** if: job unknown; blob missing; key does not match the job's `blob_key`; status is anything other than `awaiting_upload` or `queued`.
- **`awaiting_upload`:** check size within limit and magic bytes match the extension (`%PDF-`; PNG `89 50 4E 47 0D 0A 1A 0A`; JPEG `FF D8 FF`).
  - Valid: guarded UPDATE to `queued` and commit, **then** send the message. A failed send leaves the job `queued`; the retry re-sends.
  - Invalid: set `failed` with `failure_reason`.
- **`queued`:** send again, no error (idempotent; each retry may add one duplicate message, which the worker treats as a no-op).
- `make simulate-upload JOB=<id>` lists `raw-uploads/{id}/` in the local Store and fires one event per blob. An empty directory exercises the "missing blob" path.

### 5.7 Worker (Python)

**Flags:** `--stub-extractor` (required; exit code 2 without it), `--once` (drain then exit), `--stub-profile high|low`. Polls every 1s when empty; stops cleanly on Ctrl-C.

**Per message**
1. Malformed body => dead-letter. Unknown job => complete with a logged error.
2. Job status `processed`, `needs_review`, or `failed` => complete as a no-op. `awaiting_upload` is unexpected => abandon (so it dead-letters visibly; PROPOSED).
3. Mark processing: `UPDATE ... SET status='processing' WHERE status IN ('queued','processing')`, committed separately.
4. Stream the file to compute `source_hash` (SHA-256 of the bytes). Run the stub extractor. Compute `fields_hash` and the confidence evaluation.
5. **One transaction:** `SELECT ... FOR UPDATE` on the job row (if already final, roll back and no-op; this settles concurrent duplicates); upsert the record with `ON CONFLICT (job_id)` updating **only** extracted fields, hashes, and `confidence_json`; set the final status. The upsert must **never** touch `public_verification_id`, `verified_by_issuer`, `reviewed_by`, `reviewed_at`, or `corrections_json` on conflict.
6. Complete the message, then call the API notify endpoint (with `X-Internal-Secret`). A notify failure is logged and swallowed; it must not fail the job.

**Rules**
- `verified_by_issuer` = `jobs.uploader_is_issuer` (change A).
- Confidence threshold from env `CONFIDENCE_THRESHOLD` (default 0.85). Any single field **or single marks cell** below threshold => `needs_review`; otherwise `processed`.
- `confidence_json` shape (PROPOSED): `{threshold, fields:{...}, marks:[{subject_code, cells:{...}}], below_threshold:[...]}`.
- **Errors:** `FatalError` (missing, empty, or unsupported file) => status `failed` + `failure_reason`, then complete the message. Any other exception is transient => abandon. When deliveries exceed the limit the local queue dead-letters the message and the job stays `processing` (the DLQ-trigger Function is Phase 6).
- Test hooks: `before_finalize`, `after_record_upsert`, extractor fault injection. `SimulatedCrash(BaseException)` skips both abandon and complete, simulating a worker that dies.
- **Stub extractor:** fixed fields (`name, roll_number, register_number, degree, marks, cgpa, issue_date`) each with a confidence; marks = 3 subject rows using the five cell keys (`subject_code`, `subject_name`, `marks_obtained`, `max_marks`, `grade`) per change B. Profile `high`: everything above threshold. Profile `low`: `name` at 0.62 and one `grade` cell at 0.41. Tests also need a "single low marks cell only" variant (constructor option).

### 5.8 fields_hash normalization (follow CONTRACTS section 6; all choices below are PROPOSED)

Note: the normalization rule is in CONTRACTS **section 6**, not 5.

| Question | Choice |
|---|---|
| Canonical keys | Always all 7: `name, roll_number, register_number, degree, marks_json, cgpa, issue_date` |
| Missing / None | JSON `null` |
| Empty or whitespace-only string | `null` |
| String pipeline | NFC -> collapse `\s+` (Python Unicode `\s`) -> trim -> `str.lower()` -> NFC |
| lower vs casefold | `lower()`. **Parity risk:** Go's `strings.ToLower` and ASCII-only `\s` differ (e.g. `İ`, final sigma, Unicode spaces) |
| Numeric fields (`cgpa`, `marks_obtained`, `max_marks`) | Numbers or numeric strings become plain decimal strings via `Decimal`: no exponent, no trailing zeros, `92.0` => `"92"`, `-0` => `"0"`. Floats via `repr`. Non-numeric strings treated as text. Booleans rejected. |
| Dates | `date` object or `YYYY-MM-DD` only; anything else raises |
| Marks rows | Exactly the five cell keys (`subject_code`, `subject_name`, `marks_obtained`, `max_marks`, `grade`); a missing key => `null`; an unknown key raises. Sorted by normalized `subject_code` (null first), ties broken by the canonical row string. |
| Serialization | Sorted keys, `(',', ':')` separators, `ensure_ascii=False`, UTF-8, lowercase hex. **Parity risk:** Go needs `SetEscapeHTML(false)` |

**Test vectors** `shared/test-vectors/fields_hash.json`, at least 10 cases + parity cases. Each has the input fields, the exact canonical string, and the expected SHA-256 computed by an **independent tool** (change F). Cases: baseline (stub fields); shuffled key order; extra whitespace; NFD vs NFC; upper vs lower case; `3.50` / `92.0`; missing and null fields; reordered marks rows; empty marks; a non-ASCII (Tamil) name; plus the `parity_risk` cases from change C. The test loader must parse JSON with `parse_float=Decimal` so `3.50` survives.

### 5.9 Tooling

Makefile targets: `setup`, `migrate` (001+002), `migrate-down`, `migrate-local`, `run-api`, `run-worker`, `simulate-upload`, `test` (unit), `test-integration` (needs `make up`), `demo`. Update `.env.example` (AUTH_MODE, APP_ENV, INTERNAL_API_KEY, MAX_UPLOAD_BYTES, PUBLIC_BASE_URL, CONFIDENCE_THRESHOLD, local storage root, queue lock and max-delivery settings; remove AUTH_BYPASS) and `.gitignore` (add `.local-storage/`).

`scripts/demo.py` (cross-platform): generate a random `INTERNAL_API_KEY` for the run; start the API; create a job with dev headers; PUT a tiny generated PDF (about 300 bytes); run simulate-upload; run `worker --once --stub-extractor`; print the resulting `jobs` and `records` rows via `docker compose exec psql`; stop the API. It adds rows to the dev DB but never resets it.

### 5.10 Test harness

- Unit: `pytest -m "not integration"` and `go test ./...`. Integration: `pytest -m integration` and `go test -tags integration`.
- Integration tests connect to the `postgres` DB, run `DROP DATABASE IF EXISTS credenviel_test WITH (FORCE)` then `CREATE DATABASE`, apply 001, 002, and the local queue SQL, and truncate tables between tests. The harness refuses to run unless the DB name is exactly `credenviel_test`.

## 6. Commit plan (branch `phase-1-local-skeleton`)

Each commit contains its tests and the doc changes that go with it. Commit 0 adds this spec.

| # | Commit | Main files |
|---|---|---|
| 0 | `docs: add Phase 1 spec` | `docs/PHASE1_SPEC.md` (this file) |
| 1 | `db: status transition guard, failure_reason, uploader_is_issuer, local queue table` | `db/migrations/002_*.{up,down}.sql`, `db/local/001_local_queue.{up,down}.sql`, `db/tests/test_migrations.py`, Makefile, CONTRACTS section 3, DECISIONS |
| 2 | `shared: Python Queue/Store interfaces, local implementations, test DB harness` | `shared/python/...`, queue and store tests, CONTRACTS (local queue semantics), DECISIONS (D-007 amendment) |
| 3 | `api: dev auth, jobs endpoints, dev upload, internal notify` | `api/...`, CONTRACTS (dev-auth headers, new POST /jobs response shape, dev upload endpoint) |
| 4 | `functions: blob-created core logic and simulate-upload` | `functions/core.py`, `functions/simulate.py`, `function_app.py`, tests, CONTRACTS (Function idempotency rule) |
| 5 | `worker: queue loop, stub extractor, hashing, atomic finalize` | `worker/worker/*`, `shared/test-vectors/fields_hash.json`, tests, DECISIONS (normalization choices) |
| 6 | `tooling, docs: run/test/demo targets, README quick start, build plan` | Makefile, `scripts/demo.py`, `.env.example`, `.gitignore`, README, BUILD_PLAN, `docs/PHASE1_PROGRESS.md` |

## 7. Acceptance tests (all automated except #18)

| # | What must be proven | Planned test |
|---|---|---|
| 1 | Migrations 001+002 apply, roll back, re-apply on `credenviel_test`; guard rejects invalid transitions (e.g. `processed -> queued`) and allows valid ones; insert guard enforced | `db/tests/test_migrations.py::test_apply_rollback_reapply`, `::test_guard_rejects_invalid`, `::test_guard_allows_valid` (every allowed pair), `::test_insert_must_be_awaiting_upload` |
| 2 | Create job: 201, row `awaiting_upload`, user JIT-created, `blob_key` per contract, `uploader_is_issuer` set; traversal filename neutralized | `TestCreateJob_Integration`, `TestSanitizeFilename` |
| 3 | Bad extension, oversize, zero size, missing fields, bad JSON, content-type mismatch => 400 | `TestCreateJob_Validation` |
| 4 | Missing/invalid dev headers => 401; API refuses to start with `AUTH_MODE=dev` unless `APP_ENV=local`; refuses empty `INTERNAL_API_KEY` | `TestAuth_*`, `TestRun_Refuses*` |
| 5 | Student cannot read another student's job (404); issuer sees all; list scoping correct | `TestJobScoping_Integration` |
| 6 | Dev upload writes only for a valid `awaiting_upload` job; enforces size cap; no file left on failure | `TestDevUpload_Integration` |
| 7 | Notify: wrong/missing secret 401, correct 204 | `TestNotify_Secret` |
| 8 | Function stand-in: valid => `queued` + one message; retry safe; bad magic / extension mismatch / oversize => `failed` with reason; missing blob or unknown job => no change | `functions/tests/integration/test_core.py` |
| 9 | Worker happy path: `processed`; `source_hash` equals an independently computed `sha256sum` of the fixture; `fields_hash` matches the shared vector; `verified_by_issuer` correct for issuer vs student; message completed | `test_happy_path_*` |
| 10 | Low profile => `needs_review`, including the case where only a single marks cell is low | `test_low_profile_needs_review`, `test_single_low_marks_cell_needs_review` |
| 11 | Redelivery after completion creates no new record and changes nothing; two workers with duplicate messages => exactly one record, unchanged `public_verification_id` | `test_redelivery_after_completion_is_noop`, `test_concurrent_duplicates_single_record` |
| 12 | Crash simulation: claimed message, worker dies, after lock expiry redelivered (`delivery_count == 2`) and completes | `test_crash_then_lock_expiry_redelivers` |
| 13 | Transient error twice then success => retried and succeeds; errors beyond 5 deliveries => dead-lettered, job still `processing` | `test_transient_twice_then_success`, `test_exceeding_max_delivery_dead_letters` |
| 14 | Fatal errors (empty, unsupported, missing file) => `failed` with reason, message completed | `test_fatal_*` |
| 15 | Notify failure does not fail the job; notify request carries the secret header | `test_notify_failure_does_not_fail_job` |
| 16 | Record upsert and status update are atomic (inject a failure between them; neither persists) | `test_record_and_status_atomic` |
| 17 | Hash vectors pass; property tests (key order, whitespace, NFC/NFD, `3.50` vs `3.5` give the same hash; changing any field changes it) | `test_vectors`, hypothesis tests |
| 18 | `make demo` runs end to end (manual run; paste output) | manual |

Also add queue-semantics tests: two concurrent claimers (SKIP LOCKED), lock lost, abandon, dead-letter.

## 8. Documentation updates (same commits as the code)

- **CONTRACTS.md:** local queue semantics; Function idempotency rule; transition guard; dev-auth header contract; new `POST /jobs` response shape; dev upload endpoint; blob path now uses the **sanitized** filename (was `{original_filename}`). Mark every change to an existing contract clearly.
- **DECISIONS.md:** D-007 amendment and every new choice as `PROPOSED`.
- **BUILD_PLAN.md:** add the 18 acceptance tests under Phase 1; tick only items you ran and saw pass; do not tick other phases even where they overlap.
- **README:** quick start for running Phase 1 locally.

## 9. Open questions to RECORD (do not implement or decide)

1. Issuer rejection semantics (`needs_review -> failed`, `processed -> failed`): Phase 4.
2. Who recomputes `fields_hash` after an issuer correction: DESIGN says the worker, CONTRACTS section 3 says the Go API. Decide before Phase 4; it determines whether Go needs the normalizer.
3. Go/Python normalization parity (`lower()` vs `ToLower`, Unicode `\s`, HTML escaping): must be resolved before Go implements the normalizer.
4. Lost send: if the Function's send keeps failing after retries, the job stays `queued` with no message (outbox or sweeper needed): Phase 6.
5. Notify is not repeated if a worker crashes after committing but before completing the message: Phase 5 reconciliation.
6. Phase 2 packaging: the worker Docker build context must be the repo root to include `shared/`; the Function needs `shared/` vendored.
7. CONTRACTS says the internal endpoint is protected by "internal ingress"; ingress is configured per app, not per route, so the shared secret may be the only protection. Revisit in Phase 2/3.
8. "Any single cell below threshold => review" may flag too many documents on large marksheets; treat the threshold as tunable.

## 10. Known doc contradictions (record them; resolutions noted where the human has decided)

1. Normalization is CONTRACTS section 6, not 5.
2. CONTRACTS section 3 diagram vs the approved guard list: **resolved** (Decision 1: use the approved list).
3. Who writes `failed`: CONTRACTS section 3 limits the Function to SAS-expiry and DLQ cases, but the Function stand-in also writes `failed` for invalid files: new writer path, record it.
4. DESIGN says the job records whether the uploader is an issuer but `jobs` had no column: **resolved** (change A).
5. DESIGN says the worker recomputes `fields_hash`; CONTRACTS says the Go API updates records on resolve: **open** (Section 9, item 2).
6. BUILD_PLAN says a redelivered message "upserts on conflict"; under this design a redelivery after completion is a no-op and the conflict path only runs for concurrent duplicates. Same outcome, different wording; fix the wording.
7. CONTRACTS section 2 blob path and section 5 `POST /jobs` response differ from this spec: mark as contract changes.
8. `.env.example` and `config.go` use `AUTH_BYPASS`: **resolved** (replace with `AUTH_MODE` / `APP_ENV`).
9. BUILD_PLAN Phases 3 to 6 contain items partly covered here: tick Phase 1 only.

## 11. Verification the human will do (so you do not have to claim anything you cannot show)

After you finish, the human will run: `git status`, `git log --oneline`, `git diff main..phase-1-local-skeleton --stat`, `make test`, `make test-integration`, `make demo`, an independent `sha256sum` on a fixture compared with the stored `source_hash`, and `\d jobs` / `\d records` in psql. Make sure all of these work from a clean checkout.

## 12. Final report (required)

1. Files changed, grouped by commit.
2. A table mapping each acceptance test (1 to 18) to its test name and the **raw output** proving it passed. Mark "NOT RUN" honestly.
3. Contract or schema changes needing human review.
4. Every PROPOSED decision you made.
5. Doc contradictions and open questions found (including any not listed above).
6. Anything you could not do or verify.