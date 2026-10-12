# Credenviel

## Certificate Digitization and Verification Pipeline

Credenviel converts scanned academic certificates and marksheets into structured, confidence-scored records. It routes uncertain OCR results to an issuer review station, seals accepted records with SHA-256 hashes, and exposes a QR-linked public verification page.

The project addresses the archive backlog that remains outside digital certificate systems: older paper records, scanned certificates, admission verification, placement checks, and institutional document searches.

## Objectives

- Digitize certificates and marksheets into searchable structured records.
- Extract fields and tabular marks with confidence values.
- Route low-confidence or empty OCR results to human review.
- Preserve source and canonical field hashes for tamper evidence.
- Provide QR-based public verification and document viewing.
- Absorb upload bursts through Service Bus and KEDA-scaled workers.
- Keep idle compute close to zero and manage Azure student-credit costs.

## Architecture

![Credenviel architecture on Azure: React SPA, Firebase Authentication, Go REST API and Python worker in an Azure Container Apps environment with KEDA, Blob Storage, Event Grid, Azure Function, Service Bus, Document Intelligence, Azure SignalR and PostgreSQL](assets/architecture-diagram.png)

The diagram follows one document from sign-in to a sealed record. Solid numbered arrows are the upload and processing path, the dotted arrows are KEDA's autoscaling control, and the dashed arrow is browser reads. The Go REST API (`ca-api-n2ivlk5gk235i`) and the Python worker (`ca-worker-n2ivlk5gk235i`) run as two container apps in one Azure Container Apps environment (`cae-cred-n2ivlk5gk235i`).

1. **Sign in.** The browser signs in with Firebase Authentication and receives an ID token.
2. **Create the job.** `POST /api/v1/jobs` with the token; the API verifies it, inserts an `awaiting_upload` job and returns a 15-minute write SAS.
3. **Upload directly.** The browser PUTs the file to the private `raw-uploads` container; file bytes never pass through the API.
4. **React to the upload.** Event Grid emits `BlobCreated` for `raw-uploads/` and pushes it to the Azure Function.
5. **Validate and queue.** The Function checks size and magic bytes, marks the job `queued` in PostgreSQL and enqueues the job id on Service Bus.
6. **Scale and extract.** KEDA watches the queue depth and scales the worker (one replica per 5 waiting messages); the worker receives the message and sends the file to Document Intelligence.
7. **Seal.** In one transaction the worker writes the record with both SHA-256 hashes and the final status, and stores a QR-stamped PDF in `stamped-documents`.
8. **Push status.** The worker calls the API's internal notify endpoint; the API publishes to Azure SignalR, which pushes the status to the browser over WebSocket (portals fall back to polling every 3–4 s).
9. **Read.** The exam cell reviews, approves or rejects through the API, and anyone with the QR code uses the rate-limited public `GET /api/v1/verify/{id}`.

### Job lifecycle

![Job lifecycle: awaiting_upload, queued, processing, then processed or needs_review; needs_review becomes processed when the issuer approves; any state can move to failed](assets/job-lifecycle.png)

Every job has one status that only moves along these arrows. A PostgreSQL trigger (`check_status_transition`) rejects any other change, so a bug or a redelivered message can never move a job backwards. A job is `processed` only when every extracted field and table cell scores at least 0.85; otherwise it goes to `needs_review` for the exam cell. Failures keep their reason on the job.

### Service selection

| Concern | Technology | Reason |
|---|---|---|
| Frontend | React + Vite + Static Web Apps | Fast SPA delivery with HTTPS and client-side routing. |
| API | Go on Azure Container Apps | Small, typed service for authentication, job state, SAS issuance, and verification. |
| OCR | Azure Document Intelligence | Structured fields and confidence scoring rather than plain text OCR. |
| Queue | Azure Service Bus | Durable buffering, retry, and dead-letter handling. |
| Worker | Python on Container Apps | Natural fit for OCR parsing, hashing, PDF stamping, and Azure SDKs. |
| Database | PostgreSQL Flexible Server | Relational users, jobs, records, status transitions, and audit data. |
| Files | Azure Blob Storage | Direct browser upload and private document storage. |
| Events | Event Grid + Azure Function | Validates uploaded blobs before queueing work. |
| Scaling | KEDA | Scales workers from queue depth and returns them to zero when idle. |
| Live status | SignalR | Pushes job status to the uploader without a page refresh. |
| IaC | Bicep | Repeatable Azure resource definitions and environment parameters. |

## Main Features

### Student workflow

1. Authenticate as a student via Firebase.
2. Request a short-lived upload URL (`POST /api/v1/jobs`).
3. Upload scan directly to private Blob Storage via write-only SAS token.
4. Track real-time progress via Azure SignalR (queued, processing, processed, needs-review).
5. Access the tamper-evident digital certificate with SHA-256 cryptographic proof (initially marked **"Uploaded by Student"**).

### Issuer / Exam Cell workflow

1. Authenticate with the Exam Cell / Registrar role (`issuer`).
2. **Document Directory & Search:** Search and filter across the complete document repository by recipient name, roll number, document type, or job ID. Filter by category tabs (*All*, *Pending Approval*, *Needs Review*, *Confirmed*).
3. **Split-Screen Review Station:** Side-by-side inspection of original scan alongside extracted fields and per-cell OCR confidence scores.
4. **Field Correction & Audit:** Edit low-confidence fields before finalizing; corrections are immutably logged in `corrections_json`.
5. **Registrar Endorsement:** Officially approve student-uploaded documents with one click, upgrading the public verification badge to **"Confirmed by University Registrar"**.
6. **Permanent Document Removal:** Delete erroneous or invalidated documents (even after publication) via transactional cascade deletion (`DELETE /api/v1/jobs/:id`).

### Verification workflow

The public verifier accepts a public verification ID or QR code and displays:
- Recipient name, qualification/degree, cumulative CGPA, and issue date.
- Issuing authority and Institutional Verification status:
  - **Uploaded by Student**: Digitized with tamper-evident SHA-256 seal, pending registrar endorsement.
  - **Confirmed by University Registrar**: Cryptographically authenticated and endorsed by university authority.
- Cryptographic audit trail: SHA-256 source scan hash and canonical fields hash.
- Time-limited, secure **View document** SAS link.
- Strict privacy preservation: Transcript marks and internal registration numbers are redacted.

## Security and Data Protection

- Firebase Authentication (email/password and Google) with API-verified ID tokens and issuer/student roles. Setup guide: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
- Student job queries are scoped to the authenticated uploader.
- Issuer-only review and bulk-upload operations.
- User-delegation SAS tokens scoped to one blob path and limited in time.
- Private Blob containers with no public access.
- Secrets supplied through Azure secret references and Key Vault integration.
- TLS for browser, API, Blob, Service Bus, and PostgreSQL traffic.
- Upload extension, MIME, size, and file-content validation.
- Public verification rate limited to protect against harvesting.
- Public verification excludes private registration numbers and transcript marks.

## Data Model

```mermaid
erDiagram
    USERS ||--o{ JOBS : uploads
    JOBS ||--o| RECORDS : produces
    USERS {
        uuid id PK
        string entra_id UK
        string role
        string name
    }
    JOBS {
        uuid id PK
        uuid uploader_id FK
        string status
        string blob_key
        boolean uploader_is_issuer
        string failure_reason
    }
    RECORDS {
        uuid id PK
        uuid job_id FK
        string name
        string roll_number
        string degree
        json marks_json
        json confidence_json
        string source_hash
        string fields_hash
        uuid public_verification_id UK
        boolean verified_by_issuer
    }
```

PostgreSQL migrations enforce foreign keys, unique verification IDs, valid status transitions, and audit timestamps. Worker finalization writes the record and status in one transaction. Redelivered messages are idempotent.

## Reliability and Scaling

- Service Bus absorbs bursts between upload and OCR.
- Worker retries transient infrastructure errors and dead-letters exhausted messages.
- Fatal document errors are marked failed rather than retried indefinitely.
- KEDA scales workers from queue depth and removes idle replicas.
- Function processing is idempotent for repeated blob events.
- SHA-256 source and canonical field hashes detect later changes.
- Empty OCR output is routed to `needs_review`, not falsely marked processed.

## Load Testing and Azure Metrics

All values below are measured; where a value has not been measured, the table says so.

### Azure Monitor: queue burst on 8–9 October 2026

![Azure Monitor metrics, 8 to 9 October 2026: two bursts of queue messages, backlog peaking at 26 and dead-lettered messages at 60, worker replicas flat at 1, Document Intelligence pages processed from 9 October 13:00 UTC](assets/azure-metrics-burst.png)

Hourly metrics read from Azure Monitor (`az monitor metrics list`) on 12 October 2026. Service Bus metrics are namespace-wide, so they include the `job-processing-test` queue as well as `job-processing`.

| Measure | Recorded value | Source |
|---|---|---|
| Uploads (messages enqueued) | 54 between 13:00 and 15:00 UTC on 8 Oct; 64 at 06:00 UTC on 9 Oct | Service Bus `IncomingMessages` |
| Extractor mode | Live worker configured for real OCR (`prebuilt-layout`, F0); no pages were processed during the 8 Oct burst | Worker env, `ProcessedPages` |
| Worker replicas: start / peak / final | 1 / 1 / 1 | Container Apps `Replicas` (hourly max) |
| Time to first extra replica / to peak | Not applicable: the worker never scaled out (no KEDA scale rule is configured) | `Replicas` |
| Peak queue backlog | 26 messages | Service Bus `ActiveMessages` |
| Dead-lettered messages | Rose to 55 on 8 Oct and 60 on 9 Oct; 4 in `job-processing` on 12 Oct | `DeadletteredMessages`, queue count |
| p50 / p95 upload-to-final-status latency | Not measured on Azure (hourly metrics cannot give per-job latency; see below) | — |
| Failed jobs | Not measured (needs a database query) | — |
| Document Intelligence usage | 247 calls and 59 pages in 7 days, about 12% of the F0 free quota of 500 pages a month | `TotalCalls`, `ProcessedPages` |
| PostgreSQL | Burstable B1ms, state `Ready`, so it bills hourly while running | `az postgres flexible-server show` |

`make scale-test-azure` has not been run for this record: its local API connects straight to the Azure PostgreSQL server, whose firewall does not allow the machine used here. Allowing that machine's IP (or running from an allowed network) lets the runner record per-job latency.

### Local load test: authentication and job path

![Local load test output from 11 October 2026: one million requests per phase at 200 concurrent connections with zero transport errors](assets/local-load-test.png)

Run on 11 October 2026 on one development machine: the Go API in `AUTH_MODE=firebase` with Firebase Auth Emulator tokens and a Docker PostgreSQL 16 database. These numbers describe the API's authentication and job-creation path, not the Azure deployment. Across five million requests there were no transport errors and every response had the expected status. Memory stayed near 35 MB and open file descriptors returned to 16 after the run. Twenty-five simultaneous first logins per user created no duplicate users, and forged `role=issuer` tokens created no issuer accounts.

## Local Development

### Prerequisites

- Docker and Docker Compose
- Python 3.11+
- Go 1.22+
- Node.js 22+

```bash
make setup
make up
make migrate
make migrate-local
make test
make test-integration
make demo
```

Run services manually when debugging:

```bash
make run-api
make run-worker
make simulate-upload JOB=<job-uuid>
```

## Deployment

The deployed environment uses Azure Container Apps, Azure Static Web Apps, ACR, Blob Storage, Service Bus, Event Grid, Azure Functions, PostgreSQL, Application Insights, and Azure Monitor.

The documented deployment sequence is:

1. Provision core resources with Bicep.
2. Build and push immutable API/worker image tags to ACR.
3. Deploy Container Apps using those tags.
4. Package and publish the Function App.
5. Enable Event Grid subscription after the Function endpoint exists.
6. Run health and end-to-end checks.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the complete runbook. The GitHub Actions workflow runs build and test checks on every push and pull request. Production deployment currently remains an explicit, credentialed release operation rather than storing cloud credentials in the repository.

## Validation

```bash
cd api && go test ./...
cd ../frontend && npm ci && npm run build
cd .. && python -m pytest worker/tests/test_extractor.py worker/tests/test_normalizer_and_vectors.py -q
az bicep build --file infra/main.bicep
```

The test suite covers API authorization, upload validation, migrations, queue semantics, OCR parsing, confidence routing, hashing vectors, retry/dead-letter behavior, atomic finalization, and Function validation.

## Evaluation Coverage

See [docs/EVALUATION.md](docs/EVALUATION.md) for the 20-mark rubric mapping, reproducible checks, and the small set of presentation evidence that must be captured externally.

## Repository Guide

- [docs/DESIGN.md](docs/DESIGN.md) - detailed architecture report and design decisions
- [docs/CONTRACTS.md](docs/CONTRACTS.md) - API, queue, storage, state, and security contracts
- [docs/DECISIONS.md](docs/DECISIONS.md) - architectural decision records
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) - phased acceptance tests
- [docs/DEPLOY.md](docs/DEPLOY.md) - Azure deployment and verification runbook
- [docs/EVALUATION.md](docs/EVALUATION.md) - evaluator-facing mark coverage
- [docs/EVIDENCE.md](docs/EVIDENCE.md) - reproducible evidence checklist
- [docs/COST.md](docs/COST.md) - Azure student-credit guardrails

## License

This project is open-source and licensed under the [MIT License](LICENSE).
