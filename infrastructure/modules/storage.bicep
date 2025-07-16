// Storage Module for FoodXchange
// Provides Storage Account with lifecycle policies, CDN, and private endpoints

@description('Base name for resources')
@minLength(3)
@maxLength(24)
param baseName string

@description('Environment name')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

@description('Azure region')
param location string = resourceGroup().location

@description('Tags to apply to all resources')
param tags object = {}

@description('Storage SKU')
@allowed([
  'Standard_LRS'
  'Standard_ZRS'
  'Standard_GRS'
  'Premium_LRS'
])
param storageSku string = environment == 'prod' ? 'Standard_ZRS' : 'Standard_LRS'

@description('Enable lifecycle management policies')
param enableLifecyclePolicies bool = environment != 'dev'

@description('Subnet ID for private endpoints')
param privateEndpointSubnetId string = ''

@description('Private DNS Zone ID for blob storage')
param blobPrivateDnsZoneId string = ''

@description('VNet ID for network rules')
param vnetId string = ''

@description('Enable CDN')
param enableCdn bool = environment == 'prod'

// Variables
var storageAccountName = take(replace('${baseName}st${environment}', '-', ''), 24)
var cdnProfileName = '${baseName}-cdn-${environment}'
var cdnEndpointName = '${baseName}-${environment}'

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: environment != 'prod' // Disable shared key access in production
    defaultToOAuthAuthentication: true
    publicNetworkAccess: environment == 'prod' ? 'Disabled' : 'Enabled'
    networkAcls: {
      defaultAction: environment == 'prod' ? 'Deny' : 'Allow'
      bypass: 'AzureServices'
      virtualNetworkRules: !empty(vnetId) && environment != 'prod' ? [
        {
          id: '${vnetId}/subnets/app-subnet'
          action: 'Allow'
        }
      ] : []
      ipRules: []
    }
    encryption: {
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
      keySource: 'Microsoft.Storage'
    }
    sasPolicy: {
      sasExpirationPeriod: '1.00:00:00' // 1 day
      expirationAction: 'Log'
    }
  }
}

// Blob Service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: environment == 'prod' ? [
            'https://${baseName}.com'
            'https://www.${baseName}.com'
          ] : [
            '*'
          ]
          allowedMethods: [
            'GET'
            'POST'
            'PUT'
            'DELETE'
            'OPTIONS'
          ]
          maxAgeInSeconds: 3600
          exposedHeaders: [
            'Content-Length'
            'Content-Type'
            'x-ms-*'
          ]
          allowedHeaders: [
            '*'
          ]
        }
      ]
    }
    deleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: environment == 'prod' ? 30 : 7
    }
    changeFeed: {
      enabled: environment == 'prod'
    }
    isVersioningEnabled: environment == 'prod'
  }
}

// Storage Containers
var containers = [
  {
    name: 'product-images'
    publicAccess: 'None'
    metadata: {
      purpose: 'Product images and thumbnails'
    }
  }
  {
    name: 'certifications'
    publicAccess: 'None'
    metadata: {
      purpose: 'Compliance and certification documents'
    }
  }
  {
    name: 'documents'
    publicAccess: 'None'
    metadata: {
      purpose: 'General documents and reports'
    }
  }
  {
    name: 'temp'
    publicAccess: 'None'
    metadata: {
      purpose: 'Temporary files'
    }
  }
  {
    name: 'backups'
    publicAccess: 'None'
    metadata: {
      purpose: 'Application backups'
    }
  }
]

resource storageContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = [for container in containers: {
  parent: blobService
  name: container.name
  properties: {
    publicAccess: container.publicAccess
    metadata: container.metadata
  }
}]

// Lifecycle Management Policies
resource lifecycleManagement 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = if (enableLifecyclePolicies) {
  parent: storageAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          enabled: true
          name: 'ArchiveOldProductImages'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['product-images/']
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 30
                }
                tierToArchive: {
                  daysAfterModificationGreaterThan: 90
                }
                delete: {
                  daysAfterModificationGreaterThan: 365
                }
              }
              snapshot: {
                delete: {
                  daysAfterCreationGreaterThan: 7
                }
              }
            }
          }
        }
        {
          enabled: true
          name: 'DeleteTempFiles'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['temp/']
            }
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: 1
                }
              }
            }
          }
        }
        {
          enabled: true
          name: 'ArchiveCertifications'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['certifications/']
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 60
                }
                tierToArchive: {
                  daysAfterModificationGreaterThan: 180
                }
              }
            }
          }
        }
        {
          enabled: true
          name: 'ManageBackups'
          type: 'Lifecycle'
          definition: {
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: ['backups/']
            }
            actions: {
              baseBlob: {
                tierToCool: {
                  daysAfterModificationGreaterThan: 7
                }
                tierToArchive: {
                  daysAfterModificationGreaterThan: 30
                }
                delete: {
                  daysAfterModificationGreaterThan: environment == 'prod' ? 90 : 30
                }
              }
            }
          }
        }
      ]
    }
  }
}

// Storage Private Endpoint (for production)
resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-09-01' = if (environment == 'prod' && !empty(privateEndpointSubnetId)) {
  name: '${storageAccount.name}-blob-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${storageAccount.name}-blob-connection'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: ['blob']
        }
      }
    ]
  }
}

// Private DNS Zone Group for Storage
resource storageDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-09-01' = if (environment == 'prod' && !empty(blobPrivateDnsZoneId)) {
  parent: storagePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-blob-core-windows-net'
        properties: {
          privateDnsZoneId: blobPrivateDnsZoneId
        }
      }
    ]
  }
}

// CDN Profile
resource cdnProfile 'Microsoft.Cdn/profiles@2023-05-01' = if (enableCdn) {
  name: cdnProfileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Standard_Microsoft'
  }
}

// CDN Endpoint
resource cdnEndpoint 'Microsoft.Cdn/profiles/endpoints@2023-05-01' = if (enableCdn) {
  parent: cdnProfile
  name: cdnEndpointName
  location: 'global'
  tags: tags
  properties: {
    originHostHeader: replace(replace(storageAccount.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
    isHttpAllowed: false
    isHttpsAllowed: true
    queryStringCachingBehavior: 'IgnoreQueryString'
    contentTypesToCompress: [
      'text/html'
      'text/css'
      'text/javascript'
      'text/plain'
      'application/javascript'
      'application/json'
      'application/xml'
      'image/svg+xml'
    ]
    isCompressionEnabled: true
    origins: [
      {
        name: 'storage-origin'
        properties: {
          hostName: replace(replace(storageAccount.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
          httpPort: 80
          httpsPort: 443
          originHostHeader: replace(replace(storageAccount.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
          priority: 1
          weight: 1000
          enabled: true
        }
      }
    ]
    deliveryPolicy: {
      rules: [
        {
          name: 'CacheImages'
          order: 1
          conditions: [
            {
              name: 'UrlFileExtension'
              parameters: {
                operator: 'Any'
                negateCondition: false
                matchValues: [
                  'jpg'
                  'jpeg'
                  'png'
                  'gif'
                  'webp'
                  'svg'
                ]
              }
            }
          ]
          actions: [
            {
              name: 'CacheExpiration'
              parameters: {
                cacheBehavior: 'SetIfMissing'
                cacheType: 'Days'
                cacheDuration: '7'
              }
            }
          ]
        }
        {
          name: 'CacheStaticAssets'
          order: 2
          conditions: [
            {
              name: 'UrlFileExtension'
              parameters: {
                operator: 'Any'
                negateCondition: false
                matchValues: [
                  'css'
                  'js'
                  'woff'
                  'woff2'
                  'ttf'
                  'eot'
                ]
              }
            }
          ]
          actions: [
            {
              name: 'CacheExpiration'
              parameters: {
                cacheBehavior: 'SetIfMissing'
                cacheType: 'Days'
                cacheDuration: '30'
              }
            }
          ]
        }
      ]
    }
  }
}

// Storage metrics and logging
resource storageMetricsConfig 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'storage-diagnostics'
  scope: storageAccount
  properties: {
    metrics: [
      {
        category: 'Transaction'
        enabled: true
        retentionPolicy: {
          enabled: true
          days: environment == 'prod' ? 90 : 30
        }
      }
    ]
  }
}

// Outputs
output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output primaryBlobEndpoint string = storageAccount.properties.primaryEndpoints.blob
output primaryFileEndpoint string = storageAccount.properties.primaryEndpoints.file
output cdnEndpoint string = enableCdn ? 'https://${cdnEndpoint.properties.hostName}' : ''
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'