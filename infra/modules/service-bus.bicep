// Service Bus — buffers job messages between the Function trigger and workers.
// Basic tier, job-processing queue with dead-letter sub-queue.
// KEDA scale rule: 1 replica per 5 pending messages, 30s poll, 5min cooldown.

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define Service Bus namespace and queue
