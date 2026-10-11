# Evidence and Submission Checklist

This file records what can be verified from the repository and deployment.

## Automated Evidence

| Evidence | Reproducible check | Status |
|---|---|---|
| Go API build and tests | `cd api && go test ./...` | Available |
| Python worker tests | `python -m pytest worker/tests/ -m "not integration" -v` | Available |
| Function tests | `python -m pytest functions/tests/ -m "not integration" -v` | Available |
| Frontend production build | `cd frontend && npm ci && npm run build` | Available |
| Bicep compilation | `az bicep build --file infra/main.bicep` | Available |
| Local end-to-end flow | `make demo` | Available |
| Live Azure API health | `curl -i https://ca-api-n2ivlk5gk235i.blackhill-c3a2b095.eastasia.azurecontainerapps.io/healthz` | Available |
| Live Azure Frontend | `https://mango-ground-04b33f300.4.azurestaticapps.net/` | Available |
| Public verification API | `GET /api/v1/verify/{id}` | Available |
| Review directory & search API | `GET /api/v1/review?status=all` | Available |
| Cascading document deletion | `DELETE /api/v1/jobs/{id}` | Available |

## Architecture Evidence

- [x] Problem statement and objectives in `docs/DESIGN.md`.
- [x] Azure service selection and trade-offs in `docs/DESIGN.md`.
- [x] Multi-tiered Pipeline Mermaid diagram in `README.md` and `docs/DESIGN.md`.
- [x] Processing sequence diagram in `README.md`.
- [x] PostgreSQL ER diagram in `README.md` and `docs/DESIGN.md`.
- [x] Deployment sequence in `docs/DEPLOY.md`.
- [x] 20-mark rubric mapping in `docs/EVALUATION.md`.
