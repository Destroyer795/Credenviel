// Blob Storage — raw-uploads container for direct browser upload via SAS.
// Event Grid subscription watches this container for blob-created events.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define Storage Account with raw-uploads container
// TODO Phase 1: Configure CORS for browser-to-Blob upload (see DECISIONS.md O-007)
