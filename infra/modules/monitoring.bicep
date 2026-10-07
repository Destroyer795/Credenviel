// Monitoring — Log Analytics workspace + workspace-based Application Insights.
// The workspace is also the log sink for the Container Apps environment (2c).
// Tracks: Function execution time, Service Bus ActiveMessages,
// Container Apps replica count, per-job processing latency.
// Alert rules (DLQ message count) are added in Phase 6.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Log Analytics workspace name')
param workspaceName string = 'log-credenviel-${uniqueString(resourceGroup().id)}'

@description('Application Insights name')
param appInsightsName string = 'appi-credenviel-${uniqueString(resourceGroup().id)}'

@description('Log retention in days (30 is the free-allowance default)')
param retentionInDays int = 30

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output workspaceName string = workspace.name
output workspaceId string = workspace.id
output appInsightsName string = appInsights.name
output appInsightsId string = appInsights.id
