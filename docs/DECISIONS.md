# Decision Log

> Decisions are logged here as they are made. Open decisions need human input before proceeding.

---

## Decided

| # | Decision | Options considered | Chosen | Rationale | Date |
|---|---|---|---|---|---|
| D-001 | Add `/functions` directory for Azure Function | Keep in `/api`, separate `/functions` | Separate `/functions` | The Azure Function is a distinct deployment unit (Python, not Go) with its own `host.json` and function bindings. Keeping it separate from the Go API avoids confusion. | 2026-10-03 |
| D-002 | Add `/db` directory for shared migrations | Keep migrations in `/api`, separate `/db` | Separate `/db` | Migrations are shared across the API and worker (both read/write the database). A shared `/db/migrations/` directory makes this explicit and avoids duplicating schema definitions. | 2026-10-03 |

---

## Open Decisions

| # | Decision | Options | Recommended default | Status |
|---|---|---|---|---|
| O-001 | Azure Function language | **A)** Python (matches worker, shares SDK knowledge) **B)** JavaScript/TypeScript **C)** C# | **A) Python** — the worker is already Python, and the Function only needs to validate a blob, update a DB row, and send a Service Bus message. Sharing the language reduces context-switching. | OPEN |
| O-002 | Document Intelligence custom model type | **A)** Custom template model (fixed layout, higher accuracy on consistent documents) **B)** Custom neural model (handles layout variation, newer) | **Needs investigation** — depends on how consistent the sample certificates are. Template models are faster and more accurate for fixed-format documents; neural handles variation better. Try both during the labeling phase. | OPEN |
| O-003 | SAS token type for browser-to-Blob upload | **A)** User-delegation SAS (signed with Entra credential, no account key exposure) **B)** Account-key SAS (simpler, requires storing account key in Key Vault) | **A) User-delegation SAS** — avoids storing the storage account key entirely. The Go API uses its managed identity to generate user-delegation SAS tokens. Slightly more complex but eliminates a secret. | OPEN |
| O-004 | PostgreSQL authentication method | **A)** Entra token (managed identity, no password) **B)** Password stored in Key Vault **C)** Entra token primary, password in Key Vault as fallback | **C) Entra token primary, password in Key Vault as fallback** — managed identity is preferred for production, but a Key Vault password fallback helps during local development and if Entra token auth has issues with the Flexible Server tier. | OPEN |
| O-005 | Local queue strategy for development | **A)** Interface with a local in-memory fake (simple, no external dependency) **B)** Service Bus emulator (closer to production, but heavier setup) | **A) Interface with a local fake** — keeps `docker compose up` simple. The interface can be swapped to real Service Bus in CI or staging. The emulator requires additional Docker configuration and may not be worth the complexity for local dev. | OPEN |
| O-006 | Failed-job mechanism after dead-lettering | **A)** A scheduled Function polls the DLQ and sets `jobs.status = 'failed'` **B)** The worker sets `failed` on its own unrecoverable errors; DLQ messages are handled manually **C)** A DLQ trigger Function sets `failed` automatically | **C) DLQ trigger Function** — automatic and immediate. When Service Bus moves a message to the DLQ (after max delivery count), a Function triggers and sets the job status to `failed`. This avoids polling and ensures the status is always up to date. | OPEN |
| O-007 | CORS configuration for browser-to-Blob upload | **A)** Configure CORS on the Storage Account to allow the frontend origin **B)** Proxy uploads through the Go API (eliminates CORS issue but loses direct-upload benefit) | **A) Configure CORS on Storage Account** — the whole point of SAS tokens is to bypass the API for large files. CORS rules on the storage account should allow PUT from the frontend origin with the required headers. | OPEN |
| O-008 | Image tag strategy for Container Apps deploys | **A)** Pass image tag as a Bicep parameter (each deploy specifies the tag) **B)** Use `az containerapp update` after Bicep deploy (Bicep manages infra, CLI manages app version) | **See PDF discrepancy below** — the PDF mentions both approaches. Need to decide on one. | OPEN |

---

## PDF Discrepancies

Issues found in the source PDF that need clarification:

| # | Location in PDF | Issue | Notes |
|---|---|---|---|
| P-001 | Deployment § CI/CD | **Caption says "four stages" but the workflow effectively has five steps.** The caption reads "CI/CD · push to deployed" and the text describes: (1) build React, Go, Python, (2) check builds pass, (3) `az deployment group create` (Bicep), (4) push images to ACR, (5) `az containerapp update` for the image tag. That's five logical steps, not four. | Clarify whether the "check builds pass" gate is considered a separate stage or part of the build stage. |
| P-002 | Deployment § Reproducibility | **Conflicting image update mechanisms.** The text says "pass the image tag to Bicep as a parameter" (Build Order step 2) and also "one `az containerapp update` for the worker image tag" (Reproducibility section). These are two different approaches — Bicep parameter vs. CLI command. | Need to decide which approach to use. See O-008. |
| P-003 | Database § records table | **`degree` mentioned in verification page but not in records schema.** The public verification page describes showing "degree" as one of the public fields, but the records table columns don't include a `degree` field. It may be derived from document type or inferred from other fields. | Clarify whether `degree` should be added to the schema or derived at display time. |
| P-004 | Security § Database access | **Managed identity vs Key Vault password.** The Security section says "Database access uses a managed identity for the API and workers instead of a stored password where the service supports it," but the system also stores secrets in Key Vault. The interaction between these two approaches is not specified for Postgres specifically. | See O-004 for the decision. |
| P-005 | Source control | **Repo structure mentions four folders but design has more concerns.** The PDF says "one repo with `/frontend`, `/api`, `/worker`, `/infra` folders" but the Azure Function is a separate deployment unit (Python, not Go) that doesn't fit in any of these. | See D-001 for the decision to add `/functions`. |
| P-006 | Reliability | **Cleanup Function mentioned but not in build order.** The reliability section mentions "a scheduled cleanup Function clears `awaiting_upload` jobs whose SAS token has expired" but this Function is not listed in the build order or technology selection table. | Needs to be added to the build plan. Likely belongs in Phase 5 (Polish) or as a separate step. |
