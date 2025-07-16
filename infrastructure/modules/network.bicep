// Network Module for FoodXchange
// Provides VNet, subnets, NSGs, and network security configurations

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

@description('Address space for VNet')
param vnetAddressPrefix string = '10.0.0.0/16'

@description('Tags to apply to all resources')
param tags object = {}

// Variables
var vnetName = '${baseName}-vnet-${environment}'
var appSubnetName = 'app-subnet'
var privateEndpointSubnetName = 'private-endpoints-subnet'
var dbSubnetName = 'database-subnet'
var cacheSubnetName = 'cache-subnet'

// Network Security Group for App Subnet
resource appNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: '${baseName}-app-nsg-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowHTTPS'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: environment == 'prod' ? 'AzureFrontDoor.Backend' : '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '443'
        }
      }
      {
        name: 'AllowHTTP'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: environment == 'prod' ? 'Deny' : 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '80'
        }
      }
      {
        name: 'AllowAppServiceManagement'
        properties: {
          priority: 200
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'AppServiceManagement'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '454-455'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

// Network Security Group for Private Endpoints
resource privateEndpointNsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: '${baseName}-pe-nsg-${environment}'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowVNetInbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: 'VirtualNetwork'
          destinationPortRange: '*'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

// Virtual Network
resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [vnetAddressPrefix]
    }
    dhcpOptions: {
      dnsServers: []
    }
    subnets: [
      {
        name: appSubnetName
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 0) // 10.0.0.0/24
          networkSecurityGroup: {
            id: appNsg.id
          }
          serviceEndpoints: [
            {
              service: 'Microsoft.Storage'
              locations: [location]
            }
            {
              service: 'Microsoft.KeyVault'
              locations: [location]
            }
            {
              service: 'Microsoft.AzureCosmosDB'
              locations: [location]
            }
          ]
          delegations: [
            {
              name: 'webapp'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 1) // 10.0.1.0/24
          networkSecurityGroup: {
            id: privateEndpointNsg.id
          }
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Disabled'
        }
      }
      {
        name: dbSubnetName
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 2) // 10.0.2.0/24
          serviceEndpoints: [
            {
              service: 'Microsoft.AzureCosmosDB'
              locations: [location]
            }
          ]
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: cacheSubnetName
        properties: {
          addressPrefix: cidrSubnet(vnetAddressPrefix, 24, 3) // 10.0.3.0/24
          serviceEndpoints: [
            {
              service: 'Microsoft.Cache'
              locations: [location]
            }
          ]
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// Private DNS Zones for Private Endpoints
var privateDnsZones = [
  {
    name: 'privatelink.vaultcore.azure.net'
    displayName: 'Key Vault'
  }
  {
    name: 'privatelink.mongo.cosmos.azure.com'
    displayName: 'Cosmos DB MongoDB'
  }
  {
    name: 'privatelink.blob.core.windows.net'
    displayName: 'Storage Blob'
  }
  {
    name: 'privatelink.redis.cache.windows.net'
    displayName: 'Redis Cache'
  }
  {
    name: 'privatelink.azurewebsites.net'
    displayName: 'App Service'
  }
]

resource dnsZones 'Microsoft.Network/privateDnsZones@2020-06-01' = [for zone in privateDnsZones: {
  name: zone.name
  location: 'global'
  tags: union(tags, {
    displayName: zone.displayName
  })
}]

// Link DNS zones to VNet
resource dnsZoneLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [for (zone, i) in privateDnsZones: {
  name: '${vnetName}-link'
  parent: dnsZones[i]
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnet.id
    }
    registrationEnabled: false
  }
}]

// DDoS Protection Plan (for production)
resource ddosProtectionPlan 'Microsoft.Network/ddosProtectionPlans@2023-09-01' = if (environment == 'prod') {
  name: '${baseName}-ddos-${environment}'
  location: location
  tags: tags
  properties: {}
}

// Update VNet with DDoS protection for production
resource vnetWithDdos 'Microsoft.Network/virtualNetworks@2023-09-01' = if (environment == 'prod') {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: vnet.properties.addressSpace
    subnets: vnet.properties.subnets
    enableDdosProtection: true
    ddosProtectionPlan: {
      id: ddosProtectionPlan.id
    }
  }
}

// Outputs
output vnetId string = vnet.id
output vnetName string = vnet.name
output appSubnetId string = vnet.properties.subnets[0].id
output privateEndpointSubnetId string = vnet.properties.subnets[1].id
output dbSubnetId string = vnet.properties.subnets[2].id
output cacheSubnetId string = vnet.properties.subnets[3].id
output privateDnsZoneIds array = [for i in range(0, length(privateDnsZones)): dnsZones[i].id]
output privateDnsZoneNames array = [for zone in privateDnsZones: zone.name]