# Infrastructure (Bicep)

All Azure resources are created through Bicep, at resource-group scope, in `rg-credenviel-dev`. The resource group is in `centralindia`, but the resources are deployed to **`eastasia`**: the subscription's region policy (`sys.regionrestriction`) allows only `uaenorth`, `indonesiacentral`, `malaysiawest`, `indiasouthcentral` and `eastasia` (D-037).
Nothing here is deployed by the agent: **the owner runs every `az` command that creates or changes anything**, and a reviewer reads the diff and the `what-if` output first.

## Layout

| Path | Purpose |
|---|---|
| `main.bicep` | Wires the modules together, sets the `project` / `env` tags |
| `modules/` | One module per service |
| `parameters/dev.bicepparam` | Dev parameters; reads secrets-adjacent values from environment variables |

## Status by sub-phase

| Module | State |
|---|---|
| `monitoring`, `acr`, `key-vault`, `storage`, `service-bus`, `identity` | Implemented in 2a |
| `postgres` | Stub, implemented in 2b |
| `container-apps-env`, `worker-app`, `function-app` | Stubs, implemented in 2c |
| `api-app` | Stub, Phase 3 |
| `signalr` | Stub, Phase 5 |

## What 2a creates

| Resource | Notes |
|---|---|
| Log Analytics workspace + Application Insights | 30-day retention, workspace-based |
| Container Registry | Basic, admin user disabled |
| Key Vault | RBAC mode, soft delete 7 days, purge protection off |
| Storage account | Standard_LRS, no public blob access, TLS 1.2, CORS for PUT/OPTIONS/GET/HEAD; containers `raw-uploads`, `stamped-documents` |
| Service Bus namespace | Basic; queue `job-processing` (lock 1 min, max delivery 5, dead-lettering) |
| User-assigned managed identity | Plus 5 role assignments, each on one resource only (below) |
| Developer role assignments | 4, only when `DEV_PRINCIPAL_ID` is set (below) |

All resources carry the tags `project=credenviel` and `env=dev`.

**Managed identity roles** (principal type `ServicePrincipal`):

| Role | Scope |
|---|---|
| Storage Blob Data Contributor | storage account |
| Azure Service Bus Data Sender | Service Bus namespace |
| Azure Service Bus Data Receiver | Service Bus namespace |
| Key Vault Secrets User | Key Vault |
| AcrPull | container registry |

**Developer roles** (principal type `User`, skipped when `DEV_PRINCIPAL_ID` is empty): Storage Blob Data Contributor (storage), Azure Service Bus Data Owner (namespace), Key Vault Secrets Officer (vault), AcrPush (registry).

## Before you deploy

Export your values in the same terminal. Never commit them.

```bash
export DEV_PRINCIPAL_ID=<your Entra object id>
```

You also need permission to create role assignments on the resource group (Owner or User Access Administrator). Check it first (read-only):

```bash
az role assignment list --assignee "$DEV_PRINCIPAL_ID" --all -o table
```

Verify the role IDs used in `modules/identity.bicep` (read-only). Each command must print the GUID shown in the comment next to it in that file:

```bash
az role definition list --name "Storage Blob Data Contributor" --query "[0].name" -o tsv
az role definition list --name "Azure Service Bus Data Sender" --query "[0].name" -o tsv
az role definition list --name "Azure Service Bus Data Receiver" --query "[0].name" -o tsv
az role definition list --name "Key Vault Secrets User" --query "[0].name" -o tsv
az role definition list --name "AcrPull" --query "[0].name" -o tsv
az role definition list --name "Azure Service Bus Data Owner" --query "[0].name" -o tsv
az role definition list --name "Key Vault Secrets Officer" --query "[0].name" -o tsv
az role definition list --name "AcrPush" --query "[0].name" -o tsv
```

## Owner commands

Run from the repo root.

```bash
# 1. build and lint (local, no Azure calls)
az bicep build --file infra/main.bicep --stdout > /dev/null
az bicep lint  --file infra/main.bicep

# 2. preview. The reviewer reads this before anything is created.
az deployment group what-if -g rg-credenviel-dev -p infra/parameters/dev.bicepparam

# 3. deploy
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2a-1

# 4. verify
az resource list -g rg-credenviel-dev -o table
```

If the CLI rejects `-p` with a `.bicepparam` file, run `az deployment group what-if --help` for the current syntax. Some versions need `--template-file infra/main.bicep` alongside `--parameters`.

## What `what-if` should show

A "Create" for each of these and nothing else (no Modify or Delete):

- 1 Log Analytics workspace, 1 Application Insights component
- 1 Container Registry
- 1 Key Vault
- 1 Storage account, its `default` blob service, 2 containers
- 1 Service Bus namespace, 1 queue
- 1 user-assigned managed identity
- 5 role assignments for the managed identity
- 4 more role assignments for you, only if `DEV_PRINCIPAL_ID` was exported

That is 20 resources with `DEV_PRINCIPAL_ID` set, 16 without (the count includes the nested blob service, containers and queue). `what-if` may group or order them differently. The point is that nothing unexpected appears and nothing is modified or deleted.

## Notes and troubleshooting

- **`RequestDisallowedByAzure` / "best available regions":** a resource was sent to a region the policy does not allow. Check `location` in `parameters/dev.bicepparam`.
- **New role assignments can take a few minutes to take effect.** Retry before debugging.
- **Key Vault name blocked after deleting the vault:** purge it, `az keyvault purge --name <vault>`.
- **Resource names** use a short prefix plus `uniqueString(resourceGroup().id)`, so redeploying to the same resource group reuses the same names.
- **Later hardening, not done in 2a:** disabling shared-key access on the storage account (D-034) and Service Bus local auth (D-035), and turning on Key Vault purge protection (D-033).
