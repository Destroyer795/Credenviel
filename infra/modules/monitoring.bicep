// Monitoring — Application Insights + Azure Monitor.
// Tracks: Function execution time, Service Bus ActiveMessages,
// Container Apps replica count, per-job processing latency.
// Alert: fires on any message landing in the dead-letter queue.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 5: Define Application Insights and Monitor alert rules
