// Azure Container Registry — holds worker and API images.
// Must be provisioned before the first CI/CD push since the image push target must already exist.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define ACR resource
