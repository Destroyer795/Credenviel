// PostgreSQL Flexible Server — stores users, jobs, records tables.
// Main cost driver: ~$12-15/month if left running continuously.
// Mitigation: stop between work sessions (auto-restarts after 7 days).

targetScope = 'resourceGroup'

@description('Azure region')
param location string

@description('Environment name')
param environment string

// TODO Phase 1: Define PostgreSQL Flexible Server
// TODO Phase 1: Configure authentication (see DECISIONS.md O-004)
