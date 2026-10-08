// Azure Container Registry — holds the worker (and later API) images.
// Basic tier, admin user disabled: images are pulled with the managed identity (AcrPull)
// and pushed by a signed-in developer (AcrPush) via `az acr login`.
// Must exist before the first image push, which is why deployment is two-pass (D-012).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Tags applied to every resource')
param tags object

@description('Registry name: alphanumeric only, 5-50 characters, globally unique')
param registryName string = 'crcredenviel${uniqueString(resourceGroup().id)}'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

output registryName string = registry.name
output registryId string = registry.id
output loginServer string = registry.properties.loginServer
