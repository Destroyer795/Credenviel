using '../main.bicep'

// The subscription's region policy only allows uaenorth, indonesiacentral, malaysiawest,
// indiasouthcentral and eastasia for resources (see DECISIONS D-037). The resource group
// itself stays in centralindia; resources may live in a different region.
param location = 'eastasia'
param environment = 'dev'
param apiImageTag = 'latest'
param workerImageTag = 'latest'

// Browser origins allowed to upload to Blob Storage. Add the deployed frontend origin later.
param corsAllowedOrigins = [
  'http://localhost:5173'
]

// Your Entra object id, exported in the shell before deploying (never committed):
//   export DEV_PRINCIPAL_ID=<object id>
// Empty skips the developer role grants.
param developerPrincipalId = readEnvironmentVariable('DEV_PRINCIPAL_ID', '')
