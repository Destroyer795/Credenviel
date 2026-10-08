// Azure Function App — blob-created Event Grid trigger.
// Validates uploads and enqueues job messages to Service Bus.
// Language: Python on Linux.
// Includes dedicated host storage account, App Insights integration,
// and user-assigned managed identity with Key Vault references.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Environment name (dev, staging, prod)')
#disable-next-line no-unused-params
param environment string = 'dev'

@description('Hosting plan: Consumption or FlexConsumption (fallback option)')
@allowed([
  'Consumption'
  'FlexConsumption'
])
param hostingPlan string = 'Consumption'

@description('Function App name')
param functionAppName string = 'func-cred-${uniqueString(resourceGroup().id)}'

@description('Dedicated host storage account name (max 24 lowercase alphanumeric)')
param hostStorageAccountName string = 'stfncred${uniqueString(resourceGroup().id)}'

@description('User-assigned managed identity resource ID')
param identityId string

@description('User-assigned managed identity client ID')
param identityClientId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Key Vault URI')
param keyVaultUri string

@description('Uploads Storage Account name (data target)')
param uploadsStorageAccountName string

@description('Service Bus FQDN')
param serviceBusFqdn string

@description('Service Bus queue name')
param serviceBusQueueName string = 'job-processing'

@description('Postgres fully qualified domain name')
param postgresFqdn string

@description('Database name')
param databaseName string = 'credenviel'

@description('Database user')
param databaseUser string = 'credenvieladmin'

// Dedicated host storage account for the Function runtime
resource hostStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: hostStorageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

// Hosting Plan (Dynamic Consumption Y1 or Flex Consumption FC1)
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${functionAppName}'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: hostingPlan == 'Consumption' ? 'Y1' : 'FC1'
    tier: hostingPlan == 'Consumption' ? 'Dynamic' : 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

var hostStorageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${hostStorage.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${hostStorage.listKeys().keys[0].value}'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    reserved: true
    keyVaultReferenceIdentity: identityId
    siteConfig: {
      linuxFxVersion: 'Python|3.11'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'python'
        }
        {
          name: 'AzureWebJobsFeatureFlags'
          value: 'EnableWorkerIndexing'
        }
        {
          name: 'AzureWebJobsStorage'
          value: hostStorageConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'QUEUE_BACKEND'
          value: 'servicebus'
        }
        {
          name: 'STORE_BACKEND'
          value: 'blob'
        }
        {
          name: 'SERVICEBUS_FQDN'
          value: serviceBusFqdn
        }
        {
          name: 'SERVICEBUS_QUEUE'
          value: serviceBusQueueName
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: uploadsStorageAccountName
        }
        {
          name: 'AZURE_CLIENT_ID'
          value: identityClientId
        }
        {
          name: 'PGHOST'
          value: postgresFqdn
        }
        {
          name: 'PGPORT'
          value: '5432'
        }
        {
          name: 'PGUSER'
          value: databaseUser
        }
        {
          name: 'PGDATABASE'
          value: databaseName
        }
        {
          name: 'PGSSLMODE'
          value: 'require'
        }
        {
          name: 'PGPASSWORD'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/postgres-admin-password)'
        }
      ]
    }
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output hostStorageAccountName string = hostStorage.name
