// Azure Key Vault — stores the Postgres admin password (2b) and other secrets.
// Referenced by Container Apps and Functions, never hardcoded.
//
// RBAC authorization mode (no access policies). Soft delete is on with the shortest
// retention (7 days). Purge protection is deliberately OFF so that teardown and
// re-creating the vault under the same name work; see DECISIONS D-033 (PROPOSED).
// If a deleted vault blocks reuse of its name: `az keyvault purge --name <vault>`.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Vault name: 3-24 characters, letters, digits and hyphens, globally unique')
param vaultName string = 'kv-cred-${uniqueString(resourceGroup().id)}'

@description('Soft-delete retention in days (7 is the minimum)')
param softDeleteRetentionInDays int = 7

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: softDeleteRetentionInDays
    // enablePurgeProtection intentionally omitted (off); once enabled it can never be disabled.
  }
}

output vaultName string = vault.name
output vaultId string = vault.id
output vaultUri string = vault.properties.vaultUri
