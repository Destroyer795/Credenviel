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

```mermaid
flowchart TB
    %% Client & Identity Tier
    subgraph ClientTier ["1. Presentation & Verifier Layer (Azure Static Web Apps)"]
        direction LR
        StudentUI["🎓 Student Portal<br/>• Self-Service Upload<br/>• Job Lifecycle Tracker"]
        IssuerUI["🏛️ Exam Cell Review Station<br/>• Live Directory Search<br/>• Split-Screen OCR Inspection<br/>• Registrar Approval & Delete"]
        VerifyUI["🔍 Public Verification Page<br/>• QR Scanner & Proof Seal<br/>• Temporary Document Viewer"]
    end

    subgraph AuthLayer ["Identity & Access Control"]
        FirebaseAuth["🔐 Firebase Authentication<br/>• Google OAuth & Email/Password<br/>• Role Claims: student | issuer"]
    end

    %% Ingestion & API Gateway Tier
    subgraph APITier ["2. API Gateway & Management (Azure Container Apps)"]
        direction TB
        GoAPI["⚡ Go REST API Service<br/>• Auth Middleware & JIT User Provisioning<br/>• User-Delegation Write SAS Signer<br/>• Job CRUD & Cascading Record Deletion<br/>• Rate-Limited Public Verifier (/verify/:id)"]
    end

    %% Direct Storage & Event-Driven Triggers
    subgraph IngestionPipeline ["3. Direct Ingestion & Event Grid Trigger"]
        direction TB
        RawUploads[("📦 Azure Blob Storage<br/>Container: raw-uploads<br/>• Private Access & Direct PUT")]
        EventGrid["⚡ Azure Event Grid<br/>• System Topic: Microsoft.Storage<br/>• Event: BlobCreated"]
        AzFunction["⚙️ Azure Function (Python)<br/>• MIME & Magic Byte Security Validation<br/>• State Transition: awaiting_upload ➔ queued"]
    end

    %% Async Decoupling & Serverless Processing
    subgraph ComputeTier ["4. Asynchronous Queue & Auto-Scaling (KEDA)"]
        direction TB
        ServiceBus["📬 Azure Service Bus<br/>• Queue: job-processing<br/>• Dead-Letter Queue (DLQ) for Poison Messages"]
        KEDA["📈 KEDA Metric Autoscaler<br/>• Scales Workers 0 ➔ N from Queue Depth<br/>• Scale-to-Zero on Idle"]
        Worker["🐍 Python Processing Worker<br/>(Azure Container Apps)"]
    end

    %% AI Intelligence & Cryptography
    subgraph ExtractionCrypto ["5. AI Extraction & Cryptographic Sealing"]
        direction TB
        DocIntel["🧠 Azure AI Document Intelligence<br/>• Structured Field Extraction<br/>• Per-Field & Cell Confidence Scores"]
        CryptoEngine["🔒 Cryptographic Engine<br/>• Canonical Unicode NFC Normalization<br/>• SHA-256 Source & Fields Hash<br/>• QR-Stamped Verification PDF"]
        StampedDocs[("📜 Azure Blob Storage<br/>Container: stamped-documents<br/>• QR Stamped Certificate PDFs")]
    end

    %% Persistence & Live Updates
    subgraph DataTier ["6. Persistence, Secrets & Live Telemetry"]
        direction TB
        Postgres[("🐘 Azure PostgreSQL Flexible Server<br/>• Tables: users, jobs, records<br/>• Trigger Guards: trg_jobs_status_guard")]
        KeyVault["🔑 Azure Key Vault<br/>• Managed Identity Secret Injection"]
        SignalR["📡 Azure SignalR Service<br/>• Live Job Status Broadcast to Frontend"]
    end

    %% Connections & Workflows
    ClientTier -.->|Authenticate| FirebaseAuth
    FirebaseAuth -.->|Bearer JWT Token| GoAPI

    %% 1. Upload Flow
    StudentUI -->|1. Request Upload SAS| GoAPI
    IssuerUI -->|1. Request Upload SAS| GoAPI
    GoAPI -->|2. Generate 15-min PUT SAS| ClientTier
    ClientTier -->|3. Direct PUT Upload| RawUploads

    %% 2. Ingestion Flow
    RawUploads -->|4. BlobCreated Event| EventGrid
    EventGrid -->|5. Push Event| AzFunction
    AzFunction -->|6. Set Status: queued| Postgres
    AzFunction -->|7. Enqueue job_id message| ServiceBus

    %% 3. Worker Processing Flow
    ServiceBus -->|Queue Depth Metric| KEDA
    KEDA -.->|Scale 0 ➔ N Replicas| Worker
    ServiceBus -->|8. Peek-Lock Message| Worker
    Worker -->|9. Extract Certificate Data| DocIntel
    DocIntel -->|Fields & Confidence Scores| Worker
    Worker -->|10. Compute SHA-256 & Stamp QR| CryptoEngine
    CryptoEngine -->|Store Stamped PDF| StampedDocs
    Worker -->|11. ACID Record & Status Finalization| Postgres
    Worker -->|12. Notify API| GoAPI
    GoAPI -->|13. Push Status Update| SignalR
    SignalR -.->|Live WebSocket Refresh| StudentUI
    SignalR -.->|Live WebSocket Refresh| IssuerUI

    %% 4. Review & Approval Flow
    IssuerUI -->|14. Inspect, Search Directory, Approve/Delete| GoAPI
    GoAPI -->|Promote to Confirmed by Registrar / Cascade Delete| Postgres

    %% 5. Public Verification Flow
    VerifyUI -->|15. Scan QR / Fetch Verification ID| GoAPI
    GoAPI -->|Retrieve Seal, Hashes & 15-min Read SAS| Postgres
    GoAPI -->|Verify Proof & Display Document| VerifyUI
```

### Processing sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Student / Issuer
    participant FE as React SPA (Static Web Apps)
    participant API as Go API (Container Apps)
    participant Blob as Blob Storage (raw-uploads)
    participant Func as Azure Function
    participant SB as Service Bus (job-processing)
    participant Worker as Python Worker (KEDA)
    participant OCR as AI Document Intelligence
    participant DB as PostgreSQL Flexible Server
    participant Stamped as Blob Storage (stamped-documents)
    participant Verifier as Public Verifier / Employer

    User->>FE: Select certificate scan for upload
    FE->>API: POST /api/v1/jobs (Bearer JWT)
    API->>DB: INSERT INTO jobs (status='awaiting_upload')
    API-->>FE: Return job_id + 15-min Scoped Write SAS
    FE->>Blob: Direct PUT raw-uploads/{job_id}/{filename}
    Blob->>Func: Event Grid BlobCreated event
    Func->>DB: UPDATE jobs SET status='queued'
    Func->>SB: Enqueue message {job_id}
    SB->>Worker: Peek-Lock message (KEDA scales 0→N)
    Worker->>DB: UPDATE jobs SET status='processing'
    Worker->>OCR: Analyze document (custom/prebuilt model)
    OCR-->>Worker: Extracted fields + Confidence scores
    alt All field confidences >= 0.85
        Worker->>Worker: Compute canonical SHA-256 hashes & stamp QR
        Worker->>Stamped: Upload stamped_certificate.pdf
        Worker->>DB: Transactional INSERT records + status='processed'
    else Any confidence < 0.85 or empty date
        Worker->>DB: Transactional INSERT records + status='needs_review'
    end
    Worker->>SB: Complete message (remove from queue)
    Worker->>API: POST /internal/v1/jobs/:id/notify
    API-->>FE: Azure SignalR live status broadcast

    opt Review & Approval Workflow (Exam Cell)
        User->>FE: Review Station: Search & inspect low-confidence scan
        FE->>API: POST /api/v1/review/:id/resolve (Corrections or Approve)
        API->>DB: UPDATE records SET verified_by_issuer=true, status='processed'
    end

    opt Public Verification Workflow
        Verifier->>API: GET /api/v1/verify/:publicVerificationId (or QR scan)
        API->>DB: Query record hashes, authority, verified_by_issuer
        API-->>Verifier: Return verification proof ("Uploaded by Student" or "Confirmed by University Registrar")
    end
```

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

Private - academic project.
