// Azure SignalR Service — push-based status updates to the frontend.
// Serverless mode. One group per user ID.
// Note: the Go API talks to SignalR via REST API (no official Go SDK).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 5: Define SignalR Service resource
