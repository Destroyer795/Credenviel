# Phase 2 Handover Package (for the Azure owner)

Everything needed to run Phase 2 (Cloud Core) from start to finish.

**How to use this with the other files**
- `docs/PHASE2_RUNBOOK.md` stays in the repo. Its Part C (guardrails), G (troubleshooting), H (session routine) and I (teardown) still apply. **Where the runbook and this file differ, this file wins** (it uses the real day-zero results).
- The agent prompts are in Appendix A to E. Every prompt is pasted together with the session header (Appendix A).
- **Every command here is [UNVERIFIED SYNTAX]**: none of them could be run when this was written. If a flag is rejected, run `az <command> --help` and use what it shows. Prices, quotas and role IDs are [MEMORY-VERIFY].

---

## 1. Where things stand (facts from the day-zero checks)

| Item | Result | Consequence |
|---|---|---|
| Subscription | Azure for Students, enabled, default | OK |
| Credit | $100, expires 10/05/2027 | Plenty of time |
| Resource group | `rg-credenviel-dev`, Central India | Region is `centralindia` |
| Container Apps in region | Supported | OK |
| Postgres `Standard_B1ms` in region | Available | OK |
| Entra app registration (`az ad app create`) | **Blocked** (insufficient privileges) | No impact on Phase 2. Phase 3 needs a separate tenant, IT help, or a self-issued JWT fallback. Record it in DECISIONS. |
| Container Apps quota view | Blocked in portal | Unknown quota. Start with max 3 workers (see Section 6). Try registering `Microsoft.Quota` and retry. |
| Budget | $25/month, alerts at 50/75/90% | Postgres alone is about $12 to 15, so alerts will fire early. Fine. |
| Tools | Cloud Shell used so far | **Install the Azure CLI locally for Phase 2** (Docker push, Function publish, and the local API need it) |
| Teammate portal access | In progress | Optional. Reader role only. Not a blocker. |
| Open items from day zero | Tags on the resource group; 7 provider registrations unconfirmed | Close in Step 1 |

## 2. What Phase 2 delivers (definition of done)

1. The real pipeline runs on Azure: browser-style upload to Blob using a user-delegation SAS, Event Grid triggers a Function, the job becomes `queued`, a message lands on Service Bus, KEDA scales the worker from 0, the worker finishes the job as `processed` (stub extractor) in Azure Postgres, and replicas return to 0.
2. All infrastructure is Bicep. Nothing was created by clicking in the portal (except the budget alert).
3. The Go API runs **on the owner's laptop** against Azure. It is **not** deployed (it would run with dev auth). It is deployed in Phase 3 after real auth exists.
4. Local Phase 1 tests still pass (`make test`, `make test-integration`), and CI is green.
5. Evidence is captured (Section 9).

## 3. Roles and rules

- **Owner:** runs every `az` command that creates, changes or deletes anything, and every deployment. Never gives secrets to the agent.
- **Reviewer (teammate):** reads every Bicep diff and every `what-if` output **before** the owner deploys. Also: labels sample certificates, reviews decisions.
- **Agent:** writes code and Bicep, runs only local checks (`az bicep build`/`lint`, tests, Docker for `credenviel-*` containers). **Never runs any other `az` command.**
- One deployer at a time. One branch per sub-phase, small commits, no history rewriting, no force-push, no `git add .`.
- Nothing is approved by an agent. New decisions are written as PROPOSED, and the owner and the reviewer approve them.
- Teammate access, if granted: **Reader** on the resource group (this corrects the runbook, which said Contributor).

## 4. Before you start (owner, 15 minutes)

```bash
# install the CLI locally, then
az login
az account show -o table                      # confirm Azure for Students
az group update -n rg-credenviel-dev --tags project=credenviel env=dev
az group show -n rg-credenviel-dev --query "{name:name, location:location, tags:tags}" -o json
az provider register --namespace Microsoft.Quota
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.ServiceBus \
  Microsoft.Storage Microsoft.DBforPostgreSQL Microsoft.KeyVault Microsoft.EventGrid Microsoft.Web \
  Microsoft.SignalRService Microsoft.CognitiveServices Microsoft.Insights Microsoft.ManagedIdentity \
  Microsoft.Authorization Microsoft.Quota; do
  echo -n "$ns: "; az provider show -n $ns --query registrationState -o tsv
done
az bicep install && az bicep version
docker --version
```
- [ ] Every provider shows `Registered`. Re-run until it does.
- [ ] Phase 1 is merged and tagged `phase-1`. You are on a fresh `main`: `git pull`.
- [ ] `make up && make test && make test-integration` pass on **your** machine.
- [ ] Docs-prep branch (Appendix B) merged. If not, do Step 0 first.
- [ ] Only now do you create the branches below.

Values the deployments need (keep them in a private note, never commit them):
```bash
# your user's object id, read from your own access token (no directory permission needed)
TOKEN=$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)
python -c "import sys,json,base64; p=sys.argv[1].split('.')[1]; p+='='*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p))['oid'])" "$TOKEN"
# your public IP (for the Postgres firewall in step 2b)
curl -s https://ifconfig.me
```
The Bicep parameter file reads these from environment variables with `readEnvironmentVariable('NAME', '')` (check the current Bicep docs), so no secret or identifier is committed:
```bash
export DEV_PRINCIPAL_ID=<object id>
export DEV_IP=<public ip>
```

## 5. The sequence

Each step ends with a checkpoint. Save raw output to `docs/PHASE2_PROGRESS.md`. Do not start the next step until the checkpoint is green.

### Step 0: docs prep (agent, no Azure)
Branch `docs-phase2-prep`. Paste Appendix A + Appendix B. Review the diff, merge to `main`.
**Checkpoint:** `BUILD_PLAN.md` Phase 2 matches this file; the agent rules say "never run mutating `az`".

### Step 1: 2a Bootstrap
Branch `phase-2a-bootstrap`. Paste Appendix A + Appendix C. The agent writes Bicep for the monitoring workspace, ACR, Key Vault, Storage (+ CORS), Service Bus, and the managed identity with roles.

Owner, after the agent reports and the reviewer has read the code:
```bash
az bicep build --file infra/main.bicep && az bicep lint --file infra/main.bicep
# verify the role IDs the agent used (read-only), e.g.:
az role definition list --name "Storage Blob Data Contributor" --query "[0].name" -o tsv
az deployment group what-if -g rg-credenviel-dev -p infra/parameters/dev.bicepparam
# reviewer reads the what-if. Expected: only the resources listed in the agent's report.
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2a-1
az resource list -g rg-credenviel-dev -o table
```
If the CLI rejects the `-p` form with a `.bicepparam`, use `az deployment group what-if --help` for the current syntax (a template file flag may be needed).
**Checkpoint:** all expected resources exist, tags present, nothing unexpected. Commit, merge, tag `phase-2a`.

### Step 2: 2b Data and real adapters
Branch `phase-2b-data-adapters`. Paste Appendix A + Appendix D. The agent adds Postgres, test resources, the Azure adapters, a migration script, and Azure test and run targets.

Owner:
```bash
# generate the admin password WITHOUT echoing it; it is stored in Key Vault by the deployment
read -rs PG_ADMIN_PASSWORD && export PG_ADMIN_PASSWORD     # paste a strong password (min 12 chars, letters+digits)
az deployment group what-if -g rg-credenviel-dev -p infra/parameters/dev.bicepparam
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2b-1
unset PG_ADMIN_PASSWORD
# later redeployments: read it back first
export PG_ADMIN_PASSWORD=$(az keyvault secret show --vault-name <vault> --name <secret-name> --query value -o tsv)
make migrate-azure          # applies db/migrations 001 and 002 only, never db/local; asks for confirmation
make test-azure             # adapter tests against the dev resources only
make run-api-azure          # API on your laptop against Azure
```
Then, with the API running locally, create a job with the dev headers, `PUT` the file to the returned URL **with the header `x-ms-blob-type: BlockBlob`** (real Blob requires it), and confirm the blob exists in the portal.
**Checkpoint:** a real SAS upload lands in Blob; a real message round-trips on Service Bus; migrations applied to Azure Postgres; `make test` and `make test-integration` still green; Postgres stopped at end of session (`az postgres flexible-server stop -g rg-credenviel-dev -n <server>`). Commit, merge, tag `phase-2b`.

### Step 3: 2c Compute and end-to-end
Branch `phase-2c-compute-e2e`. Paste Appendix A + Appendix E. The agent adds the Container Apps environment, worker app with the KEDA rule, the Function app, the Event Grid subscription (behind a flag), Dockerfiles, packaging scripts, and e2e/scale test scripts.

Owner:
```bash
# 1. infra pass (apps disabled)
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2c-1
# 2. build and push the worker image
az acr login -n <acrName>
TAG=$(git rev-parse --short HEAD)
docker build --platform linux/amd64 -f worker/Dockerfile -t <acrLoginServer>/credenviel-worker:$TAG .
docker push <acrLoginServer>/credenviel-worker:$TAG
# 3. pass 2: enable apps with the tag
export WORKER_IMAGE_TAG=$TAG   # read by the .bicepparam
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2c-2
# 4. publish the Function code (the agent provides the packaging script and exact command)
# 5. enable the Event Grid subscription (it validates the Function exists, so it must come after step 4)
export ENABLE_EVENT_SUBSCRIPTION=true
az deployment group create -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2c-3
# 6. end-to-end and scale tests (agent-provided scripts)
make run-api-azure          # in one terminal
make e2e-azure              # one job, prints the status timeline
make scale-test-azure       # about 25 jobs, records replicas and queue depth to a CSV
```
**Checkpoint (Phase 2 acceptance):**
- [ ] `az bicep build`, lint, `what-if` clean; resources in the dedicated group with tags
- [ ] Real upload, Function runs, job `queued`, message on Service Bus
- [ ] Worker scales 0 to at least 1, job `processed` with the stub extractor, row in Azure Postgres
- [ ] Replicas return to 0 after the cooldown (5 minutes)
- [ ] Worker shuts down cleanly on SIGTERM (a scale-in must not lose or corrupt a job)
- [ ] `make test`, `make test-integration`, CI all green
- [ ] Secret scan clean: `git grep -nIE "(AccountKey=|SharedAccessSignature|BEGIN (RSA )?PRIVATE KEY|password\s*=|sig=)"`
- [ ] Postgres stopped; `az resource list` matches the expected list
- [ ] Evidence captured (Section 9); PR merged with a merge commit; tag `phase-2`

## 6. Known risks and fallbacks

| Risk | What to do |
|---|---|
| Container Apps quota is unknown | Start `maxReplicas = 3`. If a deployment fails on quota, lower it; if you reach the limit, record the real number and adjust the burst target in the docs. |
| Functions Consumption quota is 0 in this subscription or region (known on student and free subscriptions) | The error says so at deployment. Fallbacks, in order: (a) Flex Consumption plan, (b) another allowed region, (c) ask for the container-hosted Function option. Do not skip the Function: it is part of the rubric story. |
| A region or SKU is blocked by policy (`RequestDisallowedByAzure`) | Read the error, pick an allowed SKU or region, record it in DECISIONS. |
| KEDA scale rule cannot use managed identity in the API version the agent finds | Fallback: a Service Bus connection string stored as a Key Vault secret and referenced by the app. Record it as PROPOSED. |
| `x-ms-blob-type` header missing | Blob returns 400 on the PUT. The API's upload response must include this header; the local dev endpoint did not need it. This is a contract change (see Appendix D). |
| Role assignments need time | New roles can take a few minutes to take effect; retry before debugging. |
| Event Grid subscription fails validation | The Function code is not published yet or the endpoint is wrong. Keep the subscription behind the flag until the code is live. |
| Postgres connection refused from the worker or Function | Check the "allow Azure services" firewall rule, SSL mode `require`, and that the server is started. |
| Worker scales in during a job | The worker must handle SIGTERM: stop receiving, finish or abandon the current message cleanly. Part of the 2c acceptance. |
| Deleted vault name blocks reuse | `az keyvault purge --name <vault>` (runbook Part G). |
| Public IP changed, laptop cannot reach Postgres | Update `DEV_IP` and redeploy, or add the firewall rule again. |

## 7. Daily routine and cost

**Start:** `az account show -o table`; `git pull`; start Postgres if stopped (`az postgres flexible-server start -g rg-credenviel-dev -n <server>`).
**End:** stop Postgres (Azure auto-restarts a stopped server after seven days, so put a calendar reminder); `az resource list -g rg-credenviel-dev -o table`; check the worker has 0 replicas (`az containerapp replica list -g rg-credenviel-dev -n <worker> -o table`); look at Cost Management; commit `docs/PHASE2_PROGRESS.md`.
**Expected monthly cost if left running (approximate, verify):** Postgres B1ms about $12 to 15, ACR Basic about $5, everything else pennies.
**Never:** `az group delete` on anything but this project's group; creating resources in the portal; pasting secrets, SAS URLs or connection strings into the agent chat.

## 8. What to send back to the team after each step

After 2a: the `what-if` summary and `az resource list`. After 2b: the migration output, `make test-azure` output, the successful SAS upload evidence. After 2c: the e2e timeline, the scale CSV, screenshots, and every error with its full text. Redact subscription ID, tenant ID, emails, object IDs, IP addresses, and anything that looks like a key.

## 9. Evidence for the report

Budget alert screenshot; `az resource list` output; `what-if` output; Service Bus queue-depth graph during the scale test; replica count graph (0 to N to 0); Function execution log for a real upload; the `processed` job and record rows from Azure Postgres; the scale CSV; screenshot or log of a clean SIGTERM shutdown.

## 10. Phase 3 note (start in parallel)

Entra app registration is blocked in the university tenant. Decide early: (1) create a free tenant under a personal Microsoft account for the app registration, with the API validating that issuer; (2) ask university IT for an app registration; (3) a self-issued JWT login behind the existing `IdentitySource` interface as the fallback. Record the decision.

---

# Appendices: agent prompts

## Appendix A: Session header (paste before EVERY prompt)

```
You are helping with Phase 2 (cloud core) of the Credenviel repo. Do not rely on memory of earlier conversations. Read CLAUDE.md, docs/PHASE2_HANDOVER.md, docs/PHASE2_RUNBOOK.md, docs/BUILD_PLAN.md, docs/DECISIONS.md, docs/CONTRACTS.md, and docs/PHASE1_SPEC.md (its hard rules still apply) before acting.

HARD RULES
1. You may run `az bicep build`, `az bicep lint` and `az bicep version`. You must NOT run any other `az` command, `func publish`, `docker push`, or anything that talks to Azure. Give the owner the exact commands instead.
2. Only touch Docker containers named `credenviel-*`.
3. Branch as instructed. Small commits, one concern each. Never rewrite history, never force anything, never push, never `git add .` or `git add -A`.
4. Never put secrets, passwords, connection strings, SAS URLs, subscription ids, tenant ids, object ids, emails or IP addresses in the repo, in logs you write, or in commit messages. Parameters of that kind come from environment variables read with readEnvironmentVariable() in the .bicepparam.
5. Never mark a decision or contract APPROVED. New decisions go in docs/DECISIONS.md as PROPOSED with the next free ID.
6. Never claim a result you did not see. Paste raw output. If you could not run something, write NOT RUN.
7. Never weaken, skip or delete tests to make them pass. If something fails three times, stop and report it.
8. Never deploy or configure anything with AUTH_MODE=dev or APP_ENV=local outside a developer laptop. The Go API is NOT deployed to Azure in Phase 2.
9. Azure resources exist only through Bicep. Resource names that must be globally unique use a short prefix plus uniqueString(resourceGroup().id) within each resource's length and character limits. Every resource gets tags project=credenviel and env=dev.
10. If docs contradict each other or the code, list the contradiction; do not silently pick a side. If something blocks you, stop and ask.

FACTS
- Region centralindia. Resource group rg-credenviel-dev already exists (tags set). Deployments are resource-group scope.
- Subscription is Azure for Students. Entra app registration is blocked (irrelevant in Phase 2). Container Apps quota is unknown: default maxReplicas to 3.
- Postgres: Flexible Server, Burstable Standard_B1ms. Public access with firewall rules: "allow Azure services" plus the developer's IP (from env). Password auth, password stored in Key Vault.
- Queue name job-processing. Blob containers raw-uploads and stamped-documents. blob_key format is raw-uploads/{job_id}/{sanitized_filename}.
- The owner runs every mutating az command and every deployment. The reviewer reads every Bicep diff and what-if.
- Backend selection by environment variables: QUEUE_BACKEND=local|servicebus, STORE_BACKEND=local|blob. Default stays local so Phase 1 tests keep passing.
```

## Appendix B: Prompt P0, docs prep (Step 0)

```
Docs-only task. Branch `docs-phase2-prep` from main. Do not change application code except item 5.

1. docs/BUILD_PLAN.md: rewrite Phase 2 to match docs/PHASE2_HANDOVER.md: sub-phases 2a bootstrap, 2b data and real adapters, 2c compute and end-to-end, using the handover's checkpoints as acceptance tests. State explicitly: the Go API runs on the owner's laptop against Azure and is NOT deployed in Phase 2; user-delegation SAS moves from Phase 3 into Phase 2; SignalR is removed from Phase 2 and stays in Phase 5; Phase 3 gains "deploy the API to Container Apps once real auth exists" and "decide the Entra tenant strategy (app registration is blocked in the university tenant)". Keep other phases and all existing ticks unchanged.
2. docs/DECISIONS.md: add the runbook Part D decisions D1 to D9 as new entries with the next free IDs, status PROPOSED, noting where they supersede earlier BUILD_PLAN wording. Add an entry recording that Entra app registration is blocked in the tenant and the three options (separate personal tenant, university IT, self-issued JWT behind IdentitySource) as an OPEN question for Phase 3. Do not renumber existing entries.
3. Agent rules: add these rules to CLAUDE.md and to every other agent rules file that exists in the repo root (list which exist): never run any mutating `az` command (read-only and `az bicep build/lint` allowed); never run `az group delete`; never deploy anything with AUTH_MODE=dev or APP_ENV=local outside a developer laptop; Azure resources only via Bicep; never paste or commit secrets, SAS URLs or connection strings.
4. Confirm docs/PHASE2_RUNBOOK.md and docs/PHASE2_HANDOVER.md are committed (add them if missing; do not edit their content).
5. If scripts/verify_vectors.py hardcodes a Git Bash path, make it find `sha256sum` on PATH first and fall back to the Git path. Re-run it and paste raw output.
Commit each item separately. Final report: raw `git diff main --stat`, raw `git log --oneline -8`, contradictions found, anything not done.
```

## Appendix C: Prompt P1, sub-phase 2a (Step 1)

```
Phase 2, sub-phase 2a: bootstrap Bicep. Branch `phase-2a-bootstrap`. Use the existing infra/modules stubs and wire them from infra/main.bicep with parameters in infra/parameters/dev.bicepparam. If docs/BUILD_PLAN.md Phase 2 does not match docs/PHASE2_HANDOVER.md, stop and tell me.

Implement ONLY:
1. monitoring: Log Analytics workspace, and workspace-based Application Insights if the stub expects it.
2. acr: Container Registry, Basic, admin user disabled.
3. key-vault: RBAC authorization mode, soft delete on (shortest retention), purge protection OFF so teardown and name reuse work. Record this as PROPOSED.
4. storage: StorageV2 Standard_LRS, no public blob access, TLS 1.2 minimum, HTTPS only; containers raw-uploads and stamped-documents; blob CORS allowing PUT, OPTIONS, GET, HEAD from a parameter list of origins (default http://localhost:5173), allowed headers including x-ms-blob-type and content-type (use * only if narrower fails), max age 3600. Do not disable shared key access; note it as a later hardening item.
5. service-bus: Basic namespace; queue job-processing, maxDeliveryCount 5, lock duration parameter default PT1M, dead-lettering as the tier supports.
6. identity (new module): one user-assigned managed identity with role assignments scoped to the specific resources: Storage Blob Data Contributor on the storage account; Service Bus Data Sender and Service Bus Data Receiver on the namespace; Key Vault Secrets User on the vault; AcrPull on the registry. Role definition IDs I believe are (verify, the owner will check them with `az role definition list --name "<role>" --query "[0].name" -o tsv` before deploying; put the role name in a comment next to each GUID): Storage Blob Data Contributor ba92f5b4-2d11-453d-a403-e96b0029c9fe; Service Bus Data Sender 69a216fc-b8fb-44d8-bc22-1f3c2cd27a39; Service Bus Data Receiver 4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0; Key Vault Secrets User 4633458b-17de-408a-b874-0445c86b69e6; AcrPull 7f951dda-4ed3-4680-a7ca-43fe172d538d.
7. A parameter developerPrincipalId read with readEnvironmentVariable('DEV_PRINCIPAL_ID', ''). When non-empty, grant that principal on the specific resources: Storage Blob Data Contributor (storage), Service Bus Data Owner 090c5cfd-751d-490a-894a-3ce6f1109419 (namespace), Key Vault Secrets Officer b86a8fe4-44ce-4948-aee5-eccb2c155cd7 (vault), AcrPush 8311e382-0749-4cb8-b61a-304f252e45ec (registry). When empty, skip. Use principalType User.

Leave postgres, container-apps-env, worker-app, api-app, function-app, signalr as untouched stubs. Remove `#disable-next-line no-unused-params` suppressions only where a parameter is now used.
Add outputs for names and ids needed later (no secrets). Add infra/README.md with the exact owner commands: build, lint, what-if, deploy, verify (`az resource list -g rg-credenviel-dev -o table`).
One commit per module. Then STOP and report: files changed; raw `az bicep build` and `lint` output for main.bicep and every module; the list of resources the what-if should show; anything uncertain (API versions, SKU limits, role IDs). Mark anything not run as NOT RUN.
```

## Appendix D: Prompt P2, sub-phase 2b (Step 2)

```
Phase 2, sub-phase 2b: data and real adapters. Branch `phase-2b-data-adapters` from main (2a merged). Local behavior must not change: all Phase 1 tests keep passing with the default local backends.

A. Bicep
1. postgres module: Flexible Server, Burstable Standard_B1ms, version 16, 32 GB storage, backups at the minimum retention, public network access with (a) firewall rule allowing Azure services (0.0.0.0 to 0.0.0.0) and (b) a rule for the developer IP read with readEnvironmentVariable('DEV_IP', '') (skip when empty). Admin login a non-default name, password from `@secure() param` read with readEnvironmentVariable('PG_ADMIN_PASSWORD', ''); fail the deployment with a clear message when it is empty. Database `credenviel`. Store the password in Key Vault as a secret (Bicep writes the secret). SSL required. Record the public-access trade-off in DECISIONS (PROPOSED).
2. Test resources, behind a parameter enableTestResources (default true for dev): a blob container `test-scratch` and a Service Bus queue `job-processing-test` (maxDeliveryCount 5).
3. Outputs: server FQDN, database name, secret name (no secrets).
4. Key Vault: grant nothing new in this step except what the identity module already has.

B. Adapters (behind existing interfaces; switch with QUEUE_BACKEND and STORE_BACKEND)
5. Python: ServiceBusQueue implementing the Queue interface (azure-servicebus, azure-identity). Peek-lock; receive returns None after a short wait; complete/abandon/dead_letter by the held message; surface delivery_count; keep a receiver open across calls; raise the same LockLostError type as the local queue when the lock is lost. Authenticate with DefaultAzureCredential using AZURE_CLIENT_ID when set. Config: SERVICEBUS_FQDN, SERVICEBUS_QUEUE.
6. Python: BlobStore implementing Store (azure-storage-blob). Keys have the form container/blob-path: split at the first "/". Config: STORAGE_ACCOUNT_NAME. Magic-byte checks must read only the start of the blob.
7. Go: Blob store and user-delegation SAS signer (azure-sdk-for-go azblob, azidentity), selected by STORE_BACKEND=blob. SAS: create+write only, scoped to the single blob, expiry 15 minutes, HTTPS only. Obtain a user delegation key with DefaultAzureCredential. If the identity needs an extra role for the delegation key, say which and tell me; do not guess.
8. CONTRACT CHANGE (mark it clearly in docs/CONTRACTS.md): the POST /api/v1/jobs response `upload` object gains `headers` (for blob backend: {"x-ms-blob-type": "BlockBlob"}; for local: {}). Real Blob rejects PUT without this header. Update the dev demo and tests accordingly.
9. Backends must never be able to point the destructive test harnesses at Azure. Add a guard so the existing integration harnesses still refuse any database not named credenviel_test on localhost.

C. Tooling (scripts must never write secrets to disk)
10. scripts/run_with_azure_env.py: given a command, builds the environment (Azure Postgres host from DATABASE_HOST env, password fetched at runtime from Key Vault via the already-logged-in `az` CLI, a random INTERNAL_API_KEY for the process) and runs the command; prints no secrets. Make targets: `run-api-azure` (APP_ENV=local, AUTH_MODE=dev, STORE_BACKEND=blob), `migrate-azure` (applies db/migrations 001 and 002 ONLY, never db/local; shows the target host and asks for typed confirmation; uses `docker run --rm postgres:16 psql`), `test-azure`.
11. `test-azure`: pytest/go tests marked `azure`, excluded from `make test`, `make test-integration` and CI. They use only the test-scratch container and job-processing-test queue, use unique names per run, clean up after themselves, and refuse to run unless the target resource group name is rg-credenviel-dev. Tests: Blob put/exists/size/open round-trip; Service Bus send/receive/complete, abandon redelivery with delivery_count incrementing, dead_letter; Go SAS: a signed URL accepts a PUT with the header and rejects one without a valid signature or after expiry (expiry test can use a short TTL parameter).

D. Docs: CONTRACTS (backend env vars, upload headers), DECISIONS (all new choices PROPOSED), BUILD_PLAN (tick only what you ran), docs/PHASE2_PROGRESS.md (raw outputs).

Checks you can run locally: `make test`, `make test-integration`, `az bicep build`/`lint`, Azurite for Blob where useful. Everything that needs Azure is NOT RUN until the owner runs it. Then STOP and report: files changed, raw local outputs, the exact owner commands (deploy, migrate-azure, test-azure, run-api-azure), the manual SAS upload test steps (curl with the x-ms-blob-type header), what-if expectations, uncertainties.
```

## Appendix E: Prompt P3, sub-phase 2c (Step 3)

```
Phase 2, sub-phase 2c: compute and end-to-end. Branch `phase-2c-compute-e2e` from main (2a and 2b merged).

A. Bicep (extend main.bicep with parameters: deployApps (bool, default false), workerImageTag (readEnvironmentVariable('WORKER_IMAGE_TAG','')), enableEventSubscription (bool from readEnvironmentVariable('ENABLE_EVENT_SUBSCRIPTION','false')))
1. container-apps-env: Consumption environment wired to the Log Analytics workspace.
2. worker-app (only when deployApps): image <acr>.azurecr.io/credenviel-worker:<tag>, pulled using the user-assigned identity (AcrPull). Command `python -m worker --stub-extractor`. min replicas 0, max replicas parameter default 3, small CPU and memory (parameters). Env: QUEUE_BACKEND=servicebus, STORE_BACKEND=blob, SERVICEBUS_FQDN, SERVICEBUS_QUEUE, STORAGE_ACCOUNT_NAME, AZURE_CLIENT_ID, CONFIDENCE_THRESHOLD; DATABASE_URL (or password) as a Container Apps secret that references the Key Vault secret through the identity. No notify URL: the worker must treat an unset notify URL as "skip notify" without errors (verify in code and add a test if needed). KEDA scale rule type azure-servicebus: queueName job-processing, namespace, messageCount 5, pollingInterval 30, cooldownPeriod 300, authenticating with the managed identity. Check the Container Apps API version you use supports identity-based scale rule auth; if it does not, STOP and tell me and propose the Key Vault secret connection-string fallback as PROPOSED. Do not silently choose.
3. function-app: Python Azure Function, Linux, with its own host storage account (separate from the uploads account), Application Insights, and the user-assigned identity. App settings: same backend variables and DB secret reference. Choose the hosting plan by reading current Azure Functions documentation; I expect a Consumption plan may have a quota of 0 on this subscription, so make the plan a parameter (Consumption or Flex Consumption) and list the fallback in your report. Do not guess; say what you could not verify.
4. event-grid module: a system topic on the uploads storage account and an event subscription to the Function, only when enableEventSubscription is true, filtered to Microsoft.Storage.BlobCreated and subject beginning with /blobServices/default/containers/raw-uploads/ . Document that it must be enabled only after the Function code is published, because the subscription validates the endpoint.
5. Keep the API, SignalR and anything else as stubs. The Go API is NOT deployed.

B. Code
6. worker/Dockerfile (build context = repo root; installs shared/python; no test or destructive code in the image; runs as non-root; python slim base). Handle SIGTERM: stop receiving new messages, finish or abandon the current message cleanly, exit 0 within the grace period. Add tests (unit-level, simulate the signal).
7. functions: real Azure wiring of the Event Grid trigger calling core.handle_blob_created with ServiceBusQueue and BlobStore, plus Postgres through the existing repository code. Order of operations inside the Function must stay: validate, set job queued, then send the message (a retry re-sends). scripts/package_function.py builds a deployable zip (vendoring shared/python and dependencies for Linux) and prints the exact owner publish command. Do not run it against Azure.
8. scripts/e2e_azure.py and `make e2e-azure`: creates one job through the locally running API (run via run_with_azure_env), PUTs a small generated PDF to the returned URL with the returned headers, then polls GET /api/v1/jobs/{id} and prints a timestamped status timeline until processed or timeout.
9. scripts/scale_test_azure.py and `make scale-test-azure`: creates and uploads N small PDFs (default 25) through the API, and every 15 seconds records the Service Bus active message count and the worker replica count into a CSV (use `az servicebus queue show` and `az containerapp replica list` via subprocess; read-only), until the queue is empty and replicas return to 0 or a timeout. It must not delete anything.

C. Docs: CONTRACTS, DECISIONS (all PROPOSED), BUILD_PLAN (tick only what you ran), docs/PHASE2_PROGRESS.md, a short docs/DEPLOY.md with the owner's exact command sequence (infra pass with deployApps=false, build and push image, deploy pass with WORKER_IMAGE_TAG, package and publish Function, enable event subscription).

Local checks you can run: `make test`, `make test-integration`, `az bicep build`/`lint`, `docker build` of the worker image, SIGTERM unit tests. Everything needing Azure is NOT RUN. Then STOP and report: files changed, raw outputs, the owner command sequence, expected what-if resources, uncertainties (API versions, plan quota, KEDA identity auth).
```

## Appendix F: Final steps (owner)

1. Run Step 3 checkpoint; fill `docs/PHASE2_PROGRESS.md` with raw outputs and evidence.
2. Open the PR for the last branch with a **merge commit** (not squash). Reviewer approves.
3. `git checkout main && git pull && git tag phase-2 && git push origin phase-2`.
4. Stop Postgres. Check cost. Send the results to the team for the Phase 3 plan.
