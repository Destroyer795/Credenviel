# Credenviel Deployment & Verification Guide (Phase 2c)

> **Phase 2c Goal**: Provision cloud compute (Container Apps Environment, KEDA-scaled Worker, Azure Function App, and Event Grid), deploy application code, and verify end-to-end processing and dynamic auto-scaling against live Azure infrastructure.

---

## 1. Safety & Student Credit Preservation Notice

> [!IMPORTANT]
> Azure Database for PostgreSQL Flexible Server incurs hourly charges while in the `Ready` (running) state.
> To prevent exhausting Azure for Students credits:
> 1. The PostgreSQL server is kept **Stopped** by default.
> 2. Start PostgreSQL only when running live tests or migrations.
> 3. **Always stop PostgreSQL immediately** upon concluding testing sessions.
>
> All other compute resources scale down to zero or consume negligible idle cost:
> - **Container Apps Worker**: KEDA scales to 0 replicas when `job-processing` queue depth is 0.
> - **Azure Function App**: Linux Consumption (Dynamic Y1) plan incurs charges only per active execution.
> - **Event Grid System Topic**: Incurs charges only per event delivery.

---

## 2. Multi-Pass Deployment Architecture

Azure infrastructure has three inter-dependent deployment stages that require a 3-pass sequence:

```
Pass 1 (p2c-1): Compute Infra
  ├── Container Apps Environment
  ├── Function App (Infrastructure skeleton)
  └── Event Grid System Topic
       │
       ▼
Owner Step: Build & Push Worker Image to ACR
       │
       ▼
Pass 2 (p2c-2): Container App Worker
  └── Container App with KEDA Service Bus Scale Rule
       │
       ▼
Owner Step: Publish Function App Code (.zip)
       │
       ▼
Pass 3 (p2c-3): Wire Event Grid Subscription
  └── Event Grid Subscription (validates live Function endpoint)
       │
       ▼
End-to-End & Scale Verification
```

Why 3 passes?
1. **Pass 1 -> Image Push -> Pass 2**: Container Apps cannot start without a valid container image in ACR. Pass 1 creates the environment, images are pushed to ACR, and Pass 2 creates the Container App.
2. **Pass 2 -> Function Code -> Pass 3**: Event Grid validates that the webhook/Azure Function endpoint exists and responds during subscription creation. Pass 3 enables `enableEventSubscription=true` only after Function code is deployed.

---

## 3. Step-by-Step Owner Deployment Runbook

### Prerequisites

Set up your shell environment in your terminal:

```bash
# Set resource group and target region
export AZURE_RESOURCE_GROUP="rg-credenviel-dev"

# Set your IP address for PostgreSQL firewall access
export DEV_IP=$(curl -s https://api.ipify.org)

# Set your Entra principal ID
TOKEN=$(az account get-access-token --resource https://management.azure.com --query accessToken -o tsv)
export DEV_PRINCIPAL_ID=$(python3 -c "import sys,json,base64; p=sys.argv[1].split('.')[1]; p+='='*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p))['oid'])" "$TOKEN")
```

---

### Step 1: Deploy Pass 1 (Compute Infrastructure)

Deploy the Container Apps Environment, Function App host, and Event Grid System Topic with applications disabled:

```bash
az deployment group create \
  --resource-group rg-credenviel-dev \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters deployApps=false enableEventSubscription=false \
  --name p2c-1
```

Confirm deployment success:
```bash
az deployment group show -g rg-credenviel-dev -n p2c-1 --query "properties.provisioningState" -o tsv
# Output: Succeeded
```

---

### Step 2: Build & Push Worker Image to ACR

Discover your ACR login server:
```bash
ACR_NAME=$(az acr list -g rg-credenviel-dev --query "[0].name" -o tsv)
ACR_LOGIN_SERVER=$(az acr list -g rg-credenviel-dev --query "[0].loginServer" -o tsv)
GIT_SHA=$(git rev-parse --short HEAD)

echo "ACR Name:         $ACR_NAME"
echo "ACR Login Server: $ACR_LOGIN_SERVER"
echo "Worker Image Tag: $GIT_SHA"
```

Log in to ACR:
```bash
az acr login --name $ACR_NAME
```

Build the worker container image (from repository root so `shared/python` is included in context):
```bash
docker build -t "$ACR_LOGIN_SERVER/worker:$GIT_SHA" -f worker/Dockerfile .
```

Push image to ACR:
```bash
docker push "$ACR_LOGIN_SERVER/worker:$GIT_SHA"
```

---

### Step 3: Deploy Pass 2 (Worker Container App)

Deploy the worker container app wired with the newly pushed image and KEDA auto-scaling:

```bash
az deployment group create \
  --resource-group rg-credenviel-dev \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters deployApps=true workerImageTag=$GIT_SHA enableEventSubscription=false \
  --name p2c-2
```

Confirm the worker container app is provisioned:
```bash
az containerapp list -g rg-credenviel-dev --query "[].{Name:name, ProvisioningState:properties.provisioningState}" -o table
```

---

### Step 4: Package & Publish Function App Code

1. Build the clean deployment zip package (vendors `credenviel_shared`):
```bash
make package-function
# Output: dist/function-app.zip created
```

2. Discover Function App name:
```bash
FUNCTION_APP_NAME=$(az functionapp list -g rg-credenviel-dev --query "[0].name" -o tsv)
echo "Deploying to Function App: $FUNCTION_APP_NAME"
```

3. Deploy zip package with remote build enabled:
```bash
az functionapp deployment source config-zip \
  --resource-group rg-credenviel-dev \
  --name $FUNCTION_APP_NAME \
  --src dist/function-app.zip \
  --build-remote true
```

4. Verify the Function is recognized:
```bash
az functionapp function list -g rg-credenviel-dev -n $FUNCTION_APP_NAME --query "[].name" -o tsv
# Output: BlobCreatedTrigger (or func-.../BlobCreatedTrigger)
```

---

### Step 5: Deploy Pass 3 (Enable Event Grid Subscription)

Now that the Function App endpoint is live, enable the Event Grid storage subscription:

```bash
az deployment group create \
  --resource-group rg-credenviel-dev \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam \
  --parameters deployApps=true workerImageTag=$GIT_SHA enableEventSubscription=true \
  --name p2c-3
```

Confirm the subscription is active:
```bash
az eventgrid system-topic event-subscription list \
  --resource-group rg-credenviel-dev \
  --system-topic-name $(az eventgrid system-topic list -g rg-credenviel-dev --query "[0].name" -o tsv) \
  -o table
```

---

### Step 6: Start PostgreSQL & Run Live Verifications

1. **Start Azure PostgreSQL Flexible Server**:
```bash
POSTGRES_NAME=$(az postgres flexible-server list -g rg-credenviel-dev --query "[0].name" -o tsv)
az postgres flexible-server start -g rg-credenviel-dev -n $POSTGRES_NAME
```

Wait until status is `Ready`:
```bash
az postgres flexible-server show -g rg-credenviel-dev -n $POSTGRES_NAME --query "state" -o tsv
# Output: Ready
```

2. **Run End-to-End Verification (`e2e-azure`)**:
In one terminal, start the Go API server with Azure cloud environment:
```bash
make run-api-azure
```
In a second terminal, execute the end-to-end verification:
```bash
make e2e-azure
```
Alternatively, run the automated self-starting script:
```bash
python scripts/e2e_azure.py --start-api
```

Expected output:
- Uploads sample PDF directly to `raw-uploads` via signed user-delegation SAS.
- Event Grid triggers Function -> Enqueues message on Service Bus.
- Worker dequeues and processes certificate -> Updates status to `processed`.
- `[+] SUCCESS: Pipeline executed end-to-end through Azure compute!`

3. **Run KEDA Auto-Scaling Verification (`scale-test-azure`)**:
```bash
make scale-test-azure
```
Expected output:
- Submits burst of 25 jobs concurrently.
- Monitors KEDA scaling: cold start 0 -> peak worker replicas (e.g. 5-10) -> drains back to 0.
- Writes telemetry log to `scale_test_results.csv`.

---

### Step 7: Stop PostgreSQL Server (Essential)

> [!CAUTION]
> Stop the PostgreSQL server immediately after testing to stop credit consumption.

```bash
az postgres flexible-server stop -g rg-credenviel-dev -n $POSTGRES_NAME
```

Confirm it is stopped:
```bash
az postgres flexible-server show -g rg-credenviel-dev -n $POSTGRES_NAME --query "state" -o tsv
# Output: Stopped
```

---

## 4. Troubleshooting & Verification Matrix

| Symptom | Cause | Resolution |
|---|---|---|
| Event Grid deployment error: `Endpoint validation failed` | Function App not published before enabling Event Grid subscription | Ensure Step 4 is complete before running Step 5 (`enableEventSubscription=true`). |
| Blob upload returns `400 InvalidHeaderValue` | Missing `x-ms-blob-type` header in PUT request | Include `x-ms-blob-type: BlockBlob` header in upload request (automatically handled by `e2e_azure.py`). |
| PostgreSQL connection refused on port 5432 | Local network/firewall blocking port 5432 or server stopped | 1. Ensure server is started (`az postgres flexible-server start`).<br>2. Run migrations or commands via Azure Cloud Shell (`shell.azure.com`). |
| Worker not scaling up | KEDA scale rule authentication issue | Verify worker user-assigned identity has `Azure Service Bus Data Receiver` on the namespace. |
| Function App runtime errors | Missing vendored dependencies | Rebuild package using `make package-function` ensuring `dist/function-app.zip` contains `credenviel_shared/`. |
