// Multi-Region Deployment Module for FoodXchange Backend
// This module defines Traffic Manager and multi-region deployment resources

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

@description('Primary Azure region')
param primaryLocation string = 'eastus'

@description('Secondary Azure region')
param secondaryLocation string = 'westus2'

@description('Tertiary Azure region (for prod only)')
param tertiaryLocation string = 'westeurope'

@description('Base name for all resources')
param baseName string = 'foodxchange'

@description('Primary App Service URL')
param primaryAppServiceUrl string

@description('Secondary App Service URL')
param secondaryAppServiceUrl string

@description('Tertiary App Service URL (for prod only)')
param tertiaryAppServiceUrl string = ''

@description('Enable multi-region deployment')
param enableMultiRegion bool = environment == 'prod'

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'traffic-manager'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(subscription().id, environment)
var trafficManagerProfileName = '${baseName}-tm-${environment}-${uniqueSuffix}'
var trafficManagerDnsName = '${baseName}-${environment}-${uniqueSuffix}'

// Traffic Manager Profile
resource trafficManagerProfile 'Microsoft.Network/trafficManagerProfiles@2022-04-01' = if (enableMultiRegion) {
  name: trafficManagerProfileName
  location: 'global'
  tags: tags
  properties: {
    profileStatus: 'Enabled'
    trafficRoutingMethod: 'Performance'
    dnsConfig: {
      relativeName: trafficManagerDnsName
      ttl: 60
    }
    monitorConfig: {
      protocol: 'HTTPS'
      port: 443
      path: '/api/health'
      intervalInSeconds: 30
      timeoutInSeconds: 10
      toleratedNumberOfFailures: 3
      customHeaders: [
        {
          name: 'User-Agent'
          value: 'TrafficManager-HealthCheck'
        }
      ]
    }
    endpoints: []
  }
}

// Primary Region Endpoint
resource primaryEndpoint 'Microsoft.Network/trafficManagerProfiles/endpoints@2022-04-01' = if (enableMultiRegion) {
  parent: trafficManagerProfile
  name: 'primary-${primaryLocation}'
  properties: {
    type: 'Microsoft.Network/trafficManagerProfiles/azureEndpoints'
    targetResourceId: null
    target: replace(primaryAppServiceUrl, 'https://', '')
    endpointStatus: 'Enabled'
    weight: 100
    priority: 1
    endpointLocation: primaryLocation
    customHeaders: [
      {
        name: 'X-Region'
        value: primaryLocation
      }
    ]
  }
}

// Secondary Region Endpoint
resource secondaryEndpoint 'Microsoft.Network/trafficManagerProfiles/endpoints@2022-04-01' = if (enableMultiRegion) {
  parent: trafficManagerProfile
  name: 'secondary-${secondaryLocation}'
  properties: {
    type: 'Microsoft.Network/trafficManagerProfiles/azureEndpoints'
    targetResourceId: null
    target: replace(secondaryAppServiceUrl, 'https://', '')
    endpointStatus: 'Enabled'
    weight: 50
    priority: 2
    endpointLocation: secondaryLocation
    customHeaders: [
      {
        name: 'X-Region'
        value: secondaryLocation
      }
    ]
  }
}

// Tertiary Region Endpoint (for prod only)
resource tertiaryEndpoint 'Microsoft.Network/trafficManagerProfiles/endpoints@2022-04-01' = if (enableMultiRegion && environment == 'prod' && tertiaryAppServiceUrl != '') {
  parent: trafficManagerProfile
  name: 'tertiary-${tertiaryLocation}'
  properties: {
    type: 'Microsoft.Network/trafficManagerProfiles/azureEndpoints'
    targetResourceId: null
    target: replace(tertiaryAppServiceUrl, 'https://', '')
    endpointStatus: 'Enabled'
    weight: 25
    priority: 3
    endpointLocation: tertiaryLocation
    customHeaders: [
      {
        name: 'X-Region'
        value: tertiaryLocation
      }
    ]
  }
}

// Traffic Manager Alerts
resource trafficManagerUnhealthyEndpointAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (enableMultiRegion && environment != 'dev') {
  name: '${trafficManagerProfileName}-unhealthy-endpoints'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Traffic Manager has unhealthy endpoints'
    severity: 1
    enabled: true
    scopes: [
      trafficManagerProfile.id
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'UnhealthyEndpoints'
          metricName: 'EndpointStatus'
          operator: 'LessThan'
          threshold: 1
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

resource trafficManagerHighLatencyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (enableMultiRegion && environment != 'dev') {
  name: '${trafficManagerProfileName}-high-latency'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when Traffic Manager has high query latency'
    severity: 2
    enabled: true
    scopes: [
      trafficManagerProfile.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighLatency'
          metricName: 'QueryLatency'
          operator: 'GreaterThan'
          threshold: 200
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

// Front Door Profile (Alternative to Traffic Manager for advanced features)
resource frontDoorProfile 'Microsoft.Cdn/profiles@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  name: '${baseName}-fd-${environment}-${uniqueSuffix}'
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
  properties: {
    originResponseTimeoutSeconds: 60
  }
}

// Front Door Endpoint
resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorProfile
  name: '${baseName}-endpoint-${environment}'
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// Front Door Origin Group
resource frontDoorOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorProfile
  name: '${baseName}-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
      additionalLatencyInMilliseconds: 50
    }
    healthProbeSettings: {
      probePath: '/api/health'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 30
    }
  }
}

// Front Door Origins
resource frontDoorPrimaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorOriginGroup
  name: 'primary-origin'
  properties: {
    hostName: replace(primaryAppServiceUrl, 'https://', '')
    httpPort: 80
    httpsPort: 443
    originHostHeader: replace(primaryAppServiceUrl, 'https://', '')
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

resource frontDoorSecondaryOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorOriginGroup
  name: 'secondary-origin'
  properties: {
    hostName: replace(secondaryAppServiceUrl, 'https://', '')
    httpPort: 80
    httpsPort: 443
    originHostHeader: replace(secondaryAppServiceUrl, 'https://', '')
    priority: 2
    weight: 500
    enabledState: 'Enabled'
  }
}

// Front Door Route
resource frontDoorRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorEndpoint
  name: 'default-route'
  properties: {
    originGroup: {
      id: frontDoorOriginGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
}

// WAF Policy for Front Door
resource wafPolicy 'Microsoft.Network/frontDoorWebApplicationFirewallPolicies@2022-05-01' = if (enableMultiRegion && environment == 'prod') {
  name: '${baseName}waf${environment}${uniqueSuffix}'
  location: 'global'
  tags: tags
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
      requestBodyCheck: 'Enabled'
      maxRequestBodySizeInKb: 128
    }
    customRules: {
      rules: [
        {
          name: 'RateLimitRule'
          priority: 1
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: 100
          matchConditions: [
            {
              matchVariable: 'RemoteAddr'
              operator: 'IPMatch'
              matchValue: [
                '0.0.0.0/0'
              ]
            }
          ]
          action: 'Block'
        }
      ]
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
          ruleGroupOverrides: []
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.0'
          ruleGroupOverrides: []
        }
      ]
    }
  }
}

// Security Policy for Front Door
resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = if (enableMultiRegion && environment == 'prod') {
  parent: frontDoorProfile
  name: 'security-policy'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: wafPolicy.id
      }
      associations: [
        {
          domains: [
            {
              id: frontDoorEndpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

// Diagnostic Settings for Traffic Manager
resource trafficManagerDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableMultiRegion) {
  name: '${trafficManagerProfileName}-diagnostics'
  scope: trafficManagerProfile
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'ProbeHealthStatusEvents'
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

// Outputs
output trafficManagerProfileName string = enableMultiRegion ? trafficManagerProfile.name : ''
output trafficManagerDnsName string = enableMultiRegion ? trafficManagerProfile.properties.dnsConfig.fqdn : ''
output trafficManagerId string = enableMultiRegion ? trafficManagerProfile.id : ''
output frontDoorProfileName string = (enableMultiRegion && environment == 'prod') ? frontDoorProfile.name : ''
output frontDoorEndpointHostName string = (enableMultiRegion && environment == 'prod') ? frontDoorEndpoint.properties.hostName : ''
output frontDoorId string = (enableMultiRegion && environment == 'prod') ? frontDoorProfile.id : ''
output wafPolicyId string = (enableMultiRegion && environment == 'prod') ? wafPolicy.id : ''