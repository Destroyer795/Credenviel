// Go API Container App — issues SAS tokens, manages jobs, verifies Firebase ID tokens,
// and serves public verification endpoints.
// Min replicas: 0 (scales to zero when idle to conserve student credits).

targetScope = 'resourceGroup'

@description('Azure region')
param location string = 'eastasia'

@description('Tags applied to every resource')
param tags object = {
  project: 'credenviel'
  env: 'dev'
}

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

@description('Authentication mode (firebase, dev)')
@allowed([
  'firebase'
  'dev'
])
param authMode string = 'firebase'

@description('Firebase project ID; ID tokens must be issued for this project')
param firebaseProjectId string = ''

@description('Comma-separated verified emails granted the issuer role (others are students unless a role custom claim is set)')
param firebaseIssuerEmails string = ''

@description('Allow fixed demo accounts without Firebase')
param demoAuthEnabled bool = false

@description('Shared internal API key for worker callbacks')
@secure()
param internalApiKey string

@description('Minimum replicas (0 for scale-to-zero when idle)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 3

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
            'https://mango-ground-04b33f300.4.azurestaticapps.net'
            'http://localhost:5173'
            'http://127.0.0.1:5173'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'DELETE'
            'OPTIONS'
            'HEAD'
          ]
          allowedHeaders: [
            'Authorization'
            'Content-Type'
            'Accept'
            'X-Demo-Account'
            'X-Dev-User'
            'X-Dev-Role'
            'X-Dev-Name'
            'X-User-Role'
            'X-User-ID'
            'X-User-Name'
            'X-Internal-Key'
            'X-Internal-Secret'
            'x-ms-blob-type'
          ]
          allowCredentials: true
          maxAge: 86400
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
      ] : [
        {
          name: 'postgres-password'
          value: postgresPassword
        }
        {
          name: 'internal-api-key'
          value: internalApiKey
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
              name: 'FIREBASE_PROJECT_ID'
              value: firebaseProjectId
            }
            {
              name: 'FIREBASE_ISSUER_EMAILS'
              value: firebaseIssuerEmails
            }
            {
              name: 'DEMO_AUTH_ENABLED'
              value: demoAuthEnabled ? 'true' : 'false'
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
