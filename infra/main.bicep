// Certificate Digitization & Verification Pipeline — Main Bicep Template
// Orchestrates all module deployments for the pipeline infrastructure.
//
// Usage:
//   az bicep build --file main.bicep
//   az deployment group what-if --resource-group <rg> --template-file main.bicep --parameters parameters/dev.bicepparam
//   az deployment group create --resource-group <rg> --template-file main.bicep --parameters parameters/dev.bicepparam

targetScope = 'resourceGroup'

// Parameters declared for Phase 0 scaffolding.
// Note: #disable-next-line suppressions are temporary and will be removed in Phase 2 as parameters are wired into modules.

@description('Azure region for all resources')
#disable-next-line no-unused-params
param location string = resourceGroup().location

@description('Environment name (dev, staging, prod)')
#disable-next-line no-unused-params
param environment string = 'dev'

@description('Container image tag for API')
#disable-next-line no-unused-params
param apiImageTag string = 'latest'

@description('Container image tag for Worker')
#disable-next-line no-unused-params
param workerImageTag string = 'latest'

// TODO Phase 2: Wire module references with parameters and remove #disable-next-line suppressions
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
