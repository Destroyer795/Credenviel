# CLAUDE.md — Project Rules & Context

## What This Is

Certificate Digitization & Verification Pipeline on Azure: React frontend, Go API and Python worker on Container Apps, Event Grid + Azure Function, Service Bus, KEDA scale-to-zero, Document Intelligence custom model, PostgreSQL Flexible Server, Entra ID app roles, SignalR Service, Key Vault, ACR, Bicep, GitHub Actions.

**`docs/DESIGN.md` is the source of truth. `docs/CONTRACTS.md` is the interface spec.**

## Repo Layout

```
docs/           Design doc, contracts, decisions, build plan, cost, evidence
db/migrations/  PostgreSQL schema (users, jobs, records)
api/            Go API (cmd/, internal/{auth,jobs,records,signalr,storage,db})
worker/         Python worker (queue consumer, extraction, hashing)
functions/      Azure Function (blob-created Event Grid trigger)
frontend/       React (Vite) — issuer dashboard, student dashboard, review, verification
infra/          Bicep IaC (main.bicep, modules/, parameters/)
scripts/        Load-test script, utilities
.github/        CI/CD workflows
```

## Common Commands

```bash
make up         # Start local Postgres + Azurite
make down       # Stop local services
make migrate    # Apply database migrations
make test       # Run all tests (Go, Python, Node)
make lint       # Lint all code
```

## Rules

1. **Never commit secrets; only `.env.example`.** No keys or connection strings in code.
2. **All Azure resources are created through Bicep only.** Always run `az bicep build` and `az deployment group what-if` before any deploy. Use one dedicated resource group so teardown is one command.
3. **Ask before running any `az` command that creates, changes, or deletes anything.**
4. **Follow `docs/BUILD_PLAN.md` in order, one step at a time;** each step ends with its acceptance test passing.
5. **If the implementation must differ from the design,** update the docs in the same commit and add an entry to `docs/DECISIONS.md`.
6. **Do not claim a measurement or result that hasn't been measured.**
7. **Keep Postgres access, SAS generation, and queue access behind small interfaces** so they can be faked locally.
