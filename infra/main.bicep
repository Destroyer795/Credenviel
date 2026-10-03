// Certificate Digitization & Verification Pipeline — Main Bicep Template
// Orchestrates all module deployments for the pipeline infrastructure.
//
// Usage:
//   az bicep build --file main.bicep
//   az deployment group what-if --resource-group <rg> --template-file main.bicep --parameters parameters/dev.bicepparam
//   az deployment group create --resource-group <rg> --template-file main.bicep --parameters parameters/dev.bicepparam

targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
param environment string = 'dev'

@description('Container image tag for API')
param apiImageTag string = 'latest'

@description('Container image tag for Worker')
param workerImageTag string = 'latest'

// TODO Phase 1: Add module references for each Azure resource
// module acr 'modules/acr.bicep' = { ... }
// module containerAppsEnv 'modules/container-apps-env.bicep' = { ... }
// module serviceBus 'modules/service-bus.bicep' = { ... }
// module storage 'modules/storage.bicep' = { ... }
// module postgres 'modules/postgres.bicep' = { ... }
// module keyVault 'modules/key-vault.bicep' = { ... }
// module signalr 'modules/signalr.bicep' = { ... }
// module functionApp 'modules/function-app.bicep' = { ... }
// module apiApp 'modules/api-app.bicep' = { ... }
// module workerApp 'modules/worker-app.bicep' = { ... }
// module monitoring 'modules/monitoring.bicep' = { ... }
