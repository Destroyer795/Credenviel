// Python Worker Container App — processes job messages from Service Bus.
// KEDA scale rule: 1 replica per 5 pending Service Bus messages.
// Min: 0, Max: 20, Poll: 30s, Cooldown: 5min.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

@description('Container image tag')
param imageTag string = 'latest'

// TODO Phase 1: Define Container App for the Python worker with KEDA scaling
