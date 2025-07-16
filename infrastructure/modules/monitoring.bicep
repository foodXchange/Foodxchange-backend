// Comprehensive Monitoring Module for FoodXchange Backend
// This module defines monitoring dashboards, alerts, and observability resources

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

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('App Service name')
param appServiceName string

@description('Cosmos DB account name')
param cosmosDbAccountName string

@description('Redis cache name')
param redisCacheName string

@description('API Management service name')
param apiManagementName string

@description('Log Analytics workspace name')
param logAnalyticsWorkspaceName string

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'monitoring'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var dashboardName = '${baseName}-dashboard-${environment}-${uniqueSuffix}'
var actionGroupName = '${baseName}-alerts-${environment}-${uniqueSuffix}'

// Reference to existing resources
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource appService 'Microsoft.Web/sites@2022-09-01' existing = {
  name: appServiceName
}

resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosDbAccountName
}

resource redisCache 'Microsoft.Cache/Redis@2023-08-01' existing = {
  name: redisCacheName
}

resource apiManagement 'Microsoft.ApiManagement/service@2023-05-01-preview' existing = {
  name: apiManagementName
}

// Action Group for Alerts
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'FoodXAlert'
    enabled: true
    emailReceivers: [
      {
        name: 'DevOps Team'
        emailAddress: 'devops@foodxchange.com'
        useCommonAlertSchema: true
      }
      {
        name: 'Platform Team'
        emailAddress: 'platform@foodxchange.com'
        useCommonAlertSchema: true
      }
    ]
    smsReceivers: []
    webhookReceivers: []
    eventHubReceivers: []
    itsmReceivers: []
    azureAppPushReceivers: []
    automationRunbookReceivers: []
    voiceReceivers: []
    logicAppReceivers: []
    azureFunctionReceivers: []
    armRoleReceivers: [
      {
        name: 'Owner'
        roleId: '8e3af657-a8ff-443c-a75c-2fe8c4bcb635'
        useCommonAlertSchema: true
      }
    ]
  }
}

// Application Insights Workbook
resource performanceWorkbook 'Microsoft.Insights/workbooks@2022-04-01' = {
  name: guid(resourceGroup().id, 'performance-workbook')
  location: location
  tags: tags
  kind: 'shared'
  properties: {
    displayName: 'FoodXchange Performance Dashboard'
    serializedData: '''
{
  "version": "Notebook/1.0",
  "items": [
    {
      "type": 1,
      "content": {
        "json": "# FoodXchange Performance Dashboard\\n\\nThis dashboard provides comprehensive monitoring for the FoodXchange platform."
      }
    },
    {
      "type": 3,
      "content": {
        "version": "KqlItem/1.0",
        "query": "requests\\n| where timestamp > ago(1h)\\n| summarize count() by bin(timestamp, 5m)\\n| render timechart",
        "size": 0,
        "title": "Request Rate (Last Hour)",
        "timeContext": {
          "durationMs": 3600000
        },
        "queryType": 0,
        "resourceType": "microsoft.insights/components"
      }
    },
    {
      "type": 3,
      "content": {
        "version": "KqlItem/1.0",
        "query": "requests\\n| where timestamp > ago(1h)\\n| summarize avg(duration) by bin(timestamp, 5m)\\n| render timechart",
        "size": 0,
        "title": "Average Response Time (Last Hour)",
        "timeContext": {
          "durationMs": 3600000
        },
        "queryType": 0,
        "resourceType": "microsoft.insights/components"
      }
    },
    {
      "type": 3,
      "content": {
        "version": "KqlItem/1.0",
        "query": "requests\\n| where timestamp > ago(1h)\\n| where success == false\\n| summarize count() by bin(timestamp, 5m)\\n| render timechart",
        "size": 0,
        "title": "Error Rate (Last Hour)",
        "timeContext": {
          "durationMs": 3600000
        },
        "queryType": 0,
        "resourceType": "microsoft.insights/components"
      }
    },
    {
      "type": 3,
      "content": {
        "version": "KqlItem/1.0",
        "query": "dependencies\\n| where timestamp > ago(1h)\\n| where type == \\"SQL\\" or type == \\"HTTP\\"\\n| summarize avg(duration) by type, bin(timestamp, 5m)\\n| render timechart",
        "size": 0,
        "title": "Database & HTTP Dependencies (Last Hour)",
        "timeContext": {
          "durationMs": 3600000
        },
        "queryType": 0,
        "resourceType": "microsoft.insights/components"
      }
    }
  ]
}
'''
    sourceId: logAnalyticsWorkspace.id
    category: 'workbook'
  }
}

// Azure Dashboard
resource azureDashboard 'Microsoft.Portal/dashboards@2020-09-01-preview' = {
  name: dashboardName
  location: location
  tags: tags
  properties: {
    lenses: [
      {
        order: 0
        parts: [
          {
            position: {
              x: 0
              y: 0
              rowSpan: 4
              colSpan: 6
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  isOptional: true
                }
                {
                  name: 'ComponentId'
                  value: {
                    Name: appServiceName
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                  }
                  isOptional: true
                }
              ]
              type: 'Extension/HubsExtension/PartType/MonitorChartPart'
              settings: {
                content: {
                  options: {
                    chart: {
                      metrics: [
                        {
                          resourceMetadata: {
                            id: appService.id
                          }
                          name: 'Requests'
                          aggregationType: 1
                          namespace: 'microsoft.web/sites'
                          metricVisualization: {
                            displayName: 'Requests'
                          }
                        }
                      ]
                      title: 'App Service Requests'
                      titleKind: 1
                      visualization: {
                        chartType: 2
                        legendVisualization: {
                          isVisible: true
                          position: 2
                          hideSubtitle: false
                        }
                        axisVisualization: {
                          x: {
                            isVisible: true
                            axisType: 2
                          }
                          y: {
                            isVisible: true
                            axisType: 1
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          {
            position: {
              x: 6
              y: 0
              rowSpan: 4
              colSpan: 6
            }
            metadata: {
              inputs: [
                {
                  name: 'resourceTypeMode'
                  isOptional: true
                }
                {
                  name: 'ComponentId'
                  value: {
                    Name: appServiceName
                    SubscriptionId: subscription().subscriptionId
                    ResourceGroup: resourceGroup().name
                  }
                  isOptional: true
                }
              ]
              type: 'Extension/HubsExtension/PartType/MonitorChartPart'
              settings: {
                content: {
                  options: {
                    chart: {
                      metrics: [
                        {
                          resourceMetadata: {
                            id: appService.id
                          }
                          name: 'AverageResponseTime'
                          aggregationType: 4
                          namespace: 'microsoft.web/sites'
                          metricVisualization: {
                            displayName: 'Average Response Time'
                          }
                        }
                      ]
                      title: 'App Service Response Time'
                      titleKind: 1
                      visualization: {
                        chartType: 2
                        legendVisualization: {
                          isVisible: true
                          position: 2
                          hideSubtitle: false
                        }
                        axisVisualization: {
                          x: {
                            isVisible: true
                            axisType: 2
                          }
                          y: {
                            isVisible: true
                            axisType: 1
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    ]
    metadata: {
      model: {
        timeRange: {
          value: {
            relative: {
              duration: 24
              timeUnit: 1
            }
          }
          type: 'MsPortalFx.Composition.Configuration.ValueTypes.TimeRange'
        }
        filterLocale: {
          value: 'en-us'
        }
        filters: {
          value: {
            MsPortalFx_TimeRange: {
              model: {
                format: 'utc'
                granularity: 'auto'
                relative: '24h'
              }
              displayCache: {
                name: 'UTC Time'
                value: 'Past 24 hours'
              }
              filteredPartIds: []
            }
          }
        }
      }
    }
  }
}

// Comprehensive Alert Rules
resource highCpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${appServiceName}-high-cpu'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when App Service CPU usage is high'
    severity: 2
    enabled: true
    scopes: [
      appService.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpuUsage'
          metricName: 'CpuPercentage'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
        webHookProperties: {}
      }
    ]
  }
}

resource highMemoryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${appServiceName}-high-memory'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when App Service memory usage is high'
    severity: 2
    enabled: true
    scopes: [
      appService.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighMemoryUsage'
          metricName: 'MemoryPercentage'
          operator: 'GreaterThan'
          threshold: 85
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
        webHookProperties: {}
      }
    ]
  }
}

resource highErrorRateAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${appServiceName}-high-error-rate'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when App Service error rate is high'
    severity: 1
    enabled: true
    scopes: [
      appService.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighErrorRate'
          metricName: 'Http5xx'
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
        webHookProperties: {}
      }
    ]
  }
}

resource cosmosDbHighRUAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${cosmosDbAccountName}-high-ru'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Cosmos DB RU consumption is high'
    severity: 2
    enabled: true
    scopes: [
      cosmosDbAccount.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighRUConsumption'
          metricName: 'TotalRequestUnits'
          operator: 'GreaterThan'
          threshold: 1000
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
        webHookProperties: {}
      }
    ]
  }
}

resource cosmosDbHighLatencyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${cosmosDbAccountName}-high-latency'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Cosmos DB latency is high'
    severity: 2
    enabled: true
    scopes: [
      cosmosDbAccount.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighLatency'
          metricName: 'ServerSideLatency'
          operator: 'GreaterThan'
          threshold: 100
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
        webHookProperties: {}
      }
    ]
  }
}

// Log Analytics Queries
resource performanceQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalyticsWorkspace
  name: 'FoodXchange-Performance-Query'
  properties: {
    category: 'FoodXchange'
    displayName: 'Performance Analysis'
    query: '''
requests
| where timestamp > ago(1h)
| summarize 
    RequestCount = count(),
    AvgDuration = avg(duration),
    MaxDuration = max(duration),
    P95Duration = percentile(duration, 95),
    FailureRate = countif(success == false) * 100.0 / count()
    by bin(timestamp, 5m)
| order by timestamp desc
'''
  }
}

resource errorAnalysisQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalyticsWorkspace
  name: 'FoodXchange-Error-Analysis'
  properties: {
    category: 'FoodXchange'
    displayName: 'Error Analysis'
    query: '''
exceptions
| where timestamp > ago(24h)
| summarize 
    ErrorCount = count(),
    UniqueErrors = dcount(problemId)
    by type, outerMessage
| order by ErrorCount desc
'''
  }
}

resource userAnalyticsQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalyticsWorkspace
  name: 'FoodXchange-User-Analytics'
  properties: {
    category: 'FoodXchange'
    displayName: 'User Analytics'
    query: '''
requests
| where timestamp > ago(24h)
| where name contains "api"
| summarize 
    RequestCount = count(),
    UniqueUsers = dcount(user_Id),
    UniqueIPs = dcount(client_IP)
    by bin(timestamp, 1h)
| order by timestamp desc
'''
  }
}

// Custom Metrics
resource customMetricAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: '${baseName}-custom-metrics-${environment}'
  location: location
  tags: tags
  properties: {
    displayName: 'FoodXchange Custom Metrics Alert'
    description: 'Alert on custom application metrics'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    scopes: [
      logAnalyticsWorkspace.id
    ]
    criteria: {
      allOf: [
        {
          query: '''
customEvents
| where timestamp > ago(5m)
| where name == "HighOrderVolume"
| summarize count() by bin(timestamp, 1m)
'''
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 50
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

// Availability Tests
resource availabilityTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: '${baseName}-availability-test-${environment}'
  location: location
  tags: union(tags, {
    'hidden-link:${appService.id}': 'Resource'
  })
  kind: 'ping'
  properties: {
    SyntheticMonitorId: '${baseName}-availability-test-${environment}'
    Name: 'FoodXchange Health Check'
    Description: 'Health check for FoodXchange API'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'ping'
    Locations: [
      {
        Id: 'us-ca-sjc-azr'
      }
      {
        Id: 'us-tx-sn1-azr'
      }
      {
        Id: 'us-il-ch1-azr'
      }
    ]
    Configuration: {
      WebTest: '<WebTest Name="FoodXchange Health Check" Enabled="True" CssProjectStructure="" CssIteration="" Timeout="30" WorkItemIds="" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010" Description="" CredentialUserName="" CredentialPassword="" PreAuthenticate="True" Proxy="default" StopOnError="False" RecordedResultFile="" ResultsLocale=""><Items><Request Method="GET" Version="1.1" Url="https://${appService.properties.defaultHostName}/api/health" ThinkTime="0" Timeout="30" ParseDependentRequests="False" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" ExpectedResponseUrl="" ReportingName="" IgnoreHttpStatusCode="False" /></Items></WebTest>'
    }
  }
}

// Outputs
output dashboardName string = azureDashboard.name
output dashboardId string = azureDashboard.id
output actionGroupName string = actionGroup.name
output actionGroupId string = actionGroup.id
output workbookName string = performanceWorkbook.name
output workbookId string = performanceWorkbook.id
output availabilityTestName string = availabilityTest.name
output availabilityTestId string = availabilityTest.id