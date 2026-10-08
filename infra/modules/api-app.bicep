// Go API Container App — issues SAS tokens, manages jobs, validates Entra ID JWTs,
// and serves public verification endpoints.
// Min replicas: 0 (scales to zero when idle to conserve student credits).

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

@description('Repository name of API image in ACR')
param imageRepository string = 'api'

@description('Storage account name')
param storageAccountName string

@description('Postgres admin password')
@secure()
param postgresPassword string

@description('Postgres fully qualified domain name')
param postgresFqdn string

@description('Database name')
param databaseName string = 'credenviel'

@description('Database user')
param databaseUser string = 'credenvieladmin'

@description('Authentication mode (entra, jwt, dev)')
@allowed([
  'entra'
  'jwt'
  'dev'
])
param authMode string = 'entra'

@description('Microsoft Entra ID Tenant ID')
param entraTenantId string = ''

@description('Microsoft Entra ID Client ID (App ID)')
param entraClientId string = ''

@description('Microsoft Entra ID Audience (defaults to client ID if empty)')
param entraAudience string = ''

@description('Symmetric secret for JWT fallback mode')
@secure()
param jwtSymmetricSecret string = ''

@description('Shared internal API key for worker callbacks')
@secure()
param internalApiKey string

@description('Minimum replicas (0 for scale-to-zero when idle)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 3

var actualAudience = !empty(entraAudience) ? entraAudience : entraClientId

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-api-${uniqueString(resourceGroup().id)}'
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
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        corsPolicy: {
          allowedOrigins: [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'PATCH'
            'DELETE'
            'OPTIONS'
          ]
          allowedHeaders: [
            'Authorization'
            'Content-Type'
            'X-Internal-Key'
            'x-ms-blob-type'
          ]
        }
      }
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
        {
          name: 'internal-api-key'
          value: internalApiKey
        }
        {
          name: 'jwt-symmetric-secret'
          value: jwtSymmetricSecret
        }
      ] : [
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'internal-api-key'
          value: internalApiKey
        }
        {
          name: 'jwt-symmetric-secret'
          value: jwtSymmetricSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registryLoginServer}/${imageRepository}:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'APP_ENV'
              value: 'azure'
            }
            {
              name: 'AUTH_MODE'
              value: authMode
            }
            {
              name: 'ENTRA_TENANT_ID'
              value: entraTenantId
            }
            {
              name: 'ENTRA_CLIENT_ID'
              value: entraClientId
            }
            {
              name: 'ENTRA_AUDIENCE'
              value: actualAudience
            }
            {
              name: 'JWT_SYMMETRIC_SECRET'
              secretRef: 'jwt-symmetric-secret'
            }
            {
              name: 'INTERNAL_API_KEY'
              secretRef: 'internal-api-key'
            }
            {
              name: 'STORE_BACKEND'
              value: 'blob'
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
              name: 'MAX_UPLOAD_BYTES'
              value: '4194304'
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

output apiAppName string = apiApp.name
output apiAppId string = apiApp.id
output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
