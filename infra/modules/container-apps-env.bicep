// Container Apps Environment — shared environment for the Python worker (2c) and Go API (Phase 3).
// KEDA scaling rules are configured per-app in worker-app.bicep, not here.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Environment name (dev, staging, prod)')
#disable-next-line no-unused-params
param environment string = 'dev'

@description('Name of the Container Apps managed environment')
param environmentName string = 'cae-cred-${uniqueString(resourceGroup().id)}'

@description('Existing Log Analytics workspace name')
param logAnalyticsWorkspaceName string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = managedEnvironment.id
output environmentName string = managedEnvironment.name
output defaultDomain string = managedEnvironment.properties.defaultDomain
