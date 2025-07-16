// API Management Module for FoodXchange Backend
// This module defines Azure API Management resources for API governance and rate limiting

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

@description('API Management SKU')
@allowed([
  'Consumption'
  'Developer'
  'Basic'
  'Standard'
  'Premium'
])
param apiManagementSku string = environment == 'prod' ? 'Standard' : (environment == 'staging' ? 'Developer' : 'Consumption')

@description('API Management capacity')
param apiManagementCapacity int = environment == 'prod' ? 2 : 1

@description('Backend API URL')
param backendApiUrl string

@description('Publisher email for API Management')
param publisherEmail string = 'admin@foodxchange.com'

@description('Publisher name for API Management')
param publisherName string = 'FoodXchange Admin'

// Parameter validation
var isValidEmail = length(publisherEmail) > 0 && contains(publisherEmail, '@') && contains(publisherEmail, '.')
var isValidBackendUrl = startsWith(backendApiUrl, 'https://') || startsWith(backendApiUrl, 'http://')

// Validation assertions
resource emailValidation 'Microsoft.Resources/deploymentScripts@2020-10-01' = if (!isValidEmail) {
  name: 'email-validation-error'
  location: location
  kind: 'AzurePowerShell'
  properties: {
    azPowerShellVersion: '8.0'
    scriptContent: 'throw "Invalid email format for publisherEmail parameter"'
    retentionInterval: 'PT1H'
  }
}

resource urlValidation 'Microsoft.Resources/deploymentScripts@2020-10-01' = if (!isValidBackendUrl) {
  name: 'url-validation-error'
  location: location
  kind: 'AzurePowerShell'
  properties: {
    azPowerShellVersion: '8.0'
    scriptContent: 'throw "Invalid URL format for backendApiUrl parameter"'
    retentionInterval: 'PT1H'
  }
}

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'api-management'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var apiManagementName = '${baseName}-apim-${environment}-${uniqueSuffix}'
var apiName = 'foodxchange-api'
var apiVersion = 'v1'

// API Management Service
resource apiManagement 'Microsoft.ApiManagement/service@2023-05-01-preview' = {
  name: apiManagementName
  location: location
  tags: tags
  sku: {
    name: apiManagementSku
    capacity: apiManagementCapacity
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    notificationSenderEmail: publisherEmail
    hostnameConfigurations: [
      {
        type: 'Proxy'
        hostName: '${apiManagementName}.azure-api.net'
        negotiateClientCertificate: false
        defaultSslBinding: true
        certificateSource: 'BuiltIn'
      }
    ]
    customProperties: {
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Protocols.Ssl30': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Ciphers.TripleDes168': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls10': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Tls11': 'False'
      'Microsoft.WindowsAzure.ApiManagement.Gateway.Security.Backend.Protocols.Ssl30': 'False'
    }
    apiVersionConstraint: {
      minApiVersion: '2019-12-01'
    }
  }
}

// Backend Configuration
resource backend 'Microsoft.ApiManagement/service/backends@2023-05-01-preview' = {
  parent: apiManagement
  name: 'foodxchange-backend'
  properties: {
    description: 'FoodXchange Backend API'
    url: backendApiUrl
    protocol: 'http'
    tls: {
      validateCertificateChain: true
      validateCertificateName: true
    }
    properties: {
      serviceFabricCluster: null
    }
  }
}

// API Definition
resource api 'Microsoft.ApiManagement/service/apis@2023-05-01-preview' = {
  parent: apiManagement
  name: apiName
  properties: {
    displayName: 'FoodXchange API'
    description: 'FoodXchange Backend API for marketplace operations'
    serviceUrl: backendApiUrl
    path: 'api'
    protocols: [
      'https'
    ]
    subscriptionRequired: true
    apiVersion: apiVersion
    apiVersionSetId: apiVersionSet.id
    format: 'openapi'
    value: '''
{
  "openapi": "3.0.0",
  "info": {
    "title": "FoodXchange API",
    "version": "1.0.0",
    "description": "FoodXchange Backend API for marketplace operations"
  },
  "paths": {
    "/health": {
      "get": {
        "summary": "Health Check",
        "responses": {
          "200": {
            "description": "Service is healthy"
          }
        }
      }
    },
    "/api/users": {
      "get": {
        "summary": "Get Users",
        "responses": {
          "200": {
            "description": "List of users"
          }
        }
      }
    },
    "/api/products": {
      "get": {
        "summary": "Get Products",
        "responses": {
          "200": {
            "description": "List of products"
          }
        }
      }
    },
    "/api/orders": {
      "get": {
        "summary": "Get Orders",
        "responses": {
          "200": {
            "description": "List of orders"
          }
        }
      }
    }
  }
}
'''
  }
}

// API Version Set
resource apiVersionSet 'Microsoft.ApiManagement/service/apiVersionSets@2023-05-01-preview' = {
  parent: apiManagement
  name: '${apiName}-versions'
  properties: {
    displayName: 'FoodXchange API Versions'
    versioningScheme: 'Path'
    versionHeaderName: 'Api-Version'
    versionQueryName: 'version'
  }
}

// Rate Limiting Policy
resource globalPolicy 'Microsoft.ApiManagement/service/policies@2023-05-01-preview' = {
  parent: apiManagement
  name: 'policy'
  properties: {
    value: '''
<policies>
  <inbound>
    <base />
    <rate-limit calls="100" renewal-period="60" />
    <quota calls="10000" renewal-period="86400" />
    <cors>
      <allowed-origins>
        <origin>https://foodxchange.com</origin>
        <origin>https://app.foodxchange.com</origin>
        <origin>http://localhost:3000</origin>
        <origin>http://localhost:5173</origin>
      </allowed-origins>
      <allowed-methods>
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>DELETE</method>
        <method>PATCH</method>
        <method>OPTIONS</method>
      </allowed-methods>
      <allowed-headers>
        <header>*</header>
      </allowed-headers>
      <expose-headers>
        <header>*</header>
      </expose-headers>
      <max-age>86400</max-age>
      <preflight-result-max-age>300</preflight-result-max-age>
    </cors>
    <set-backend-service backend-id="foodxchange-backend" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <set-header name="X-Powered-By" exists-action="delete" />
    <set-header name="Server" exists-action="delete" />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

// API-specific Rate Limiting Policy
resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-05-01-preview' = {
  parent: api
  name: 'policy'
  properties: {
    value: '''
<policies>
  <inbound>
    <base />
    <rate-limit-by-key calls="50" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
    <quota-by-key calls="5000" renewal-period="86400" counter-key="@(context.Subscription.Id)" />
    <check-header name="Content-Type" failed-check-httpcode="400" failed-check-error-message="Content-Type header is missing or invalid" ignore-case="true">
      <value>application/json</value>
    </check-header>
    <validate-jwt header-name="Authorization" failed-validation-httpcode="401" failed-validation-error-message="Unauthorized" require-expiration-time="true" require-scheme="Bearer" require-signed-tokens="true">
      <issuer-signing-keys>
        <key>{{jwt-signing-key}}</key>
      </issuer-signing-keys>
      <audiences>
        <audience>api://foodxchange</audience>
      </audiences>
      <issuers>
        <issuer>https://login.microsoftonline.com/{{tenant-id}}/v2.0</issuer>
      </issuers>
    </validate-jwt>
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <set-header name="X-Rate-Limit-Remaining" exists-action="override">
      <value>@(context.Response.Headers.GetValueOrDefault("X-Rate-Limit-Remaining","0"))</value>
    </set-header>
    <set-header name="X-Rate-Limit-Limit" exists-action="override">
      <value>@(context.Response.Headers.GetValueOrDefault("X-Rate-Limit-Limit","0"))</value>
    </set-header>
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

// Products for different tiers
resource freeProduct 'Microsoft.ApiManagement/service/products@2023-05-01-preview' = {
  parent: apiManagement
  name: 'free-tier'
  properties: {
    displayName: 'Free Tier'
    description: 'Free tier with basic rate limiting'
    subscriptionRequired: true
    approvalRequired: false
    state: 'published'
    terms: 'Free tier usage terms and conditions'
  }
}

resource basicProduct 'Microsoft.ApiManagement/service/products@2023-05-01-preview' = {
  parent: apiManagement
  name: 'basic-tier'
  properties: {
    displayName: 'Basic Tier'
    description: 'Basic tier with enhanced rate limits'
    subscriptionRequired: true
    approvalRequired: false
    state: 'published'
    terms: 'Basic tier usage terms and conditions'
  }
}

resource premiumProduct 'Microsoft.ApiManagement/service/products@2023-05-01-preview' = {
  parent: apiManagement
  name: 'premium-tier'
  properties: {
    displayName: 'Premium Tier'
    description: 'Premium tier with high rate limits'
    subscriptionRequired: true
    approvalRequired: true
    state: 'published'
    terms: 'Premium tier usage terms and conditions'
  }
}

// Product Policies
resource freeProductPolicy 'Microsoft.ApiManagement/service/products/policies@2023-05-01-preview' = {
  parent: freeProduct
  name: 'policy'
  properties: {
    value: '''
<policies>
  <inbound>
    <base />
    <rate-limit calls="10" renewal-period="60" />
    <quota calls="1000" renewal-period="86400" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

resource basicProductPolicy 'Microsoft.ApiManagement/service/products/policies@2023-05-01-preview' = {
  parent: basicProduct
  name: 'policy'
  properties: {
    value: '''
<policies>
  <inbound>
    <base />
    <rate-limit calls="50" renewal-period="60" />
    <quota calls="10000" renewal-period="86400" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

resource premiumProductPolicy 'Microsoft.ApiManagement/service/products/policies@2023-05-01-preview' = {
  parent: premiumProduct
  name: 'policy'
  properties: {
    value: '''
<policies>
  <inbound>
    <base />
    <rate-limit calls="200" renewal-period="60" />
    <quota calls="100000" renewal-period="86400" />
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
'''
  }
}

// Link API to Products
resource freeProductApi 'Microsoft.ApiManagement/service/products/apis@2023-05-01-preview' = {
  parent: freeProduct
  name: apiName
  dependsOn: [
    api
  ]
}

resource basicProductApi 'Microsoft.ApiManagement/service/products/apis@2023-05-01-preview' = {
  parent: basicProduct
  name: apiName
  dependsOn: [
    api
  ]
}

resource premiumProductApi 'Microsoft.ApiManagement/service/products/apis@2023-05-01-preview' = {
  parent: premiumProduct
  name: apiName
  dependsOn: [
    api
  ]
}

// Diagnostic Settings
resource diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${apiManagementName}-diagnostics'
  scope: apiManagement
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'GatewayLogs'
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

// Alerts
resource highLatencyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (environment != 'dev') {
  name: '${apiManagementName}-high-latency'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when API Management has high latency'
    severity: 2
    enabled: true
    scopes: [
      apiManagement.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighLatency'
          metricName: 'Duration'
          operator: 'GreaterThan'
          threshold: 5000
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

resource highErrorRateAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (environment != 'dev') {
  name: '${apiManagementName}-high-error-rate'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when API Management has high error rate'
    severity: 1
    enabled: true
    scopes: [
      apiManagement.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighErrorRate'
          metricName: 'Requests'
          operator: 'GreaterThan'
          threshold: 10
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
          dimensions: [
            {
              name: 'BackendResponseCode'
              operator: 'Include'
              values: ['5XX']
            }
          ]
        }
      ]
    }
    actions: []
  }
}

// Outputs
output apiManagementName string = apiManagement.name
output apiManagementId string = apiManagement.id
output gatewayUrl string = apiManagement.properties.gatewayUrl
output managementApiUrl string = apiManagement.properties.managementApiUrl
output portalUrl string = apiManagement.properties.portalUrl
output developerPortalUrl string = apiManagement.properties.developerPortalUrl
output apiName string = api.name
output apiId string = api.id