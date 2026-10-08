using '../main.bicep'

// The subscription's region policy only allows uaenorth, indonesiacentral, malaysiawest,
// indiasouthcentral and eastasia for resources (see DECISIONS D-037). The resource group
// itself stays in centralindia; resources may live in a different region.
param location = 'eastasia'
param environment = 'dev'
param apiImageTag = 'latest'

// Browser origins allowed to upload to Blob Storage. Add the deployed frontend origin later.
param corsAllowedOrigins = [
  'http://localhost:5173'
]

// Your Entra object id, exported in the shell before deploying (never committed):
//   export DEV_PRINCIPAL_ID=<object id>
// Empty skips the developer role grants.
param developerPrincipalId = readEnvironmentVariable('DEV_PRINCIPAL_ID', '')

// Postgres admin password. Generate a strong password, export it before deploying:
//   $sec = Read-Host -Prompt "Enter Postgres Admin Password" -AsSecureString
//   $env:PG_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $sec).Password
// The deployment stores it in Key Vault. Empty means Postgres is skipped
// (allows redeployments without the password).
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD', '')

// Developer public IP for the Postgres firewall rule:
//   $env:DEV_IP = (Invoke-RestMethod https://api.ipify.org).Trim()
// Empty skips the rule.
param developerIp = readEnvironmentVariable('DEV_IP', '')

// Test resources (test-scratch container, job-processing-test queue) — enabled for dev.
param enableTestResources = true

// Worker container image tag (pass 2 & 3):
//   export WORKER_IMAGE_TAG=<git short hash>
param workerImageTag = readEnvironmentVariable('WORKER_IMAGE_TAG', '')

// Deploy compute apps (Worker Container App and Function App). Default false for pass 1:
//   export DEPLOY_APPS=true
param deployApps = bool(readEnvironmentVariable('DEPLOY_APPS', 'false'))

// Enable Event Grid subscription to Function App. Set true ONLY in pass 3 after Function is published:
//   export ENABLE_EVENT_SUBSCRIPTION=true
param enableEventSubscription = bool(readEnvironmentVariable('ENABLE_EVENT_SUBSCRIPTION', 'false'))

// Function hosting plan: Consumption (default) or FlexConsumption (fallback if quota requires)
param functionHostingPlan = readEnvironmentVariable('FUNCTION_HOSTING_PLAN', 'Consumption')
