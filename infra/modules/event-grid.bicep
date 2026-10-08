// Event Grid — system topic on the uploads storage account and subscription to the Function.
//
// IMPORTANT: enableEventSubscription must remain FALSE on initial deployment.
// It can only be set to TRUE after the Function code is published to Azure,
// because Event Grid validates the webhook / function endpoint during subscription creation.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Uploads Storage Account resource ID')
param storageAccountId string

@description('Function App resource ID')
param functionAppId string

@description('Function name within the Function App')
param functionName string = 'BlobCreatedTrigger'

@description('Whether to deploy the event subscription. Must be false until Function code is published!')
param enableEventSubscription bool = false

@description('Event Grid System Topic name')
param systemTopicName string = 'evgt-cred-${uniqueString(resourceGroup().id)}'

resource systemTopic 'Microsoft.EventGrid/systemTopics@2022-06-15' = {
  name: systemTopicName
  location: location
  tags: tags
  properties: {
    source: storageAccountId
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

resource eventSubscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2022-06-15' = if (enableEventSubscription) {
  parent: systemTopic
  name: 'sub-blob-created'
  properties: {
    destination: {
      endpointType: 'AzureFunction'
      properties: {
        resourceId: '${functionAppId}/functions/${functionName}'
        maxEventsPerBatch: 1
        preferredBatchSizeInKilobytes: 64
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.Storage.BlobCreated'
      ]
      subjectBeginsWith: '/blobServices/default/containers/raw-uploads/'
    }
  }
}

output systemTopicName string = systemTopic.name
output systemTopicId string = systemTopic.id
