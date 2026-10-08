// Azure SignalR Service — push-based status updates to the frontend.
// Serverless mode.
// Note: the Go API talks to SignalR via REST API (no official Go SDK).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

@description('Common tags for resources')
param tags object = {}

@description('Allowed CORS origins')
param allowedOrigins array = [
  'http://localhost:5173'
  'https://*.azurestaticapps.net'
]

var signalRName = 'sig-cred-${uniqueString(resourceGroup().id)}'
var effectiveTags = union(tags, {
  environment: environment
})

resource signalR 'Microsoft.SignalRService/signalR@2024-03-01' = {
  name: signalRName
  location: location
  tags: effectiveTags
  sku: {
    name: 'Free_F1'
    tier: 'Free'
    capacity: 1
  }
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Serverless'
      }
      {
        flag: 'EnableConnectivityLogs'
        value: 'True'
      }
    ]
    cors: {
      allowedOrigins: allowedOrigins
    }
  }
}

output signalRName string = signalR.name
output signalRHostName string = signalR.properties.hostName
