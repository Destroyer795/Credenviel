# Certificate Digitization & Verification Pipeline

An Azure-native pipeline that digitizes paper/scanned certificates into structured, confidence-scored, hash-verified records — with KEDA-based scale-to-zero and an issuer review workflow for low-confidence OCR extractions.

## Repo Layout

```
docs/           Design doc, contracts, decisions, build plan, cost, evidence
db/migrations/  PostgreSQL schema (users, jobs, records)
api/            Go API service (Container Apps)
worker/         Python worker service (Container Apps + KEDA)
functions/      Azure Function (blob-created → validate → enqueue)
frontend/       React (Vite) app
infra/          Bicep IaC (main + modules + parameters)
scripts/        Load-test script, utilities
.github/        CI/CD workflows
```

## Quick Start

```bash
# Start local Postgres + Azurite
make up

# Apply database migrations
make migrate

# Run tests
make test

# Lint
make lint

# Stop everything
make down
```

## Documentation

- **[docs/DESIGN.md](docs/DESIGN.md)** — Source of truth (faithful conversion of the architecture PDF)
- **[docs/CONTRACTS.md](docs/CONTRACTS.md)** — Interface contracts between services
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — Decision log and open decisions
- **[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)** — Build order with acceptance tests
- **[docs/SETUP_CHECKS.md](docs/SETUP_CHECKS.md)** — Day-zero pre-build checklist
- **[docs/COST.md](docs/COST.md)** — Budget table and cost guardrails
- **[docs/EVIDENCE.md](docs/EVIDENCE.md)** — Screenshots, demo script, load-test results

## License

Private — academic project.
