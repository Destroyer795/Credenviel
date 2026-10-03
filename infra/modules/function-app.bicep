// Azure Function App — blob-created Event Grid trigger.
// Validates uploads and enqueues job messages to Service Bus.
// Language: Python (recommended, see DECISIONS.md O-001).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define Function App resource with Event Grid trigger
