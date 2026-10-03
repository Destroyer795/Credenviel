// Go API Container App — issues SAS tokens, manages jobs, serves verification endpoints.
// Min replicas: 0 (scale-to-zero). Warmed up before demos.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

@description('Container image tag')
param imageTag string = 'latest'

// TODO Phase 1: Define Container App for the Go API
