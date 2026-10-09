# Evidence and Submission Checklist

This file records what can be verified from the repository and deployment. Screenshots and video are intentionally left as external presentation tasks.

## Automated Evidence

| Evidence | Reproducible check | Status |
|---|---|---|
| Go API build and tests | `cd api && go test ./...` | Available |
| Python worker tests | `python -m pytest worker/tests/ -m "not integration" -v` | Available |
| Function tests | `python -m pytest functions/tests/ -m "not integration" -v` | Available |
| Frontend production build | `cd frontend && npm ci && npm run build` | Available |
| Bicep compilation | `az bicep build --file infra/main.bicep` | Available |
| Local end-to-end flow | `make demo` | Available |
| Azure health | `az containerapp revision list ...` and `/healthz` | Available |
| Public verification API | `GET /api/v1/verify/{id}` | Available |

## Architecture Evidence

- [x] Problem statement and objectives in `docs/DESIGN.md`.
- [x] Azure service selection and trade-offs in `docs/DESIGN.md`.
- [x] Pipeline Mermaid diagram in `README.md` and `docs/DESIGN.md`.
- [x] Processing sequence diagram in `README.md`.
- [x] PostgreSQL ER diagram in `README.md` and `docs/DESIGN.md`.
- [x] Deployment sequence in `docs/DEPLOY.md`.
- [x] 20-mark rubric mapping in `docs/EVALUATION.md`.

## Screenshots to Capture Externally

These are presentation artifacts, not invented repository evidence.

- [ ] AI Studio labeled certificate samples.
- [ ] AI Studio model test with field confidence values.
- [ ] Issuer bulk upload screen.
- [ ] Issuer review screen showing a corrected low-confidence field.
- [ ] Azure Container Apps scale-out from zero to active replicas.
- [ ] Service Bus queue-depth or DLQ monitor view.
- [ ] Public verification result showing hashes, authority, QR, and View document.

## Demonstration Video

Not recorded by the coding agent. The recommended flow is:

1. Open the issuer portal.
2. Upload a certificate.
3. Show the queue and processing status.
4. Open the review station if confidence is low.
5. Resolve or reject the record.
6. Open the public verification ID.
7. Show the authority, hashes, QR, and View document action.

## Measurements to Record When Running the Load Test

Do not invent values. Run `make scale-test-azure` and record:

- Number of uploads and extractor mode.
- Starting, peak, and final worker replicas.
- Time to first replica and time to peak.
- p50 and p95 upload-to-final-status latency.
- Dead-lettered messages and failed jobs.
- PostgreSQL and Document Intelligence cost observations.

The load-test runner is `scripts/scale_test_azure.py`; its output is the source of truth for measured values.
