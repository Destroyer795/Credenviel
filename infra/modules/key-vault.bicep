// Azure Key Vault — stores connection strings and API keys.
// Referenced by Container Apps and Functions, never hardcoded.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define Key Vault resource
