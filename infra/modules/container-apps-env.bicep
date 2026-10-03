// Container Apps Environment — shared environment for the Go API and Python worker.
// KEDA scaling rules are configured per-app, not here.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define Container Apps Environment resource
