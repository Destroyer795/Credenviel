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
