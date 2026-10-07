// Certificate Digitization & Verification Pipeline — Main Bicep Template
// Orchestrates all module deployments for the pipeline infrastructure.
//
// Phase 2a deploys the bootstrap resources: monitoring, ACR, Key Vault, Storage,
// Service Bus and the managed identity with its role assignments.
//
// Usage (resource-group scope; see infra/README.md for the full owner sequence):
//   az bicep build --file infra/main.bicep
//   az deployment group what-if -g rg-credenviel-dev -p infra/parameters/dev.bicepparam
//   az deployment group create  -g rg-credenviel-dev -p infra/parameters/dev.bicepparam -n p2a-1

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Container image tag for API (used from Phase 3)')
#disable-next-line no-unused-params
param apiImageTag string = 'latest'

@description('Container image tag for Worker (used from 2c)')
#disable-next-line no-unused-params
param workerImageTag string = 'latest'

@description('Browser origins allowed to upload to and read from Blob Storage (CORS)')
param corsAllowedOrigins array = [
  'http://localhost:5173'
]

@description('Object ID of the developer user (read from DEV_PRINCIPAL_ID in dev.bicepparam). Empty skips the developer role grants.')
param developerPrincipalId string = ''

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
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'service-bus'
  params: {
    location: location
    tags: tags
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

// Stubs, implemented in later sub-phases:
//   postgres            (2b)
//   container-apps-env  (2c)
//   worker-app          (2c)
//   function-app        (2c)
//   api-app             (Phase 3)
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
