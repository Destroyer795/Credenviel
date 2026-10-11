# Evaluation Coverage

Credenviel is an Azure-native certificate digitization and verification pipeline. This document maps the implementation to the academic evaluation rubric without claiming screenshots, video, or benchmark measurements that have not been captured.

## Mark Coverage

| Criterion | Marks | Coverage | Evidence |
|---|---:|---|---|
| Project objective and requirements | 2 | **Complete (2.0/2)** | Problem statement, objectives, functional requirements, and scope in `docs/DESIGN.md`. |
| System architecture and design | 4 | **Complete (4.0/4)** | Azure service-selection table, multi-tiered Mermaid pipeline diagrams, scalability, and reliability design in `docs/DESIGN.md` and `README.md`. |
| Implementation and functionality | 4 | **Complete (3.8–4.0/4)** | Live React portals on Azure, Go API, Python worker, Azure Function, Document Intelligence OCR confidence routing, Review Station directory search, registrar approval for student uploads, cascading document deletion, SHA-256 hashing, QR verification, and public document viewing. Live demonstration is an external presentation task. |
| Security and access control | 2 | **Complete (2.0/2)** | Firebase Auth JWT verification, RBAC (student/issuer), user-delegation SAS tokens, TLS encryption, Key Vault secret references, upload security validation, and rate-limited public verification. |
| Database and data management | 2 | **Complete (2.0/2)** | PostgreSQL Flexible Server migrations, users/jobs/records relational model, foreign keys, lifecycle trigger guards, **full CRUD operations** (Create jobs, Read directory/records, Update field corrections/approvals, Delete cascade), and transactional finalization. |
| Deployment and DevOps | 2 | **Complete (2.0/2)** | Live Azure Static Web App (`stapp-cred-n2ivlk5gk235i`), Azure Container Apps (`ca-api-n2ivlk5gk235i`), ACR container registry images, Bicep IaC modules, and GitHub Actions CI workflow. |
| Monitoring, performance, and optimization | 1 | **Implemented (0.8–1.0/1)** | Application Insights, Azure Monitor Log Analytics, Service Bus DLQ alerting, Container Apps health probes, KEDA scale-to-zero autoscaling, structured JSON logs, and load-test runners (`scripts/scale_test_azure.py`). Live portal metric screenshots are an external submission task. |
| Documentation and presentation | 2 | **Complete docs (1.5–1.7/2)** | Architecture and design report, interface contracts, decision records, deployment runbook, evaluation matrix, and evidence guide. Video recording and screenshots remain presentation tasks. |
| Innovation and problem solving | 1 | **Complete (1.0/1)** | Two-tier trust verification (Student upload vs Registrar endorsement), confidence-aware human review loop, deterministic Unicode canonical hashing, QR-stamped artifacts, direct-to-Blob upload, event-driven architecture, and scale-to-zero cost efficiency. |

### Current Honest Estimate

**Technical implementation coverage: approximately 18.5/20.**

The remaining ~1.5 marks are presentation deliverables:
- screenshots of the live deployed UI (Review Station search, delete confirmation, verification badge states);
- a 2-minute walkthrough project demonstration video;
- recorded live load-test or Azure portal telemetry graphs.

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
