// Service Bus — buffers job messages between the Function trigger and the workers.
// Basic tier, one queue `job-processing`. Every queue has a built-in dead-letter
// sub-queue; a message is dead-lettered after maxDeliveryCount failed deliveries.
// KEDA scale rule (2c): 1 replica per 5 pending messages, 30s poll, 5min cooldown.
//
// Local (SAS key) authentication is left enabled so the KEDA connection-string
// fallback stays possible; see DECISIONS D-035 (PROPOSED).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Namespace name: 6-50 characters, letters, digits and hyphens, globally unique')
param namespaceName string = 'sb-cred-${uniqueString(resourceGroup().id)}'

@description('Queue the Function writes to and the worker reads from')
param queueName string = 'job-processing'

@description('How long a received message stays locked, ISO 8601 (Basic tier maximum is 5 minutes)')
param lockDuration string = 'PT1M'

@description('Deliveries before a message is dead-lettered')
param maxDeliveryCount int = 5

@description('Deploy test resources (job-processing-test queue). True for dev.')
param enableTestResources bool = false

resource namespace 'Microsoft.ServiceBus/namespaces@2021-11-01' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
}

resource jobQueue 'Microsoft.ServiceBus/namespaces/queues@2021-11-01' = {
  parent: namespace
  name: queueName
  properties: {
    lockDuration: lockDuration
    maxDeliveryCount: maxDeliveryCount
    deadLetteringOnMessageExpiration: true
    requiresSession: false
  }
}

// Test queue — used only by adapter tests (test-azure); behind enableTestResources.
resource testQueue 'Microsoft.ServiceBus/namespaces/queues@2021-11-01' = if (enableTestResources) {
  parent: namespace
  name: 'job-processing-test'
  properties: {
    lockDuration: lockDuration
    maxDeliveryCount: maxDeliveryCount
    deadLetteringOnMessageExpiration: true
    requiresSession: false
  }
}

output namespaceName string = namespace.name
output namespaceId string = namespace.id
output queueName string = jobQueue.name
// Fully qualified namespace, used by clients with DefaultAzureCredential.
output fullyQualifiedNamespace string = '${namespace.name}.servicebus.windows.net'
