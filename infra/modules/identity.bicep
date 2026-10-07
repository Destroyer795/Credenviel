// Identity — one user-assigned managed identity shared by the worker and the Function,
// plus least-privilege role assignments, each scoped to the single resource it needs.
// Optionally grants a developer principal the roles needed to push images, read/write
// blobs, use Service Bus and manage Key Vault secrets from a laptop.
//
// Role definition IDs below come from the Azure built-in roles list. The owner must
// verify each before deploying (read-only):
//   az role definition list --name "<role name>" --query "[0].name" -o tsv

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Managed identity name')
param identityName string = 'id-credenviel-${uniqueString(resourceGroup().id)}'

@description('Existing storage account name')
param storageAccountName string

@description('Existing Service Bus namespace name')
param serviceBusNamespaceName string

@description('Existing Key Vault name')
param keyVaultName string

@description('Existing container registry name')
param registryName string

@description('Object ID of the developer user to grant laptop access. Empty skips the developer grants.')
param developerPrincipalId string = ''

// ---- Built-in role definition IDs (verify before deploying) ----
var roleStorageBlobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
var roleServiceBusDataSender = '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39' // Azure Service Bus Data Sender
var roleServiceBusDataReceiver = '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0' // Azure Service Bus Data Receiver
var roleKeyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6' // Key Vault Secrets User
var roleAcrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull
var roleServiceBusDataOwner = '090c5cfd-751d-490a-894a-3ce6f1109419' // Azure Service Bus Data Owner (developer only)
var roleKeyVaultSecretsOfficer = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7' // Key Vault Secrets Officer (developer only)
var roleAcrPush = '8311e382-0749-4cb8-b61a-304f252e45ec' // AcrPush (developer only)

var grantDeveloper = !empty(developerPrincipalId)

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2021-11-01' existing = {
  name: serviceBusNamespaceName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

// ---- Managed identity roles ----

resource idStorageBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, identity.id, roleStorageBlobDataContributor)
  scope: storageAccount
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
  }
}

resource idServiceBusSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, identity.id, roleServiceBusDataSender)
  scope: serviceBusNamespace
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleServiceBusDataSender)
  }
}

resource idServiceBusReceiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBusNamespace.id, identity.id, roleServiceBusDataReceiver)
  scope: serviceBusNamespace
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleServiceBusDataReceiver)
  }
}

resource idKeyVaultSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identity.id, roleKeyVaultSecretsUser)
  scope: keyVault
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsUser)
  }
}

resource idAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, roleAcrPull)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPull)
  }
}

// ---- Developer roles (skipped when developerPrincipalId is empty) ----

resource devStorageBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantDeveloper) {
  name: guid(storageAccount.id, developerPrincipalId, roleStorageBlobDataContributor)
  scope: storageAccount
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataContributor)
  }
}

resource devServiceBus 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantDeveloper) {
  name: guid(serviceBusNamespace.id, developerPrincipalId, roleServiceBusDataOwner)
  scope: serviceBusNamespace
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleServiceBusDataOwner)
  }
}

resource devKeyVault 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantDeveloper) {
  name: guid(keyVault.id, developerPrincipalId, roleKeyVaultSecretsOfficer)
  scope: keyVault
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKeyVaultSecretsOfficer)
  }
}

resource devAcrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantDeveloper) {
  name: guid(registry.id, developerPrincipalId, roleAcrPush)
  scope: registry
  properties: {
    principalId: developerPrincipalId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPush)
  }
}

output identityName string = identity.name
output identityId string = identity.id
output identityClientId string = identity.properties.clientId
output identityPrincipalId string = identity.properties.principalId
