# Evaluation Coverage

Credenviel is an Azure-native certificate digitization and verification pipeline. This document maps the implementation to the academic evaluation rubric without claiming screenshots, video, or benchmark measurements that have not been captured.

## Mark Coverage

| Criterion | Marks | Coverage | Evidence |
|---|---:|---|---|
| Project objective and requirements | 2 | **Complete** | Problem statement, objectives, functional requirements, and scope in `docs/DESIGN.md`. |
| System architecture and design | 4 | **Complete** | Azure service-selection table, Mermaid pipeline diagram, scalability and reliability design in `docs/DESIGN.md`. |
| Implementation and functionality | 4 | **Substantially complete** | React portals, Go API, Python worker, Azure Function, OCR confidence routing, review workflow, hashing, QR verification, and public document viewing. A fresh real-OCR demonstration is still a presentation task. |
| Security and access control | 2 | **Complete** | JWT/app-role authorization, issuer/student scoping, managed-identity SAS, TLS, Key Vault/Container App secrets, upload validation, and public-verifier rate limiting. |
| Database and data management | 2 | **Complete** | PostgreSQL migrations, users/jobs/records model, foreign keys, status guards, CRUD endpoints, transactional worker finalization, and audit corrections. |
| Deployment and DevOps | 2 | **Substantially complete** | Dockerfiles, ACR images, Bicep modules, Azure Container Apps, Static Web Apps, deployment runbook, immutable image tags, and GitHub Actions CI. Automatic production deployment remains a future CI enhancement. |
| Monitoring, performance, and optimization | 1 | **Implemented, measurements pending** | Application Insights, Azure Monitor, Service Bus DLQ alerting, Container Apps health, KEDA scaling, structured logs, and load-test runners. Actual p50/p95 and replica screenshots are not claimed here. |
| Documentation and presentation | 2 | **Documentation complete; capture tasks pending** | README, architecture/design report, contracts, decisions, deployment guide, this matrix, and evidence runbook. Screenshots and presentation video remain external submission tasks. |
| Innovation and problem solving | 1 | **Complete** | Confidence-aware human review, SHA-256 source/field hashes, QR-stamped artifacts, direct-to-Blob upload, event-driven processing, SignalR updates, and scale-to-zero cost design. |

### Current Honest Estimate

**Technical implementation coverage: approximately 17/20.**

The remaining marks are primarily evidence-dependent rather than missing architecture:

- screenshots of the deployed UI, Azure scaling, queue depth, and verification result;
- a short project demonstration video;
- recorded real-OCR sample results and measured p50/p95 load-test values;
- an optional GitHub Actions production-deployment job.

Do not fill these values with invented numbers. Run the commands below and attach the resulting output or screenshots to the submission.

## Reproducible Validation Commands

### Local checks

```bash
make test
make test-integration
cd api && go test ./...
cd ../frontend && npm ci && npm run build
az bicep build --file infra/main.bicep
```

### Azure health checks

```bash
az containerapp revision list -g rg-credenviel-dev -n ca-api-n2ivlk5gk235i -o table
az containerapp revision list -g rg-credenviel-dev -n ca-worker-n2ivlk5gk235i -o table
az functionapp function list -g rg-credenviel-dev -n <function-app-name> -o table
az eventgrid system-topic event-subscription list -g rg-credenviel-dev --system-topic-name <topic-name> -o table
```

### Live verification checks

```bash
curl -i https://mango-ground-04b33f300.4.azurestaticapps.net/
curl -i https://ca-api-n2ivlk5gk235i.blackhill-c3a2b095.eastasia.azurecontainerapps.io/healthz
```

Use a real public verification ID to confirm the response includes the public hashes, `issuing_authority`, and `document_url`.

## Presentation Checklist

The following are intentionally not fabricated in the repository:

- [ ] AI Studio labeled samples and model test result screenshot
- [ ] issuer bulk-upload screenshot
- [ ] review-screen screenshot showing a corrected field
- [ ] Azure Container Apps scale-out screenshot
- [ ] Service Bus queue-depth screenshot
- [ ] public verification screenshot
- [ ] project demonstration video
- [ ] measured real-OCR sample table
- [ ] measured load-test p50/p95 table
