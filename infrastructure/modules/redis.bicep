// Redis Cache Module for FoodXchange Backend
// This module defines Azure Redis Cache resources for improved performance

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

@description('Redis cache SKU')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param redisCacheSku string = environment == 'prod' ? 'Premium' : (environment == 'staging' ? 'Standard' : 'Basic')

@description('Redis cache capacity')
@allowed([
  0  // 250MB Basic/Standard, 6GB Premium
  1  // 1GB Basic/Standard, 13GB Premium
  2  // 2.5GB Basic/Standard, 26GB Premium
  3  // 6GB Basic/Standard, 53GB Premium
  4  // 13GB Basic/Standard, 120GB Premium
  5  // 26GB Basic/Standard, 250GB Premium
  6  // 53GB Basic/Standard, 500GB Premium
])
param redisCacheCapacity int = environment == 'prod' ? 2 : (environment == 'staging' ? 1 : 0)

@description('Enable Redis cluster mode')
param enableClusterMode bool = environment == 'prod'

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'cache'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var redisCacheName = '${baseName}-redis-${environment}-${uniqueSuffix}'

// Redis Cache
resource redisCache 'Microsoft.Cache/Redis@2023-08-01' = {
  name: redisCacheName
  location: location
  tags: tags
  properties: {
    sku: {
      name: redisCacheSku
      family: redisCacheSku == 'Premium' ? 'P' : 'C'
      capacity: redisCacheCapacity
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    redisConfiguration: {
      'maxmemory-reserved': '50'
      'maxfragmentationmemory-reserved': '50'
      'maxmemory-delta': '50'
      'maxmemory-policy': 'allkeys-lru'
      'notify-keyspace-events': 'Ex'
      timeout: '300'
      save: environment == 'prod' ? '900 1' : ''
    }
    redisVersion: '6.0'
    replicasPerMaster: redisCacheSku == 'Premium' && environment == 'prod' ? 1 : 0
    replicasPerPrimary: redisCacheSku == 'Premium' && environment == 'prod' ? 1 : 0
    shardCount: enableClusterMode ? 3 : null
    subnetId: null // Will be updated when VNet integration is implemented
    staticIP: null
    tenantSettings: {}
  }
}

// Redis Firewall Rules for Azure App Service
resource redisFirewallRuleAzureServices 'Microsoft.Cache/Redis/firewallRules@2023-08-01' = {
  parent: redisCache
  name: 'AllowAzureServices'
  properties: {
    startIP: '0.0.0.0'
    endIP: '0.0.0.0'
  }
}

// Additional firewall rule for specific IP ranges (customize as needed)
resource redisFirewallRuleAppService 'Microsoft.Cache/Redis/firewallRules@2023-08-01' = if (environment == 'prod') {
  parent: redisCache
  name: 'AllowAppServiceSubnet'
  properties: {
    startIP: '10.0.0.0'
    endIP: '10.0.255.255'
  }
}

// Redis Patch Schedule (for maintenance)
resource redisPatchSchedule 'Microsoft.Cache/Redis/patchSchedules@2023-08-01' = if (environment == 'prod') {
  parent: redisCache
  name: 'default'
  properties: {
    scheduleEntries: [
      {
        dayOfWeek: 'Sunday'
        startHourUtc: 2
        maintenanceWindow: 'PT4H'
      }
    ]
  }
}

// Redis Insights (monitoring)
resource redisInsights 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${redisCacheName}-diagnostics'
  scope: redisCache
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'ConnectedClientList'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 30 : 7
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 30 : 7
        }
      }
    ]
  }
}

// Log Analytics Workspace (reference)
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' existing = {
  name: '${baseName}-logs-${environment}-${uniqueSuffix}'
}

// Redis Alerts
resource redisHighMemoryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (environment != 'dev') {
  name: '${redisCacheName}-high-memory'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Redis memory usage is high'
    severity: 2
    enabled: true
    scopes: [
      redisCache.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighMemoryUsage'
          metricName: 'usedmemorypercentage'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

resource redisHighCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (environment != 'dev') {
  name: '${redisCacheName}-high-cpu'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Redis CPU usage is high'
    severity: 2
    enabled: true
    scopes: [
      redisCache.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpuUsage'
          metricName: 'percentProcessorTime'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

resource redisHighConnectionsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (environment != 'dev') {
  name: '${redisCacheName}-high-connections'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Redis connection count is high'
    severity: 3
    enabled: true
    scopes: [
      redisCache.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighConnectionCount'
          metricName: 'connectedclients'
          operator: 'GreaterThan'
          threshold: 800
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

// Outputs
output redisCacheName string = redisCache.name
output redisCacheHostName string = redisCache.properties.hostName
output redisCachePort int = redisCache.properties.port
output redisCacheSslPort int = redisCache.properties.sslPort
output redisCacheId string = redisCache.id
output redisCacheResourceId string = redisCache.id
output redisCacheConnectionString string = 'rediss://${redisCache.properties.hostName}:${redisCache.properties.sslPort}'
output redisCachePassword string = redisCache.listKeys().primaryKey