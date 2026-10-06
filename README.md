# Credenviel- Certificate Digitization & Verification Pipeline

An Azure-native pipeline that digitizes paper/scanned certificates into structured, confidence-scored, hash-verified records — with KEDA-based scale-to-zero and an issuer review workflow for low-confidence OCR extractions.

## Repo Layout

```
docs/           Design doc, contracts, decisions, build plan, cost, evidence
db/migrations/  PostgreSQL schema (users, jobs, records, status guards)
db/local/       Local dev queue tables (Service Bus emulation)
api/            Go API service (dev auth, SAS/upload, job state, internal notify)
worker/         Python worker service (stub extractor, normalizer, fields_hash, ACID finalize)
functions/      Azure Function / stand-in (blob-created -> validate -> enqueue)
shared/         Shared libraries and test vectors (fields_hash canonical vectors, queue/store interfaces)
frontend/       React (Vite) app
infra/          Bicep IaC (main + modules + parameters)
scripts/        Cross-platform demo script (`demo.py`), load tests
.github/        CI/CD workflows
```

## Quick Start (Phase 1 — Local Skeleton)

### Prerequisites

- Docker and Docker Compose
- Python 3.11+ (with `pip`)
- Go 1.22+

### 1. Environment Setup

```bash
# Copy sample environment configuration
cp .env.example .env

# Install dev dependencies and shared Python library in editable mode
make setup
```

### 2. Start Local Infrastructure

```bash
# Start local Postgres and Azurite containers
make up

# Apply production database migrations (001 + 002)
make migrate

# Apply local queue emulation table
make migrate-local
```

### 3. Run Automated Tests

```bash
# Run unit tests (Python unit tests + Go unit tests)
make test

# Run full integration test suite against local database
make test-integration
```

### 4. Run End-to-End Demo

Run the automated cross-platform demo script which starts the Go API in dev mode, creates a job, uploads a test PDF, triggers the Function stand-in, processes with the Python worker, and displays the resulting PostgreSQL database rows:

```bash
make demo
```

### 5. Running Services Individually (Manual Flow)

```bash
# In Terminal 1: Run Go API server (listening on :8080)
make run-api

# In Terminal 2: Run Python worker (polls local queue)
make run-worker

# In Terminal 3: Trigger simulation event for an uploaded job
make simulate-upload JOB=<job-uuid>
```

To stop all local Docker containers:
```bash
make down
```

## Documentation

- **[docs/DESIGN.md](docs/DESIGN.md)** — Source of truth (faithful conversion of architecture report)
- **[docs/CONTRACTS.md](docs/CONTRACTS.md)** — Interface contracts, schema rules, dev auth, and queue semantics
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — Architectural decision records and open questions
- **[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)** — Phased implementation plan and acceptance criteria
- **[docs/PHASE1_SPEC.md](docs/PHASE1_SPEC.md)** — Detailed specification and verification rules for Phase 1
- **[docs/PHASE1_PROGRESS.md](docs/PHASE1_PROGRESS.md)** — Chronological progress log with raw test logs per commit
- **[docs/COST.md](docs/COST.md)** — Budget table and cost guardrails
- **[docs/EVIDENCE.md](docs/EVIDENCE.md)** — Screenshots, demo script, test outputs

## License

Private — academic project.
