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

## Phase 2 — Cloud Core Infrastructure

**What:** Deploy core Azure cloud resources using the two-pass Bicep workflow. Validate the event-driven upload pipeline in the cloud.

**Workflow:**
1. Bicep Pass 1: Provision ACR, Storage Account (`raw-uploads`, `stamped-documents`), PostgreSQL Flexible Server, Key Vault, Service Bus, SignalR Service, and Container Apps Managed Environment.
2. Build and push Go API and Python Worker images to ACR tagged with Git commit SHA (`${{ github.sha }}`).
3. Bicep Pass 2: Deploy Container Apps and Function App with `apiImageTag` and `workerImageTag` parameters.

**Acceptance tests:**
- [ ] Bicep Pass 1 deploys all foundational cloud resources to a dedicated resource group.
- [ ] Images build and push to ACR tagged with commit SHA.
- [ ] Bicep Pass 2 deploys API and Worker Container Apps and the Azure Function App.
- [ ] Direct browser SAS upload to `raw-uploads` triggers Azure Function via Event Grid.
- [ ] Function validates blob and enqueues job ID to Service Bus `job-processing` queue.
- [ ] KEDA scales worker replicas from 0 → 1 based on queue backlog.
- [ ] Cloud worker dequeues message, processes with stub extractor, and writes record to PostgreSQL Flexible Server.

---

## Phase 3 — Authentication & Authorization

**What:** Microsoft Entra ID integration, app roles (`Issuer`, `Student`), JWT validation middleware in Go API, JIT user provisioning, and scoped user-delegation SAS token generation.

**Acceptance tests:**
- [ ] Unauthenticated requests to protected API endpoints return HTTP 401 Unauthorized.
- [ ] JIT user provisioning creates or updates a `users` row on first authenticated API call.
- [ ] Caller with `Student` app role can only view and manage their own jobs (`uploader_id`).
- [ ] Caller with `Issuer` app role can view all institutional jobs, trigger bulk upload, and access review endpoints.
- [ ] User-delegation SAS tokens are generated dynamically using API managed identity, scoped strictly to the target blob path with write-only permissions.
- [ ] Dev-bypass configuration allows local development without requiring live Entra tokens.

---

## Phase 4 — Extraction & Review Screen

**What:** Integrate trained Azure Document Intelligence custom model, evaluate per-field and per-cell tabular marks confidence against `CONFIDENCE_THRESHOLD`, route low-confidence jobs to `needs_review`, provide short-lived read SAS for document preview, and implement issuer review screen.

**Acceptance tests:**
- [ ] A sample certificate sent to the custom model extracts structured fields (`name`, `roll_number`, `register_number`, `degree`, `marks_json`, `cgpa`, `issue_date`) with per-field confidence scores.
- [ ] If any scalar field or tabular marks cell has confidence < `CONFIDENCE_THRESHOLD`, worker sets `jobs.status = 'needs_review'`.
- [ ] `GET /api/v1/review/:jobId` returns extracted fields and a temporary 15-minute read SAS URL for side-by-side document preview.
- [ ] Issuer can resolve fields (`POST /api/v1/review/:jobId/resolve`), recording prior values in `records.corrections_json` and updating status to `processed`.
- [ ] Issuer can reject illegible submissions (`POST /api/v1/review/:jobId/reject`), updating status to `failed` with audit reason.
- [ ] `verified_by_issuer` is set `true` automatically for issuer uploads, and requires review confirmation for student uploads.

---

## Phase 5 — Verification & SignalR

**What:** Canonical `fields_hash` and `source_hash` generation, QR-stamped PDF generation stored in `stamped-documents`, public verification page with rate limiting, and real-time SignalR status push.

**Acceptance tests:**
- [ ] `source_hash` matches SHA-256 of the uploaded raw document.
- [ ] `fields_hash` matches canonical UTF-8 JSON digest (Unicode NFC, collapsed whitespace, string decimals).
- [ ] Worker generates QR-stamped PDF certificate and uploads it to `stamped-documents/{job_id}/stamped_certificate.pdf`.
- [ ] Public verification endpoint `/api/v1/verify/:publicVerificationId` returns public fields (`name`, `roll_number`, `degree`, `cgpa`, `issue_date`, `source_hash`, `fields_hash`, `verified_by_issuer`) without exposing private transcript marks or registration numbers.
- [ ] Rate limiting enforces a maximum of 30 requests/minute per IP address on the public verification endpoint.
- [ ] Go API pushes live status events (`awaiting_upload → queued → processing → processed / needs_review`) to uploader's SignalR group via REST API without client polling.

---

## Phase 6 — Polish, Reliability & Load-Testing

**What:** Scheduled SAS cleanup Function, Dead-Letter Queue (DLQ) trigger Function (Decision D-008), Azure Monitor alerts, 500-upload burst load test, KEDA scale-to-zero cooldown verification, and final evidence documentation.

**Acceptance tests:**
- [ ] Scheduled cleanup Azure Function scans PostgreSQL for abandoned `awaiting_upload` jobs with expired SAS tokens and transitions them to `failed`.
- [ ] Worker immediately completes message upon unrecoverable fatal application error after setting `jobs.status = 'failed'`.
- [ ] Deliberately dead-lettered message (poison message exceeding 5 delivery attempts) arrives in DLQ:
  - Azure Monitor alert fires on DLQ entity message count > 0.
  - DLQ-trigger Azure Function intercepts message, updates `jobs.status = 'failed'` in PostgreSQL, and logs diagnostic telemetry.
- [ ] Application Insights receives end-to-end distributed traces across API, Functions, and Worker.
- [ ] Burst load test (500 uploads) with `--stub-extractor` verifies p95 latency < 5 minutes from cold start.
- [ ] Load test records actual p50/p95 latency, KEDA 0 → peak replica count, and 5-minute idle scale-to-zero cooldown.
- [ ] All screenshots and performance logs captured per [EVIDENCE.md](EVIDENCE.md).
