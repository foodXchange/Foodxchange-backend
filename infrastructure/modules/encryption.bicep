// Customer-Managed Encryption Module for FoodXchange Backend
// This module implements customer-managed encryption keys for enhanced security

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

@description('Key Vault name')
param keyVaultName string

@description('Enable customer-managed encryption')
param enableCustomerManagedEncryption bool = environment == 'prod'

@description('Storage account name')
param storageAccountName string

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'encryption'
  managedBy: 'bicep'
}

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id, environment)
var keyName = '${baseName}-encryption-key-${environment}'
var userAssignedIdentityName = '${baseName}-identity-${environment}-${uniqueSuffix}'

// Reference to existing Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

// Reference to existing storage account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// User-Assigned Managed Identity for encryption
resource userAssignedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (enableCustomerManagedEncryption) {
  name: userAssignedIdentityName
  location: location
  tags: tags
}

// Key Vault Access Policy for User-Assigned Identity
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = if (enableCustomerManagedEncryption) {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: userAssignedIdentity.properties.principalId
        permissions: {
          keys: [
            'get'
            'list'
            'create'
            'import'
            'update'
            'encrypt'
            'decrypt'
            'backup'
            'restore'
            'recover'
            'purge'
          ]
          secrets: []
          certificates: []
        }
      }
    ]
  }
}

// Customer-Managed Encryption Key
resource encryptionKey 'Microsoft.KeyVault/vaults/keys@2023-02-01' = if (enableCustomerManagedEncryption) {
  parent: keyVault
  name: keyName
  properties: {
    kty: 'RSA'
    keySize: 2048
    keyOps: [
      'encrypt'
      'decrypt'
      'sign'
      'verify'
      'wrapKey'
      'unwrapKey'
    ]
    attributes: {
      enabled: true
      exportable: false
    }
  }
  dependsOn: [
    keyVaultAccessPolicy
  ]
}

// Storage Account Encryption with Customer-Managed Key
resource storageEncryption 'Microsoft.Storage/storageAccounts/encryptionScopes@2023-01-01' = if (enableCustomerManagedEncryption) {
  parent: storageAccount
  name: 'customerManagedEncryption'
  properties: {
    source: 'Microsoft.KeyVault'
    state: 'Enabled'
    keyVaultProperties: {
      keyUri: encryptionKey.properties.keyUri
    }
    requireInfrastructureEncryption: true
  }
}

// Role Assignment for User-Assigned Identity on Storage Account
resource storageAccountKeyOperatorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCustomerManagedEncryption) {
  name: guid(storageAccount.id, userAssignedIdentity.id, 'Storage Account Key Operator Service Role')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '81a9662b-bebf-436f-a333-f67b29880f12')
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Storage Account Contributor Role for User-Assigned Identity
resource storageAccountContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableCustomerManagedEncryption) {
  name: guid(storageAccount.id, userAssignedIdentity.id, 'Storage Account Contributor')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '17d1049b-9a84-46fb-8f53-869881c3d3ab')
    principalId: userAssignedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Disk Encryption Set for Virtual Machines (if needed)
resource diskEncryptionSet 'Microsoft.Compute/diskEncryptionSets@2023-01-02' = if (enableCustomerManagedEncryption) {
  name: '${baseName}-disk-encryption-${environment}'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${userAssignedIdentity.id}': {}
    }
  }
  properties: {
    activeKey: {
      sourceVault: {
        id: keyVault.id
      }
      keyUrl: encryptionKey.properties.keyUri
    }
    encryptionType: 'EncryptionAtRestWithCustomerKey'
    rotationToLatestKeyVersionEnabled: true
  }
}

// Key Rotation Policy
resource keyRotationPolicy 'Microsoft.KeyVault/vaults/keys/rotationPolicies@2023-02-01' = if (enableCustomerManagedEncryption) {
  parent: encryptionKey
  name: 'default'
  properties: {
    attributes: {
      expiryTime: 'P2Y'
    }
    lifetimeActions: [
      {
        trigger: {
          timeBeforeExpiry: 'P30D'
        }
        action: {
          type: 'Notify'
        }
      }
      {
        trigger: {
          timeBeforeExpiry: 'P90D'
        }
        action: {
          type: 'Rotate'
        }
      }
    ]
  }
}

// Monitor Key Vault Key Events
resource keyVaultEventSubscription 'Microsoft.EventGrid/eventSubscriptions@2023-12-15-preview' = if (enableCustomerManagedEncryption) {
  name: '${baseName}-key-events-${environment}'
  scope: keyVault
  properties: {
    destination: {
      endpointType: 'StorageQueue'
      properties: {
        resourceId: storageAccount.id
        queueName: 'key-events'
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.KeyVault.KeyNearExpiry'
        'Microsoft.KeyVault.KeyExpired'
        'Microsoft.KeyVault.KeyNewVersionCreated'
      ]
      subjectBeginsWith: '/keys/${keyName}'
    }
    eventDeliverySchema: 'EventGridSchema'
  }
}

// Storage Queue for Key Events
resource keyEventsQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = if (enableCustomerManagedEncryption) {
  name: '${storageAccount.name}/default/key-events'
  properties: {
    metadata: {
      purpose: 'Key Vault encryption key events'
    }
  }
}

// Diagnostic Settings for Key Vault
resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableCustomerManagedEncryption) {
  name: '${keyVaultName}-encryption-diagnostics'
  scope: keyVault
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        category: 'AuditEvent'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 365 : 30
        }
      }
      {
        category: 'AzurePolicyEvaluationDetails'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 365 : 30
        }
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 365 : 30
        }
      }
    ]
  }
}

// Log Analytics Workspace (reference)
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' existing = {
  name: '${baseName}-logs-${environment}-${uniqueSuffix}'
}

// Alert for Key Near Expiry
resource keyNearExpiryAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (enableCustomerManagedEncryption && environment != 'dev') {
  name: '${keyName}-near-expiry'
  location: 'global'
  tags: tags
  properties: {
    description: 'Alert when encryption key is near expiry'
    severity: 1
    enabled: true
    scopes: [
      keyVault.id
    ]
    evaluationFrequency: 'P1D'
    windowSize: 'P1D'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'KeyNearExpiry'
          metricName: 'ServiceApiLatency'
          operator: 'GreaterThan'
          threshold: 0
          timeAggregation: 'Count'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: []
  }
}

// Backup for Encryption Key
resource keyBackup 'Microsoft.KeyVault/vaults/keys@2023-02-01' = if (enableCustomerManagedEncryption) {
  parent: keyVault
  name: '${keyName}-backup'
  properties: {
    kty: 'RSA'
    keySize: 2048
    keyOps: [
      'encrypt'
      'decrypt'
      'sign'
      'verify'
      'wrapKey'
      'unwrapKey'
    ]
    attributes: {
      enabled: false
      exportable: false
    }
  }
}

// Outputs
output userAssignedIdentityName string = enableCustomerManagedEncryption ? userAssignedIdentity.name : ''
output userAssignedIdentityId string = enableCustomerManagedEncryption ? userAssignedIdentity.id : ''
output userAssignedIdentityPrincipalId string = enableCustomerManagedEncryption ? userAssignedIdentity.properties.principalId : ''
output encryptionKeyName string = enableCustomerManagedEncryption ? encryptionKey.name : ''
output encryptionKeyId string = enableCustomerManagedEncryption ? encryptionKey.id : ''
output encryptionKeyUri string = enableCustomerManagedEncryption ? encryptionKey.properties.keyUri : ''
output diskEncryptionSetName string = enableCustomerManagedEncryption ? diskEncryptionSet.name : ''
output diskEncryptionSetId string = enableCustomerManagedEncryption ? diskEncryptionSet.id : ''
output storageEncryptionScopeName string = enableCustomerManagedEncryption ? storageEncryption.name : ''