// Federated Identity Credential for GitHub Actions — allows passwordless OIDC
// authentication from GitHub Actions workflows to Azure using the existing User-Assigned
// Managed Identity, without requiring Microsoft Entra tenant-level App Registration permissions.

targetScope = 'resourceGroup'

@description('Name of the existing user-assigned managed identity')
param identityName string

@description('GitHub repository formatted as owner/repo (e.g. Destroyer795/Credenviel)')
param githubRepo string = 'Destroyer795/Credenviel'

@description('GitHub branch for the federated credential (e.g. main)')
param githubBranch string = 'main'

@description('Optional ACR name to grant AcrPush to the managed identity for GitHub Actions CI image builds')
param registryName string = ''

@description('Grant Contributor role on this resource group to the managed identity for GitHub Actions CD deployments')
param grantResourceGroupContributor bool = true

// Role definition IDs
var roleContributor = 'b24988ac-6180-42a0-ab88-20f7382dd24c'
var roleAcrPush = '8311e382-0749-4cb8-b61a-304f252e45ec'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = if (!empty(registryName)) {
  name: registryName
}

// Federated credential on the user-assigned managed identity for the specified branch
resource branchCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'gh-${replace(replace(githubRepo, '/', '-'), '_', '-')}-${replace(githubBranch, '/', '-')}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/${githubBranch}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Federated credential for Pull Requests
resource prCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'gh-${replace(replace(githubRepo, '/', '-'), '_', '-')}-pr'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:pull_request'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Grant Contributor on the Resource Group so GitHub Actions can deploy Bicep and update Container Apps
resource idRgContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (grantResourceGroupContributor) {
  name: guid(resourceGroup().id, identity.id, roleContributor)
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleContributor)
  }
}

// Grant AcrPush on ACR if registry name provided
resource idAcrPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(registryName)) {
  name: guid(resourceGroup().id, identity.id, roleAcrPush)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleAcrPush)
  }
}

output federatedBranchCredentialId string = branchCredential.id
output federatedPrCredentialId string = prCredential.id
output branchSubject string = branchCredential.properties.subject
output prSubject string = prCredential.properties.subject
