// Azure Static Web Apps — hosts the React frontend (SPA) on the Free tier with global CDN distribution.
// Serves the Student Portal, Issuer Dashboard, Review Screen, and Public Verification Page.

targetScope = 'resourceGroup'

@description('Azure region (Static Web Apps supported in eastasia, centralus, westeurope, eastus2, etc.)')
param location string = 'eastasia'

@description('Tags applied to every resource')
param tags object

@description('Name of the Static Web App')
param staticWebAppName string = 'stapp-cred-${uniqueString(resourceGroup().id)}'

@description('SKU tier for Static Web App (Free or Standard)')
@allowed([
  'Free'
  'Standard'
])
param sku string = 'Free'

@description('Repository URL for GitHub Actions deployment link (optional)')
param repositoryUrl string = ''

@description('Repository branch (optional)')
param branch string = 'main'

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku
  }
  properties: {
    allowConfigFileUpdates: true
    repositoryUrl: !empty(repositoryUrl) ? repositoryUrl : null
    branch: !empty(repositoryUrl) ? branch : null
    stagingEnvironmentPolicy: 'Enabled'
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output defaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
