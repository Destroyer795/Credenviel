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

## Phase 1 — Local Skeleton

**What:** Connect the Go API and Python Worker locally against PostgreSQL and a local queue abstraction. Verify end-to-end local processing with the worker's stub extractor.

**Acceptance tests:**
- [ ] API endpoint `POST /api/v1/jobs` inserts a job row into PostgreSQL with status `awaiting_upload` or `queued`.
- [ ] Worker running with `--stub-extractor` reads the job from the local queue, computes source and fields hashes, and inserts a structured record into PostgreSQL.
- [ ] Worker updates `jobs.status` to `processed`.
- [ ] **Idempotency Re-run Test:** Reprocessing the same job message causes the worker to upsert on conflict (`records.job_id` UNIQUE), creating no duplicate rows, producing identical hashes, and completing cleanly.

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
