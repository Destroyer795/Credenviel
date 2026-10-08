// Python Worker Container App — processes job messages from Service Bus.
// KEDA scale rule: scales based on pending Service Bus messages in job-processing queue.
// Min: 0 (scale-to-zero when idle), Max: 3 (parameter default).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Environment name')
#disable-next-line no-unused-params
param environment string = 'dev'

@description('Container image tag')
param imageTag string = 'latest'

@description('Container Apps Environment ID')
param containerAppsEnvironmentId string

@description('User-assigned managed identity resource ID')
param identityId string

@description('User-assigned managed identity client ID')
param identityClientId string

@description('ACR login server (e.g. myacr.azurecr.io)')
param registryLoginServer string

@description('ACR admin username')
param registryUsername string = ''

@description('ACR admin password')
@secure()
param registryPassword string = ''

@description('Storage account name')
param storageAccountName string

@description('Service Bus namespace name')
#disable-next-line no-unused-params
param serviceBusNamespaceName string

@description('Service Bus FQDN (e.g. sb-xxx.servicebus.windows.net)')
param serviceBusFqdn string

@description('Service Bus queue name')
param serviceBusQueueName string = 'job-processing'

@description('Repository name of worker image in ACR')
param imageRepository string = 'worker'

@description('Postgres admin password')
@secure()
param postgresPassword string

@description('Postgres fully qualified domain name')
param postgresFqdn string

@description('Database name')
param databaseName string = 'credenviel'

@description('Database user')
param databaseUser string = 'credenvieladmin'

@description('Minimum replicas (1 for active worker on express/consumption environment)')
param minReplicas int = 1

@description('Maximum replicas')
param maxReplicas int = 3

@description('Target message count per replica for KEDA scaler')
#disable-next-line no-unused-params
param messageCountPerReplica int = 5

@description('Confidence threshold for extraction')
param confidenceThreshold string = '0.85'

resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-worker-${uniqueString(resourceGroup().id)}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      registries: !empty(registryPassword) ? [
        {
          server: registryLoginServer
          username: registryUsername
          passwordSecretRef: 'acr-password'
        }
      ] : [
        {
          server: registryLoginServer
          identity: identityId
        }
      ]
      secrets: !empty(registryPassword) ? [
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'acr-password'
          value: registryPassword
        }
      ] : [
        {
          name: 'postgres-password'
          value: postgresPassword
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${registryLoginServer}/${imageRepository}:${imageTag}'
          command: [
            'python'
            '-m'
            'worker'
            '--stub-extractor'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
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
              value: storageAccountName
            }
            {
              name: 'AZURE_CLIENT_ID'
              value: identityClientId
            }
            {
              name: 'CONFIDENCE_THRESHOLD'
              value: confidenceThreshold
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
              secretRef: 'postgres-password'
            }
            {
              name: 'API_INTERNAL_URL'
              value: ''
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output workerAppName string = workerApp.name
output workerAppId string = workerApp.id
