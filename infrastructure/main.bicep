// FoodXchange Main Infrastructure Deployment
// This is the main entry point for deploying the FoodXchange backend infrastructure

targetScope = 'subscription'

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string = 'dev'

@description('Azure region for all resources')
param location string = 'eastus'

@description('Base name for all resources')
param baseName string = 'foodxchange'

// Variables
var uniqueSuffix = uniqueString(subscription().id, environment)

// Resource Group
resource resourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: '${baseName}-${environment}-rg'
  location: location
  tags: {
    environment: environment
    project: 'FoodXchange'
    managedBy: 'bicep'
  }
}

// Deploy Redis Cache Module
module redisCache 'modules/redis.bicep' = {
  name: 'redis-cache-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
  }
}

// Deploy Backend Module
module backendInfrastructure 'modules/backend.bicep' = {
  name: 'backend-infrastructure-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
    redisCacheHostName: redisCache.outputs.redisCacheHostName
    redisCachePort: redisCache.outputs.redisCacheSslPort
    redisCachePassword: redisCache.outputs.redisCachePassword
  }
}

// Deploy API Management Module
module apiManagement 'modules/apimanagement.bicep' = {
  name: 'api-management-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
    backendApiUrl: backendInfrastructure.outputs.appServiceUrl
  }
}

// Deploy Cosmos DB Optimization Module
module cosmosDbOptimization 'modules/cosmosdb-optimization.bicep' = {
  name: 'cosmosdb-optimization-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    cosmosDbAccountName: backendInfrastructure.outputs.cosmosDbAccountName
  }
}

// Deploy Comprehensive Monitoring Module
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
    appInsightsConnectionString: backendInfrastructure.outputs.appInsightsConnectionString
    appServiceName: backendInfrastructure.outputs.appServiceName
    cosmosDbAccountName: backendInfrastructure.outputs.cosmosDbAccountName
    redisCacheName: redisCache.outputs.redisCacheName
    apiManagementName: apiManagement.outputs.apiManagementName
    logAnalyticsWorkspaceName: '${baseName}-logs-${environment}-${uniqueSuffix}'
  }
}

// Deploy Customer-Managed Encryption Module
module encryption 'modules/encryption.bicep' = {
  name: 'encryption-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
    keyVaultName: backendInfrastructure.outputs.keyVaultName
    storageAccountName: backendInfrastructure.outputs.storageAccountName
  }
}

// Deploy Multi-Region Module (production only)
module multiRegion 'modules/multiregion.bicep' = if (environment == 'prod') {
  name: 'multiregion-${environment}'
  scope: resourceGroup
  params: {
    environment: environment
    primaryLocation: location
    secondaryLocation: 'westus2'
    tertiaryLocation: 'westeurope'
    baseName: baseName
    primaryAppServiceUrl: backendInfrastructure.outputs.appServiceUrl
    secondaryAppServiceUrl: backendInfrastructure.outputs.appServiceUrl // TODO: Replace with actual secondary URL
    tertiaryAppServiceUrl: backendInfrastructure.outputs.appServiceUrl // TODO: Replace with actual tertiary URL
  }
  dependsOn: [
    backendInfrastructure
    apiManagement
  ]
}

// Outputs
output resourceGroupName string = resourceGroup.name
output appServiceUrl string = backendInfrastructure.outputs.appServiceUrl
output appServiceName string = backendInfrastructure.outputs.appServiceName
output keyVaultUri string = backendInfrastructure.outputs.keyVaultUri
output keyVaultName string = backendInfrastructure.outputs.keyVaultName
output cosmosDbEndpoint string = backendInfrastructure.outputs.cosmosDbEndpoint
output appInsightsConnectionString string = backendInfrastructure.outputs.appInsightsConnectionString
output redisCacheName string = redisCache.outputs.redisCacheName
output redisCacheHostName string = redisCache.outputs.redisCacheHostName
output redisCacheConnectionString string = redisCache.outputs.redisCacheConnectionString
output apiManagementName string = apiManagement.outputs.apiManagementName
output apiManagementGatewayUrl string = apiManagement.outputs.gatewayUrl
output apiManagementPortalUrl string = apiManagement.outputs.portalUrl
output apiManagementDeveloperPortalUrl string = apiManagement.outputs.developerPortalUrl
output monitoringDashboardName string = monitoring.outputs.dashboardName
output monitoringActionGroupName string = monitoring.outputs.actionGroupName
output monitoringWorkbookName string = monitoring.outputs.workbookName
output encryptionKeyName string = encryption.outputs.encryptionKeyName
output encryptionKeyId string = encryption.outputs.encryptionKeyId
output userAssignedIdentityName string = encryption.outputs.userAssignedIdentityName