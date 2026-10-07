// PostgreSQL Flexible Server — stores users, jobs, records tables.
// Main cost driver: ~$12-15/month if left running continuously.
// Mitigation: stop between work sessions (auto-restarts after 7 days).
//
// Public network access with firewall rules: Azure services (0.0.0.0/0.0.0.0)
// and developer IP. Password stored in Key Vault by this module.
// See DECISIONS D-038 (PROPOSED) for the public-access trade-off.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Server name: 3-63 lowercase letters, digits and hyphens, globally unique')
param serverName string = 'psql-cred-${uniqueString(resourceGroup().id)}'

@description('Database name')
param databaseName string = 'credenviel'

@description('Admin login username (non-default)')
param adminLogin string = 'credenvieladmin'

@secure()
@description('Admin password — read with readEnvironmentVariable in the .bicepparam. Deployment fails when empty.')
param adminPassword string

@description('Developer public IP for firewall rule. Empty skips the rule.')
param developerIp string = ''

@description('Name of the existing Key Vault to store the admin password')
param keyVaultName string

@description('PostgreSQL version')
param version string = '16'

@description('Storage size in GB')
param storageSizeGB int = 32

@description('Backup retention in days (minimum)')
param backupRetentionDays int = 7

// Validate the password is not empty at deployment time
var passwordIsEmpty = empty(adminPassword)

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: serverName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: version
    administratorLogin: adminLogin
    administratorLoginPassword: passwordIsEmpty ? 'DEPLOYMENT_WILL_FAIL_PASSWORD_REQUIRED' : adminPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    // publicNetworkAccess is read-only; it is 'Enabled' by default and controlled
    // by the presence/absence of firewall rules.
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// Database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2022-12-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// SSL required
resource sslConfig 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2022-12-01' = {
  parent: server
  name: 'require_secure_transport'
  properties: {
    value: 'on'
    source: 'user-override'
  }
}

// Firewall rule: allow Azure services (0.0.0.0 to 0.0.0.0)
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Firewall rule: developer IP (skip when empty)
resource allowDevIp 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = if (!empty(developerIp)) {
  parent: server
  name: 'AllowDeveloperIp'
  properties: {
    startIpAddress: developerIp
    endIpAddress: developerIp
  }
}

// Store the admin password in Key Vault
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource pgPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-admin-password'
  properties: {
    value: adminPassword
  }
}

output serverName string = server.name
output serverFqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
output secretName string = pgPasswordSecret.name
