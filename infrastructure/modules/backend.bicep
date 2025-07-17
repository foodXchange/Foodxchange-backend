// FoodXchange Backend Infrastructure Module
// This module defines all backend-related Azure resources

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Base name for all resources')
param baseName string = 'foodxchange'

@description('App Service pricing tier')
@allowed([
  'F1'    // Free tier for dev
  'B1'    // Basic tier for staging
  'P1v3'  // Premium tier for production
])
param appServicePlanSku string = environment == 'prod' ? 'P1v3' : (environment == 'staging' ? 'B1' : 'F1')

@description('Minimum number of instances for auto-scaling')
param minInstances int = environment == 'prod' ? 2 : 1

@description('Maximum number of instances for auto-scaling')
param maxInstances int = environment == 'prod' ? 10 : 3

@description('Redis Cache hostname')
param redisCacheHostName string = ''

@description('Redis Cache port')
param redisCachePort int = 6380

@description('Redis Cache password')
@secure()
param redisCachePassword string = ''

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'backend'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var appServicePlanName = '${baseName}-asp-${environment}-${uniqueSuffix}'
var appServiceName = '${baseName}-api-${environment}-${uniqueSuffix}'
var appInsightsName = '${baseName}-appinsights-${environment}-${uniqueSuffix}'
var keyVaultName = '${baseName}-kv-${environment}-${uniqueSuffix}'
var cosmosDbAccountName = '${baseName}-cosmos-${environment}-${uniqueSuffix}'
var storageAccountName = replace('${baseName}st${environment}${uniqueSuffix}', '-', '')

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' = {
  name: '${baseName}-logs-${environment}-${uniqueSuffix}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: environment == 'prod' ? 90 : 30
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: environment == 'prod' ? 90 : 30
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enabledForDeployment: true
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: environment == 'prod' ? 90 : 7
    enableRbacAuthorization: true
    enablePurgeProtection: environment == 'prod' ? true : false
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: appServicePlanSku
    capacity: minInstances
  }
  kind: 'linux'
  properties: {
    reserved: true // Linux plan
  }
}

// App Service
resource appService 'Microsoft.Web/sites@2022-09-01' = {
  name: appServiceName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: appServicePlanSku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      webSocketsEnabled: true
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'NODE_ENV'
          value: environment
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~18'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'MONGODB_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/MONGODB-CONNECTION-STRING/)'
        }
        {
          name: 'STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/STORAGE-CONNECTION-STRING/)'
        }
        {
          name: 'WEBHOOK_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/WEBHOOK-SECRET/)'
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'COSMOS_DB_ENDPOINT'
          value: cosmosDb.properties.documentEndpoint
        }
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storageAccount.name
        }
        {
          name: 'REDIS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/REDIS-CONNECTION-STRING/)'
        }
        {
          name: 'REDIS_HOST'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/REDIS-HOST/)'
        }
        {
          name: 'REDIS_PORT'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/REDIS-PORT/)'
        }
        {
          name: 'REDIS_PASSWORD'
          value: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/REDIS-PASSWORD/)'
        }
      ]
      cors: {
        allowedOrigins: [
          'https://${baseName}-${environment}.azurewebsites.net'
          'http://localhost:3000'
          'http://localhost:5173'
        ]
        supportCredentials: true
      }
      healthCheckPath: '/api/health'
      nodeVersion: '18-lts'
    }
  }
}

// Auto-scale settings
resource autoScaleSettings 'Microsoft.Insights/autoscalesettings@2022-10-01' = {
  name: '${appServiceName}-autoscale'
  location: location
  tags: tags
  properties: {
    enabled: true
    targetResourceUri: appServicePlan.id
    profiles: [
      {
        name: 'defaultProfile'
        capacity: {
          minimum: string(minInstances)
          maximum: string(maxInstances)
          default: string(minInstances)
        }
        rules: [
          // Scale out when CPU > 70%
          {
            metricTrigger: {
              metricName: 'CpuPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 70
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
          // Scale out when request queue length > 50
          {
            metricTrigger: {
              metricName: 'HttpQueueLength'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 50
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '2'
              cooldown: 'PT3M'
            }
          }
          // Scale out when response time > 2000ms
          {
            metricTrigger: {
              metricName: 'AverageResponseTime'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 2000
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
          // Scale in when CPU < 30%
          {
            metricTrigger: {
              metricName: 'CpuPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'LessThan'
              threshold: 30
            }
            scaleAction: {
              direction: 'Decrease'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
          // Scale out when Memory > 80%
          {
            metricTrigger: {
              metricName: 'MemoryPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 80
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
        ]
      }
      // Business hours profile (6 AM to 8 PM)
      {
        name: 'businessHoursProfile'
        capacity: {
          minimum: string(environment == 'prod' ? 3 : 2)
          maximum: string(maxInstances)
          default: string(environment == 'prod' ? 3 : 2)
        }
        rules: [
          // Same CPU and Memory rules as default profile
          {
            metricTrigger: {
              metricName: 'CpuPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 70
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
          {
            metricTrigger: {
              metricName: 'CpuPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'LessThan'
              threshold: 30
            }
            scaleAction: {
              direction: 'Decrease'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
        ]
        recurrence: {
          frequency: 'Week'
          schedule: {
            timeZone: 'UTC'
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
            minutes: [0]
          }
        }
      }
      // Harvest season profile (higher capacity)
      {
        name: 'harvestSeasonProfile'
        capacity: {
          minimum: string(environment == 'prod' ? 5 : 3)
          maximum: string(environment == 'prod' ? 15 : 5)
          default: string(environment == 'prod' ? 5 : 3)
        }
        rules: [
          {
            metricTrigger: {
              metricName: 'CpuPercentage'
              metricResourceUri: appServicePlan.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 60 // Lower threshold during harvest season
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '2' // Scale faster
              cooldown: 'PT3M'
            }
          }
        ]
        recurrence: {
          frequency: 'Week'
          schedule: {
            timeZone: 'UTC'
            // Harvest season: September-November (weekly pattern)
            days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            hours: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
            minutes: [0]
          }
        }
      }
    ]
  }
}

// Cosmos DB Account with MongoDB API
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: cosmosDbAccountName
  location: location
  tags: tags
  kind: 'MongoDB'
  properties: {
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
      maxStalenessPrefix: 100
      maxIntervalInSeconds: 5
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: environment == 'prod'
      }
    ]
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: environment == 'prod'
    capabilities: [
      {
        name: 'EnableServerless'
      }
      {
        name: 'EnableMongo'
      }
    ]
    apiProperties: {
      serverVersion: '4.2'
    }
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: environment == 'prod' ? 'Continuous30Days' : 'Continuous7Days'
      }
    }
  }
}

// Cosmos DB Database
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases@2023-11-15' = {
  parent: cosmosDb
  name: 'foodxchange'
  properties: {
    resource: {
      id: 'foodxchange'
    }
  }
}

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'Standard_GRS' : 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Storage Containers
resource productImagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/product-images'
  properties: {
    publicAccess: 'None'
  }
}

resource certificationsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/certifications'
  properties: {
    publicAccess: 'None'
  }
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/documents'
  properties: {
    publicAccess: 'None'
  }
}

// Role Assignments

// Key Vault Secrets User role for App Service
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appService.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Blob Data Contributor role for App Service
resource storageBlobDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, appService.id, 'Storage Blob Data Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Secrets in Key Vault

// Cosmos DB Connection String
resource cosmosDbConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'MONGODB-CONNECTION-STRING'
  properties: {
    value: listConnectionStrings(cosmosDb.id, cosmosDb.apiVersion).connectionStrings[0].connectionString
  }
}

// Storage Account Connection String
resource storageConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'STORAGE-CONNECTION-STRING'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${az.environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
  }
}

// Application Insights Key
resource appInsightsKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'APPLICATIONINSIGHTS-CONNECTION-STRING'
  properties: {
    value: appInsights.properties.ConnectionString
  }
}

// Webhook Secret for RFQ Integration
resource webhookSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'WEBHOOK-SECRET'
  properties: {
    value: base64(uniqueString(resourceGroup().id, 'webhook-secret', environment))
  }
}

// Redis Cache Connection String
resource redisConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = if (redisCacheHostName != '') {
  parent: keyVault
  name: 'REDIS-CONNECTION-STRING'
  properties: {
    value: 'rediss://${redisCacheHostName}:${redisCachePort}'
  }
}

// Redis Cache Host
resource redisHostSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = if (redisCacheHostName != '') {
  parent: keyVault
  name: 'REDIS-HOST'
  properties: {
    value: redisCacheHostName
  }
}

// Redis Cache Port
resource redisPortSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = if (redisCacheHostName != '') {
  parent: keyVault
  name: 'REDIS-PORT'
  properties: {
    value: string(redisCachePort)
  }
}

// Redis Cache Password
resource redisPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = if (redisCachePassword != '') {
  parent: keyVault
  name: 'REDIS-PASSWORD'
  properties: {
    value: redisCachePassword
  }
}

// Outputs
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'
output appServiceName string = appService.name
output appServicePlanId string = appServicePlan.id
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
output cosmosDbEndpoint string = cosmosDb.properties.documentEndpoint
output cosmosDbAccountName string = cosmosDb.name
output storageAccountName string = storageAccount.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey