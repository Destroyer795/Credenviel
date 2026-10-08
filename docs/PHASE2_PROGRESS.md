# Phase 2 Progress Log

Raw outputs for each Phase 2 checkpoint. Anything not run is marked NOT RUN.
Redact subscription ID, tenant ID, emails, object IDs, IP addresses and keys before adding owner output.

---

## 2a: Bootstrap Bicep

### Local checks (agent, no Azure calls)

`az bicep build` and `az bicep lint`, Bicep CLI 0.48.1, run for `main.bicep` and every module.
`main.bicep` and the six implemented modules (monitoring, acr, key-vault, storage, service-bus, identity) are clean.
The six untouched stubs (postgres, container-apps-env, worker-app, function-app, api-app, signalr) give only `no-unused-params` warnings, as expected.

`az bicep build-params --file infra/parameters/dev.bicepparam`: exit 0, with `DEV_PRINCIPAL_ID` unset and with it set to a placeholder.

```
=== build infra/main.bicep
exit=0
--- lint infra/main.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/monitoring.bicep
exit=0
--- lint infra/modules/monitoring.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/acr.bicep
exit=0
--- lint infra/modules/acr.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/key-vault.bicep
exit=0
--- lint infra/modules/key-vault.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/storage.bicep
exit=0
--- lint infra/modules/storage.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/service-bus.bicep
exit=0
--- lint infra/modules/service-bus.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/identity.bicep
exit=0
--- lint infra/modules/identity.bicep
Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/postgres.bicep
WARNING: infra/modules/postgres.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/postgres.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/postgres.bicep
WARNING: infra/modules/postgres.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/postgres.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/container-apps-env.bicep
WARNING: infra/modules/container-apps-env.bicep(7,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/container-apps-env.bicep(10,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/container-apps-env.bicep
WARNING: infra/modules/container-apps-env.bicep(7,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/container-apps-env.bicep(10,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/worker-app.bicep
WARNING: infra/modules/worker-app.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/worker-app.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/worker-app.bicep(14,7) : Warning no-unused-params: Parameter "imageTag" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/worker-app.bicep
WARNING: infra/modules/worker-app.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/worker-app.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/worker-app.bicep(14,7) : Warning no-unused-params: Parameter "imageTag" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/function-app.bicep
WARNING: infra/modules/function-app.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/function-app.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/function-app.bicep
WARNING: infra/modules/function-app.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/function-app.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/api-app.bicep
WARNING: infra/modules/api-app.bicep(7,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/api-app.bicep(10,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/api-app.bicep(13,7) : Warning no-unused-params: Parameter "imageTag" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/api-app.bicep
WARNING: infra/modules/api-app.bicep(7,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/api-app.bicep(10,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/api-app.bicep(13,7) : Warning no-unused-params: Parameter "imageTag" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
=== build infra/modules/signalr.bicep
WARNING: infra/modules/signalr.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/signalr.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

exit=0
--- lint infra/modules/signalr.bicep
WARNING: infra/modules/signalr.bicep(8,7) : Warning no-unused-params: Parameter "location" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]
infra/modules/signalr.bicep(11,7) : Warning no-unused-params: Parameter "environment" is declared but never used. [https://aka.ms/bicep/linter-diagnostics#no-unused-params]

Bicep CLI is already installed at '/home/adeveloper/.azure/bin/bicep'. Skipping installation as no specific version was requested.

exit=0
```

### Owner steps

Deployed to `eastasia` (not `centralindia`): the subscription's region policy rejected every resource in `centralindia` (D-037). Identifiers are redacted below.

- [x] Role IDs verified: all 8 GUIDs printed by `az role definition list` match `infra/modules/identity.bicep`
- [x] Role-assignment permission checked: the owner has `Owner`, inherited from the subscription
- [x] First `what-if` on `centralindia`: rejected for every resource (`RequestDisallowedByAzure`, policy `sys.regionrestriction`; allowed regions are `uaenorth`, `indonesiacentral`, `malaysiawest`, `indiasouthcentral`, `eastasia`)
- [x] Second `what-if` on `eastasia`: `Resource changes: 20 to create.`
- [x] Deployment `p2a-1` succeeded (52 s), but `DEV_PRINCIPAL_ID` was unset in that shell, so the 4 developer role assignments were skipped (16 of 20 created)
- [x] Third `what-if` (with `DEV_PRINCIPAL_ID` set): `4 to create, 11 to modify, 5 no change, 1 to ignore`. The 11 modifications were reviewed: Azure-defaulted properties and `principalId` literal vs `reference()` expressions, no real change
- [x] Deployment `p2a-2` succeeded (`provisioningState: Succeeded`, `error: null`)
- [x] `az resource list -g rg-credenviel-dev -o table`: 8 rows, all `Succeeded`: Service Bus namespace, Log Analytics workspace, Container Registry, Key Vault, Storage account, Application Insights, managed identity (all `eastasia`), plus the auto-created Application Insights Smart Detection action group (`global`). Child resources (queue, blob service, containers, role assignments) do not appear in this list.
- [x] Developer data roles present: Storage Blob Data Contributor (storage), Key Vault Secrets Officer (vault), AcrPush (registry), Azure Service Bus Data Owner (namespace)
- [x] Queue `job-processing` (maxDeliveryCount 5, lock `PT1M`) and containers `raw-uploads`, `stamped-documents` confirmed by `az servicebus queue show` and `az storage container list --auth-mode login` (the latter also confirms the owner's Storage data role works)
- [ ] Reviewer read the diff and the `what-if` output

Lessons:
- `DEV_PRINCIPAL_ID` is read from the shell environment, so it must be exported in the same terminal before every `what-if` and `create`; a new terminal silently skips the developer roles.
- `what-if` reports noise for Azure-defaulted properties; the 11 "modify" entries were not real changes.

---

## 2b: Data and real adapters

### Local checks (agent, no Azure mutating calls)

- `az bicep build --file infra/main.bicep`: exit 0, clean build.
- `az bicep lint --file infra/main.bicep`: exit 0, clean lint.
- `az bicep lint` on all modules (`postgres.bicep`, `service-bus.bicep`, `storage.bicep`): exit 0.
- Python unit tests: `pytest -m "not integration and not azure" -v`: 29 passed, 83 deselected.
- Go unit tests: `go test ./...`: all passed.
- Go Azure test compilation: `go test -tags azure -c -o NUL ./internal/storage`: compiled successfully.
- Database test guards verified:
  - Python test harnesses (`testdb.py`, `conftest.py`) reject non-local hosts and databases other than `credenviel_test`.
  - Go test harness (`db_guard.go`, `integration_test.go`) enforces `ValidateTestDBTarget(dbName, host)`.

### Owner steps (completed against Azure)

- [x] Export `PG_ADMIN_PASSWORD` (min 12 chars, letters + digits) and `DEV_IP`
- [x] `az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2b-1`: succeeded.
  - Deployed Postgres Flexible Server `psql-cred-n2ivlk5gk235i` (B1ms, eastasia), database `credenviel`, Key Vault secret `postgres-admin-password`, test container `test-scratch`, test queue `job-processing-test`.
- [x] `make migrate-azure`: succeeded! (Applied `001_initial_schema.up.sql` and `002_status_guard.up.sql` to Azure PostgreSQL).
- [x] `make test-azure`: succeeded!
  - Python Azure adapter suite (`pytest -m azure`): 4/4 passed (blob roundtrip, service bus send/receive, abandon/delivery count, dead-lettering).
  - Go SAS signer suite (`go test -tags azure ./internal/storage`): 3/3 passed (valid PUT with BlockBlob header, rejects tampered SAS, rejects expired SAS).
- [ ] Stop Postgres server at end of session:
  `az postgres flexible-server stop -g rg-credenviel-dev -n psql-cred-n2ivlk5gk235i`

Lessons:
- **Campus Firewall Restrictions**: University campus Wi-Fi blocks raw outbound TCP ports 5671 (AMQP) and 5432 (PostgreSQL).
  - Service Bus adapter was upgraded to use `TransportType.AmqpOverWebsocket` over HTTPS port 443, enabling seamless local execution.
  - Azure PostgreSQL migrations were applied cleanly using Azure Cloud Shell (`shell.azure.com`), which runs directly within the Azure backbone.
- **Postgres ARM Concurrency**: In `postgres.bicep`, configuration updates like `require_secure_transport` must serialize after database creation using `dependsOn: [database]` to avoid `ServerIsBusy` conflicts.


