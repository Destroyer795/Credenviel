# Build Plan

> Source: [DESIGN.md](DESIGN.md) § Build order
>
> Follow each step in order. Each step ends with its acceptance test passing.
> After the build, the report gets one final pass with measured results and real screenshots.

---

## Phase 0 — Scaffolding & Documentation (DONE)

**What:** Project directory layout, documentation source of truth, PostgreSQL initial schema migration, service code skeletons (Go API, Python worker, Python Azure Function, React Vite frontend), Bicep infrastructure templates, Makefile, and local docker-compose stack.

**Acceptance tests (PASSED):**
- [x] `docker compose up` starts PostgreSQL and Azurite containers
- [x] Migration applies cleanly (`make migrate-down`, `make migrate`, `make migrate` idempotent)
- [x] Database `jobs.updated_at` trigger automatically updates on row update via `clock_timestamp()`
- [x] Redundant indexes removed in favor of PostgreSQL `UNIQUE` constraints
- [x] `go build ./...` and `go test ./...` pass in `api/`
- [x] Worker import and CLI tests pass in `worker/`
- [x] Azure Function import tests pass in `functions/`
- [x] `npm run build` succeeds in `frontend/` with clean assets and no template leftovers
- [x] `docker compose config` validates without errors
- [x] `az bicep build --file infra/main.bicep` succeeds with exit code 0

---

## Phase 1 — Local Skeleton (DONE)

**What:** Connect Go API, Python Azure Function stand-in, and Python Worker locally against PostgreSQL and a local queue abstraction (`local_queue_messages`). Verify end-to-end local processing with dev auth, sanitized blob upload, stub extractor, canonical normalization, fields hashing, and atomic transaction finalize.

**Acceptance tests (PASSED):**
- [x] **Test 1:** Migrations 001+002 apply, roll back, re-apply on `credenviel_test`; transition guard rejects invalid transitions (e.g. `processed -> queued`) and allows valid ones; insert guard enforces `awaiting_upload` (`db/tests/test_migrations.py`).
- [x] **Test 2:** Create job: HTTP 201, status `awaiting_upload`, user JIT-created, `blob_key` sanitized per contract, `uploader_is_issuer` set; path traversal neutralized (`api/internal/server/integration_test.go`).
- [x] **Test 3:** Job creation validation: bad extension, oversize, zero size, missing fields, bad JSON, content-type mismatch => HTTP 400 (`api/internal/server/server_test.go`, `jobs_test.go`).
- [x] **Test 4:** Dev auth headers: missing or invalid headers => HTTP 401; API refuses to start with `AUTH_MODE=dev` unless `APP_ENV=local`; refuses empty `INTERNAL_API_KEY` (`api/cmd/server/run_test.go`, `auth_test.go`).
- [x] **Test 5:** Job lookup scoping: student cannot read another student's job (HTTP 404); issuer sees all; list filter scoping correct (`api/internal/server/integration_test.go`).
- [x] **Test 6:** Dev upload: writes only for valid `awaiting_upload` job; enforces size cap; atomic temp file rename with no file left behind on failure (`api/internal/server/integration_test.go`).
- [x] **Test 7:** Internal notify: wrong or missing secret returns HTTP 401; correct secret returns HTTP 204 (`api/internal/server/server_test.go`).
- [x] **Test 8:** Function stand-in: valid upload transitions to `queued` + enqueues message; retry safe & idempotent on `queued`; bad magic bytes / extension mismatch / oversize => `failed` with `failure_reason`; missing blob or unknown job => no change (`functions/tests/integration/test_core.py`).
- [x] **Test 9:** Worker happy path: status `processed`; `source_hash` equals independently computed SHA-256 of fixture; `fields_hash` matches shared vector; `verified_by_issuer` correct for issuer vs student; message completed (`worker/tests/integration/test_processor.py::test_happy_path_student`, `::test_happy_path_issuer`).
- [x] **Test 10:** Low confidence routing: low profile => `needs_review`, including the case where only a single marks cell is low (`worker/tests/integration/test_processor.py::test_low_profile_needs_review`, `::test_single_low_marks_cell_needs_review`).
- [x] **Test 11:** Redelivery & concurrency: redelivery after completion is a no-op and creates no new record; concurrent workers processing duplicate messages produce exactly one record with unchanged `public_verification_id` (`worker/tests/integration/test_processor.py::test_redelivery_after_completion_is_noop`, `::test_concurrent_duplicates_single_record`).
- [x] **Test 12:** Worker crash simulation: claimed message, worker dies (`SimulatedCrash`), lock expires, redelivery succeeds with `delivery_count == 2` and completes (`worker/tests/integration/test_processor.py::test_crash_then_lock_expiry_redelivers`).
- [x] **Test 13:** Retries & dead-lettering: transient error twice then success => retried and succeeds; errors exceeding 5 deliveries => dead-lettered in queue, job status stays `processing` (`worker/tests/integration/test_processor.py::test_transient_twice_then_success`, `::test_exceeding_max_delivery_dead_letters`).
- [x] **Test 14:** Fatal errors: missing file, empty (0 bytes) file, unsupported file format => status `failed` with `failure_reason`, message completed (`worker/tests/integration/test_processor.py::test_fatal_*`).
- [x] **Test 15:** Internal notify resilience: notify failure does not fail the job; notify request carries `X-Internal-Secret` header and payload (`worker/tests/integration/test_processor.py::test_notify_*`).
- [x] **Test 16:** Database atomicity: record upsert and status update are atomic in a single transaction; failure mid-transaction rolls back both (`worker/tests/integration/test_processor.py::test_record_and_status_atomic`).
- [x] **Test 17:** Canonical fields hashing: all 13 shared test vectors pass; property tests verify key ordering invariance, whitespace collapsing invariance, Decimal trailing zero formatting, and field mutation sensitivity (`worker/tests/test_normalizer_and_vectors.py`).
- [x] **Test 18:** End-to-end local demo: `make demo` / `python scripts/demo.py` executes full pipeline from job creation to worker extraction and database verification (`scripts/demo.py`).

---

## Phase 2 — Cloud Core Infrastructure (DONE)

**What:** Run the real event-driven pipeline on Azure, all infrastructure as Bicep, in three gated sub-phases. Full procedure, owner commands and agent prompts: [PHASE2_HANDOVER.md](PHASE2_HANDOVER.md) (where it differs from the runbook, the handover wins).

**Scope changes from the earlier plan:**
- The Go API runs **on the owner's laptop against Azure** and is **NOT deployed** in Phase 2 (it would run with dev auth). It is deployed to Container Apps in Phase 3 once real auth exists.
- User-delegation SAS generation moves from Phase 3 into Phase 2 (needed for the real browser-style upload).
- SignalR is removed from Phase 2 and stays in Phase 5.
- The single two-pass workflow is split into 2a, 2b and 2c (D-012's two-pass image-tag approach still applies to the worker in 2c).

**Sub-phases** (each ends at a checkpoint before the next starts; the owner runs every mutating `az` command, the reviewer reads every Bicep diff and `what-if`):

### 2a — Bootstrap
Monitoring workspace, ACR, Key Vault, Storage (with CORS), Service Bus, user-assigned managed identity with role assignments.
- [x] `az bicep build` and `lint` clean; `what-if` reviewed; all expected resources exist with tags `project=credenviel`, `env=dev`; nothing unexpected. Tag `phase-2a`.

### 2b — Data and real adapters
Postgres Flexible Server, test resources, Azure adapters (Service Bus queue, Blob store, Go user-delegation SAS), Azure migrate/test/run targets.
- [x] A real SAS upload (with `x-ms-blob-type: BlockBlob`) lands in Blob.
- [x] A real message round-trips on Service Bus.
- [x] Migrations 001 and 002 applied to Azure Postgres.
- [x] `make test` and `make test-integration` still green; Postgres stopped at end of session. Tag `phase-2b`.

### 2c — Compute and end-to-end
Container Apps environment, worker app with KEDA rule, Function app, Event Grid subscription (behind a flag), Dockerfile, packaging, e2e and scale-test scripts.
- [x] `az bicep build`, lint, `what-if` clean; resources in the dedicated group with tags.
- [x] Real upload triggers the Function via Event Grid; job becomes `queued`; message lands on Service Bus.
- [x] Worker scales 0 to at least 1, job `processed` with the stub extractor, record row in Azure Postgres.
- [x] Replicas return to 0 after the 5-minute cooldown.
- [x] Worker shuts down cleanly on SIGTERM (scale-in does not lose or corrupt a job).
- [x] `make test`, `make test-integration` and CI green; secret scan clean; Postgres stopped.
- [x] Evidence captured; merged with a merge commit; tag `phase-2`.

---

## Phase 3 — Authentication & Authorization (DONE)

**What:** Microsoft Entra ID integration, app roles (`Issuer`, `Student`), JWT validation middleware in Go API, JIT user provisioning, and scoped user-delegation SAS token generation (implemented in Phase 2; here it moves to the API's managed identity). Also: decide the Entra tenant strategy (app registration is blocked in the university tenant; see D-031 / Q-010) and deploy the API to Container Apps once real auth exists.

**Acceptance tests:**
- [x] Unauthenticated requests to protected API endpoints return HTTP 401 Unauthorized (`api/internal/auth/jwt.go`, `server_test.go`).
- [x] JIT user provisioning creates or updates a `users` row on first authenticated API call.
- [x] Caller with `Student` app role can only view and manage their own jobs (`uploader_id`).
- [x] Caller with `Issuer` app role can view all institutional jobs, trigger bulk upload, and access review endpoints.
- [x] User-delegation SAS tokens are generated dynamically using API managed identity, scoped strictly to the target blob path with write-only permissions (`api/internal/storage/azure.go`).
- [x] Entra tenant strategy decided and recorded (D-045 personal developer Entra tenant with mock JWT fallback; D-046 Azure Static Web Apps; D-047 GitHub Actions federated credential).
- [x] Go API deployed to Container Apps with real auth (`AUTH_MODE=jwt` on `ca-api-n2ivlk5gk235i` in `eastasia`; verified `/healthz` returning 200 and unauthenticated `/api/v1/jobs` returning 401).
- [x] Azure Static Web App deployed on Free tier in `eastasia` (`stapp-cred-n2ivlk5gk235i`).
- [x] GitHub Actions Passwordless Federated Identity Credentials deployed on User-Assigned Managed Identity (`id-credenviel-n2ivlk5gk235i`).
- [x] Dev-bypass configuration allows local development without requiring live Entra tokens (`AUTH_MODE=dev`).

---

## Phase 4 — Extraction & Review Screen (DONE)

**What:** Integrate trained Azure Document Intelligence custom model, evaluate per-field and per-cell tabular marks confidence against `CONFIDENCE_THRESHOLD`, route low-confidence jobs to `needs_review`, provide short-lived read SAS for document preview, and implement issuer review screen.

**Acceptance tests (PASSED):**
- [x] A sample certificate sent to the custom model extracts structured fields (`name`, `roll_number`, `register_number`, `degree`, `marks_json`, `cgpa`, `issue_date`) with per-field confidence scores (`worker/worker/extractor.py`, `worker/tests/test_extractor.py`).
- [x] If any scalar field or tabular marks cell has confidence < `CONFIDENCE_THRESHOLD`, worker sets `jobs.status = 'needs_review'` (`worker/worker/extractor.py`, `worker/worker/__main__.py`).
- [x] `GET /api/v1/review/:jobId` returns extracted fields and a temporary 15-minute read SAS URL for side-by-side document preview (`api/internal/server/server.go`, `api/internal/storage/azure.go`).
- [x] Issuer can resolve fields (`POST /api/v1/review/:jobId/resolve`), recording prior values in `records.corrections_json` and updating status to `processed` (`api/internal/server/server.go`, `api/internal/normalizer`).
- [x] Issuer can reject illegible submissions (`POST /api/v1/review/:jobId/reject`), updating status to `failed` with audit reason (`db/migrations/003_review_rejection_guard.up.sql`, `api/internal/server/server.go`).
- [x] `verified_by_issuer` is set `true` automatically for issuer uploads, and requires review confirmation for student uploads (`api/internal/db/postgres.go`, `frontend/src/pages/ReviewScreen.jsx`).

---

## Phase 5 — Verification & SignalR (DONE)

**What:** Canonical `fields_hash` and `source_hash` generation, QR-stamped PDF generation stored in `stamped-documents`, public verification page with rate limiting, and real-time SignalR status push.

**Acceptance tests (PASSED):**
- [x] `source_hash` matches SHA-256 of the uploaded raw document (`worker/worker/processor.py`).
- [x] `fields_hash` matches canonical UTF-8 JSON digest (Unicode NFC, collapsed whitespace, string decimals) (`api/internal/normalizer/normalizer.go`, `credenviel_shared/normalizer.py`).
- [x] Worker generates QR-stamped PDF certificate and uploads it to `stamped-documents/{job_id}/stamped_certificate.pdf` (`worker/worker/stamper.py`, `worker/worker/processor.py`).
- [x] Public verification endpoint `/api/v1/verify/:publicVerificationId` returns public fields (`name`, `roll_number`, `degree`, `cgpa`, `issue_date`, `source_hash`, `fields_hash`, `verified_by_issuer`) without exposing private transcript marks or registration numbers (`api/internal/server/server.go`, `api/internal/records/records.go`).
- [x] Rate limiting enforces a maximum of 30 requests/minute per IP address on the public verification endpoint (`api/internal/server/ratelimit.go`, `api/internal/server/server_test.go`).
- [x] Go API pushes live status events (`awaiting_upload → queued → processing → processed / needs_review`) to uploader's SignalR group via REST API without client polling (`api/internal/signalr/signalr.go`, `api/internal/server/server.go`).

---

## Phase 6 — Polish, Reliability & Load-Testing (DONE)

**What:** Scheduled SAS cleanup Function, Dead-Letter Queue (DLQ) trigger Function (Decision D-008), Azure Monitor alerts, 500-upload burst load test, KEDA scale-to-zero cooldown verification, and final evidence documentation.

**Acceptance tests (PASSED):**
- [x] Scheduled cleanup Azure Function scans PostgreSQL for abandoned `awaiting_upload` jobs with expired SAS tokens and transitions them to `failed` (`functions/core.py`, `functions/function_app.py`, `functions/tests/test_phase6_functions.py`).
- [x] Worker immediately completes message upon unrecoverable fatal application error after setting `jobs.status = 'failed'` (`worker/worker/processor.py`, `worker/tests/integration/test_processor.py::test_fatal_*`).
- [x] Deliberately dead-lettered message (poison message exceeding 5 delivery attempts) arrives in DLQ:
  - Azure Monitor alert fires on DLQ entity message count > 0 (`infra/modules/service-bus.bicep`).
  - DLQ-trigger Azure Function intercepts message, updates `jobs.status = 'failed'` in PostgreSQL, and logs diagnostic telemetry (`functions/core.py`, `functions/function_app.py`, `functions/tests/test_phase6_functions.py`).
- [x] Application Insights receives end-to-end distributed traces across API, Functions, and Worker (`infra/modules/monitoring.bicep`).
- [x] Burst load test (500 uploads) with `--stub-extractor` verifies p95 latency < 5 minutes from cold start (`scripts/load_test.py`, `scripts/scale_test_azure.py`).
- [x] Load test records actual p50/p95 latency, KEDA 0 → peak replica count, and 5-minute idle scale-to-zero cooldown (`scripts/load_test.py`).
- [x] All evidence capture templates and load-test runners integrated per [EVIDENCE.md](EVIDENCE.md).
