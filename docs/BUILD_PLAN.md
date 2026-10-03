# Build Plan

> Source: [DESIGN.md](DESIGN.md) § Build order
>
> Follow each step in order. Each step ends with its acceptance test passing.
> After the build, the report gets one final pass with measured results and real screenshots.

---

## Phase 0 — Skeleton (this phase)

**What:** Postgres schema, Go API, and a worker with the stub extractor, run locally.

**Acceptance test:**
- [ ] `docker compose up` starts Postgres and Azurite
- [ ] Migration applies (up, down, up) cleanly
- [ ] `go build ./...` succeeds in `api/`
- [ ] `go test ./...` passes in `api/`
- [ ] Worker imports/smoke test passes
- [ ] Function imports/smoke test passes
- [ ] `npm run build` succeeds in `frontend/`
- [ ] `docker compose config` validates

---

## Phase 1 — Cloud Core

**What:** Bicep for the registry, Container Apps environment, Service Bus, and Storage; then SAS upload → Function → queue → KEDA-scaled worker → status.

**Note:** Pass the image tag to Bicep as a parameter, or each deploy resets containers to a placeholder image.

**Acceptance test:**
- [ ] `az bicep build` succeeds for all templates
- [ ] `az deployment group what-if` succeeds
- [ ] Resources deploy to a dedicated resource group
- [ ] SAS upload → blob-created event → Function fires → message on Service Bus → worker picks up → status updated to `processed` (with stub extractor)
- [ ] KEDA scales from 0 → 1 when a message arrives

---

## Phase 2 — Auth

**What:** Entra roles and a JWT check in the API, with a dev-bypass flag so testing isn't blocked.

**Acceptance test:**
- [ ] Unauthenticated request to a protected endpoint returns 401
- [ ] Issuer-role JWT grants access to bulk upload and review endpoints
- [ ] Student-role JWT grants access to own jobs only
- [ ] Dev-bypass flag disables JWT checking for local testing

---

## Phase 3 — Real Extraction

**What:** Document Intelligence, `needs_review`, and the issuer review screen.

**Acceptance test:**
- [ ] A real document sent to the trained model returns structured fields with confidence scores
- [ ] A low-confidence extraction sets `needs_review` status
- [ ] Issuer can resolve `needs_review` from the review screen
- [ ] `verified_by_issuer` is set correctly for issuer vs student uploads

---

## Phase 4 — Verification

**What:** Hashes, QR code, and the public page.

**Acceptance test:**
- [ ] `source_hash` matches SHA-256 of the original file
- [ ] `fields_hash` matches SHA-256 of the normalized extracted fields
- [ ] QR code encodes the `public_verification_id`
- [ ] Public verification page shows hashes, key fields, and `verified_by_issuer` status
- [ ] Rate limiting on the public verification endpoint

---

## Phase 5 — Polish & Evidence

**What:** SignalR, CI/CD, Application Insights and alerts, then the load test and screenshots.

**Acceptance test:**
- [ ] Dashboard updates live via SignalR, no page refresh
- [ ] CI/CD pipeline builds and deploys on push to `main`
- [ ] Application Insights receives traces
- [ ] Dead-letter queue alert fires on a deliberately dead-lettered message
- [ ] Load test records p50/p95 latency and KEDA 0→peak time
- [ ] All screenshots captured per [EVIDENCE.md](EVIDENCE.md)
