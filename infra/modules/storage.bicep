// Blob Storage — raw-uploads (direct browser upload via user-delegation SAS) and
// stamped-documents (generated QR-stamped PDFs).
// An Event Grid subscription (2c) watches raw-uploads only; stamped-documents is kept
// separate so output files can never trigger the upload Function recursively (D-013).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Storage account name: 3-24 lowercase letters and digits, globally unique')
param storageAccountName string = 'stcred${uniqueString(resourceGroup().id)}'

@description('Origins allowed to PUT/GET blobs from a browser (CORS)')
param corsAllowedOrigins array = [
  'http://localhost:5173'
]

@description('Deploy test containers (test-scratch). True for dev.')
param enableTestResources bool = false

@description('Headers the browser may send on a SAS upload. Widen to ["*"] only if a real upload is rejected at preflight.')
param corsAllowedHeaders array = [
  'x-ms-blob-type'
  'content-type'
  'x-ms-version'
  'x-ms-date'
  'x-ms-client-request-id'
]

@description('CORS preflight cache time in seconds')
param corsMaxAgeInSeconds int = 3600

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // allowSharedKeyAccess is left at its default (enabled). Disabling it is a later
    // hardening item once every client uses Entra auth (see DECISIONS D-034).
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: corsAllowedOrigins
          allowedMethods: [
            'PUT'
            'OPTIONS'
            'GET'
            'HEAD'
          ]
          allowedHeaders: corsAllowedHeaders
          exposedHeaders: [
            'x-ms-request-id'
            'x-ms-version'
            'etag'
          ]
          maxAgeInSeconds: corsMaxAgeInSeconds
        }
      ]
    }
  }
}

resource rawUploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'raw-uploads'
  properties: {
    publicAccess: 'None'
  }
}

resource stampedDocuments 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'stamped-documents'
  properties: {
    publicAccess: 'None'
  }
}

// Test container — used only by adapter tests (test-azure); behind enableTestResources.
resource testScratch 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (enableTestResources) {
  parent: blobService
  name: 'test-scratch'
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountName string = account.name
output storageAccountId string = account.id
output blobEndpoint string = account.properties.primaryEndpoints.blob
