// Certificate Digitization & Verification Pipeline — Main Bicep Template
// Orchestrates all module deployments for the pipeline infrastructure.
//
// Phase 2a deploys the bootstrap resources: monitoring, ACR, Key Vault, Storage,
// Service Bus and the managed identity with its role assignments.
//
// Phase 2b adds: Postgres Flexible Server, test resources (test-scratch container,
// job-processing-test queue), and stores the Postgres password in Key Vault.
//
// Phase 2c adds: Container Apps managed environment, worker Container App with
// KEDA Service Bus scaling, Function App for blob processing, and Event Grid topic/subscription.
//
// Usage (resource-group scope; see docs/DEPLOY.md for the full owner sequence):
//   az bicep build --file infra/main.bicep
//   az deployment group what-if -g rg-credenviel-dev -p infra/parameters/dev.bicepparam
//   az deployment group create  -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2c-1

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Container image tag for API (used from Phase 3)')
param apiImageTag string = 'latest'

@description('Deploy Go API Container App (Phase 3)')
param deployApiApp bool = false

@description('Deploy Static Web App for frontend (Phase 3)')
param deployStaticWebApp bool = false

@description('GitHub repository formatted as owner/repo for GitHub Actions federated credential (e.g. Destroyer795/Credenviel)')
param githubRepo string = ''

@description('Authentication mode for API (entra, jwt, dev)')
param authMode string = 'entra'

@description('Microsoft Entra ID Tenant ID')
param entraTenantId string = ''

@description('Microsoft Entra ID Client ID (App ID)')
param entraClientId string = ''

@description('Microsoft Entra ID Audience')
param entraAudience string = ''

@secure()
@description('Symmetric secret for JWT fallback mode')
param jwtSymmetricSecret string = ''

@secure()
@description('Shared internal API key for worker callbacks')
param internalApiKey string = ''

@description('Container image tag for Worker (read from WORKER_IMAGE_TAG env). Empty when apps not yet deployed.')
param workerImageTag string = ''

@description('Deploy compute applications (Worker and Function). False on initial infra pass.')
param deployApps bool = false

@description('Enable Event Grid subscription to Function App. Set to true only after Function code is published.')
param enableEventSubscription bool = false

@description('Hosting plan for Function App: Consumption or FlexConsumption (fallback)')
param functionHostingPlan string = 'Consumption'

@description('Browser origins allowed to upload to and read from Blob Storage (CORS)')
param corsAllowedOrigins array = [
  'http://localhost:5173'
]

@description('Object ID of the developer user (read from DEV_PRINCIPAL_ID in dev.bicepparam). Empty skips the developer role grants.')
param developerPrincipalId string = ''

@secure()
@description('Postgres admin password (read from PG_ADMIN_PASSWORD env). Empty means Postgres is not deployed.')
param pgAdminPassword string = ''

@description('Developer public IP for Postgres firewall rule (read from DEV_IP env). Empty skips the rule.')
param developerIp string = ''

@description('Deploy test resources (test-scratch container, job-processing-test queue). True for dev.')
param enableTestResources bool = true

var tags = {
  project: 'credenviel'
  env: environment
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    tags: tags
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    tags: tags
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    location: location
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    tags: tags
    corsAllowedOrigins: corsAllowedOrigins
    enableTestResources: enableTestResources
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'service-bus'
  params: {
    location: location
    tags: tags
    enableTestResources: enableTestResources
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    tags: tags
    storageAccountName: storage.outputs.storageAccountName
    serviceBusNamespaceName: serviceBus.outputs.namespaceName
    keyVaultName: keyVault.outputs.vaultName
    registryName: acr.outputs.registryName
    developerPrincipalId: developerPrincipalId
  }
}

// Postgres: deployed when a password is provided; skipped otherwise.
module postgres 'modules/postgres.bicep' = if (!empty(pgAdminPassword)) {
  name: 'postgres'
  params: {
    location: location
    tags: tags
    adminPassword: pgAdminPassword
    developerIp: developerIp
    keyVaultName: keyVault.outputs.vaultName
  }
}

// Container Apps Environment — consumption environment shared by worker and API
module containerAppsEnv 'modules/container-apps-env.bicep' = {
  name: 'container-apps-env'
  params: {
    location: location
    tags: tags
    environment: environment
    logAnalyticsWorkspaceName: monitoring.outputs.workspaceName
  }
}

// Default Postgres FQDN helper when postgres module is conditional in Bicep
var defaultPostgresFqdn = 'psql-cred-${uniqueString(resourceGroup().id)}.postgres.database.azure.com'

// Reference existing Key Vault to securely retrieve secret values for modules requiring literal values
resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: 'kv-cred-${uniqueString(resourceGroup().id)}'
}

// Reference existing ACR for credentials
resource existingAcr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: 'crcredenviel${uniqueString(resourceGroup().id)}'
}

// Python Worker Container App (deployed in pass 2 after image push)
module workerApp 'modules/worker-app.bicep' = if (deployApps && !empty(workerImageTag)) {
  name: 'worker-app'
  params: {
    location: location
    tags: tags
    environment: environment
    imageTag: workerImageTag
    containerAppsEnvironmentId: containerAppsEnv.outputs.environmentId
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.identityClientId
    registryLoginServer: acr.outputs.loginServer
    registryUsername: existingAcr.listCredentials().username
    registryPassword: existingAcr.listCredentials().passwords[0].value
    storageAccountName: storage.outputs.storageAccountName
    serviceBusNamespaceName: serviceBus.outputs.namespaceName
    serviceBusFqdn: serviceBus.outputs.fullyQualifiedNamespace
    serviceBusQueueName: serviceBus.outputs.queueName
    postgresPassword: existingKeyVault.getSecret('postgres-admin-password')
    postgresFqdn: postgres.?outputs.serverFqdn ?? defaultPostgresFqdn
  }
}

// Function App for Event Grid blob trigger (deployed in pass 2)
module functionApp 'modules/function-app.bicep' = if (deployApps) {
  name: 'function-app'
  params: {
    location: location
    tags: tags
    environment: environment
    hostingPlan: functionHostingPlan
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.identityClientId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    keyVaultUri: keyVault.outputs.vaultUri
    uploadsStorageAccountName: storage.outputs.storageAccountName
    serviceBusFqdn: serviceBus.outputs.fullyQualifiedNamespace
    serviceBusQueueName: serviceBus.outputs.queueName
    postgresFqdn: postgres.?outputs.serverFqdn ?? defaultPostgresFqdn
  }
}

// Event Grid System Topic on Storage Account and Subscription to Function (deployed in pass 3)
module eventGrid 'modules/event-grid.bicep' = if (deployApps) {
  name: 'event-grid'
  params: {
    location: location
    tags: tags
    storageAccountId: storage.outputs.storageAccountId
    functionAppId: deployApps ? (functionApp.?outputs.functionAppId ?? '') : ''
    enableEventSubscription: enableEventSubscription
  }
}

// Go API Container App (Phase 3)
module apiApp 'modules/api-app.bicep' = if (deployApps && deployApiApp && !empty(apiImageTag)) {
  name: 'api-app'
  params: {
    location: location
    tags: tags
    environment: environment
    imageTag: apiImageTag
    containerAppsEnvironmentId: containerAppsEnv.outputs.environmentId
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.identityClientId
    registryLoginServer: acr.outputs.loginServer
    registryUsername: existingAcr.listCredentials().username
    registryPassword: existingAcr.listCredentials().passwords[0].value
    storageAccountName: storage.outputs.storageAccountName
    postgresPassword: existingKeyVault.getSecret('postgres-admin-password')
    postgresFqdn: postgres.?outputs.serverFqdn ?? defaultPostgresFqdn
    authMode: authMode
    entraTenantId: entraTenantId
    entraClientId: entraClientId
    entraAudience: entraAudience
    jwtSymmetricSecret: jwtSymmetricSecret
    internalApiKey: !empty(internalApiKey) ? internalApiKey : 'credenviel-internal-worker-key-placeholder'
  }
}

// Static Web App for Frontend (Phase 3)
module staticWebApp 'modules/static-web-app.bicep' = if (deployStaticWebApp) {
  name: 'static-web-app'
  params: {
    location: location
    tags: tags
  }
}

// Federated Identity Credential for GitHub Actions (Phase 3)
module federatedIdentity 'modules/federated-identity.bicep' = if (!empty(githubRepo)) {
  name: 'federated-identity'
  params: {
    identityName: identity.outputs.identityName
    githubRepo: githubRepo
    registryName: acr.outputs.registryName
  }
}

// Stubs for future phases:
//   signalr             (Phase 5)

// ---- Outputs: names and ids needed later (no secrets) ----
output logAnalyticsWorkspaceName string = monitoring.outputs.workspaceName
output appInsightsName string = monitoring.outputs.appInsightsName
output registryName string = acr.outputs.registryName
output registryLoginServer string = acr.outputs.loginServer
output keyVaultName string = keyVault.outputs.vaultName
output keyVaultUri string = keyVault.outputs.vaultUri
output storageAccountName string = storage.outputs.storageAccountName
output blobEndpoint string = storage.outputs.blobEndpoint
output serviceBusNamespace string = serviceBus.outputs.namespaceName
output serviceBusFqdn string = serviceBus.outputs.fullyQualifiedNamespace
output serviceBusQueueName string = serviceBus.outputs.queueName
output identityName string = identity.outputs.identityName
output identityClientId string = identity.outputs.identityClientId
output identityPrincipalId string = identity.outputs.identityPrincipalId
// Postgres outputs (only meaningful when deployed; check postgresDeployed before using)
#disable-next-line outputs-should-not-contain-secrets
output postgresDeployed bool = !empty(pgAdminPassword)
#disable-next-line outputs-should-not-contain-secrets
output postgresServerName string = postgres.?outputs.serverName ?? ''
#disable-next-line outputs-should-not-contain-secrets
output postgresServerFqdn string = postgres.?outputs.serverFqdn ?? ''
#disable-next-line outputs-should-not-contain-secrets
output postgresDatabaseName string = postgres.?outputs.databaseName ?? ''
#disable-next-line outputs-should-not-contain-secrets
output postgresSecretName string = postgres.?outputs.secretName ?? ''
// Compute outputs (2c)
output containerAppsEnvironmentId string = containerAppsEnv.outputs.environmentId
output containerAppsEnvironmentName string = containerAppsEnv.outputs.environmentName
output workerAppName string = workerApp.?outputs.workerAppName ?? ''
output functionAppName string = functionApp.?outputs.functionAppName ?? ''
output functionAppId string = functionApp.?outputs.functionAppId ?? ''
output eventGridTopicName string = eventGrid.?outputs.systemTopicName ?? ''
// Phase 3 outputs
output apiAppName string = apiApp.?outputs.apiAppName ?? ''
output apiUrl string = apiApp.?outputs.apiUrl ?? ''
output staticWebAppName string = staticWebApp.?outputs.staticWebAppName ?? ''
output staticWebAppUrl string = staticWebApp.?outputs.staticWebAppUrl ?? ''
output federatedBranchCredentialId string = federatedIdentity.?outputs.federatedBranchCredentialId ?? ''
