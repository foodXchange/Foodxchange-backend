// Cosmos DB Optimization Module for FoodXchange Backend
// This module defines optimized Cosmos DB collections with custom indexing policies

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

@description('Cosmos DB account name')
param cosmosDbAccountName string

@description('Cosmos DB database name')
param databaseName string = 'foodxchange'

@description('Tags to apply to all resources')
param tags object = {
  environment: environment
  project: 'FoodXchange'
  component: 'database'
  managedBy: 'bicep'
}

// Reference to existing Cosmos DB Account
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosDbAccountName
}

// Reference to existing database
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases@2023-11-15' existing = {
  parent: cosmosDbAccount
  name: databaseName
}

// Users Collection with optimized indexing
resource usersCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'users'
  properties: {
    resource: {
      id: 'users'
      shardKey: {
        _id: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'email'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'phoneNumber'
            ]
          }
          options: {
            sparse: true
          }
        }
        {
          key: {
            keys: [
              'userType'
            ]
          }
        }
        {
          key: {
            keys: [
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'isActive'
            ]
          }
        }
        {
          key: {
            keys: [
              'userType'
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
      ]
    }
  }
}

// Products Collection with optimized indexing
resource productsCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'products'
  properties: {
    resource: {
      id: 'products'
      shardKey: {
        category: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'sellerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'category'
            ]
          }
        }
        {
          key: {
            keys: [
              'subcategory'
            ]
          }
        }
        {
          key: {
            keys: [
              'name'
            ]
          }
        }
        {
          key: {
            keys: [
              'price'
            ]
          }
        }
        {
          key: {
            keys: [
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'isActive'
            ]
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'harvestDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'expiryDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'organic'
            ]
          }
        }
        {
          key: {
            keys: [
              'category'
              'subcategory'
              'price'
            ]
          }
        }
        {
          key: {
            keys: [
              'category'
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'sellerId'
              'isActive'
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'name'
            ]
          }
          options: {
            textIndexVersion: 3
          }
        }
      ]
    }
  }
}

// Orders Collection with optimized indexing
resource ordersCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'orders'
  properties: {
    resource: {
      id: 'orders'
      shardKey: {
        buyerId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'buyerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'sellerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'status'
            ]
          }
        }
        {
          key: {
            keys: [
              'orderDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'deliveryDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'totalAmount'
            ]
          }
        }
        {
          key: {
            keys: [
              'items.productId'
            ]
          }
        }
        {
          key: {
            keys: [
              'buyerId'
              'status'
              'orderDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'sellerId'
              'status'
              'orderDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'status'
              'deliveryDate'
            ]
          }
        }
      ]
    }
  }
}

// Messages Collection with optimized indexing
resource messagesCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'messages'
  properties: {
    resource: {
      id: 'messages'
      shardKey: {
        conversationId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'conversationId'
            ]
          }
        }
        {
          key: {
            keys: [
              'senderId'
            ]
          }
        }
        {
          key: {
            keys: [
              'receiverId'
            ]
          }
        }
        {
          key: {
            keys: [
              'timestamp'
            ]
          }
        }
        {
          key: {
            keys: [
              'isRead'
            ]
          }
        }
        {
          key: {
            keys: [
              'conversationId'
              'timestamp'
            ]
          }
        }
        {
          key: {
            keys: [
              'receiverId'
              'isRead'
            ]
          }
        }
        {
          key: {
            keys: [
              'senderId'
              'timestamp'
            ]
          }
        }
      ]
    }
  }
}

// Reviews Collection with optimized indexing
resource reviewsCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'reviews'
  properties: {
    resource: {
      id: 'reviews'
      shardKey: {
        targetId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'targetId'
            ]
          }
        }
        {
          key: {
            keys: [
              'reviewerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'targetType'
            ]
          }
        }
        {
          key: {
            keys: [
              'rating'
            ]
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'targetId'
              'targetType'
            ]
          }
        }
        {
          key: {
            keys: [
              'targetId'
              'rating'
            ]
          }
        }
        {
          key: {
            keys: [
              'reviewerId'
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'targetType'
              'rating'
              'createdAt'
            ]
          }
        }
      ]
    }
  }
}

// Transactions Collection with optimized indexing
resource transactionsCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'transactions'
  properties: {
    resource: {
      id: 'transactions'
      shardKey: {
        orderId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'orderId'
            ]
          }
        }
        {
          key: {
            keys: [
              'buyerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'sellerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'status'
            ]
          }
        }
        {
          key: {
            keys: [
              'transactionDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'amount'
            ]
          }
        }
        {
          key: {
            keys: [
              'paymentMethod'
            ]
          }
        }
        {
          key: {
            keys: [
              'buyerId'
              'status'
              'transactionDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'sellerId'
              'status'
              'transactionDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'orderId'
              'status'
            ]
          }
        }
      ]
    }
  }
}

// Notifications Collection with optimized indexing
resource notificationsCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'notifications'
  properties: {
    resource: {
      id: 'notifications'
      shardKey: {
        userId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'userId'
            ]
          }
        }
        {
          key: {
            keys: [
              'type'
            ]
          }
        }
        {
          key: {
            keys: [
              'isRead'
            ]
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'userId'
              'isRead'
            ]
          }
        }
        {
          key: {
            keys: [
              'userId'
              'type'
            ]
          }
        }
        {
          key: {
            keys: [
              'userId'
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
          options: {
            expireAfterSeconds: 2592000
          }
        }
      ]
    }
  }
}

// Expert Profiles Collection with optimized indexing
resource expertProfilesCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'expertprofiles'
  properties: {
    resource: {
      id: 'expertprofiles'
      shardKey: {
        userId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'userId'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'expertise'
            ]
          }
        }
        {
          key: {
            keys: [
              'specializations'
            ]
          }
        }
        {
          key: {
            keys: [
              'certifications.type'
            ]
          }
        }
        {
          key: {
            keys: [
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'hourlyRate'
            ]
          }
        }
        {
          key: {
            keys: [
              'rating'
            ]
          }
        }
        {
          key: {
            keys: [
              'isActive'
            ]
          }
        }
        {
          key: {
            keys: [
              'expertise'
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'expertise'
              'hourlyRate'
            ]
          }
        }
        {
          key: {
            keys: [
              'expertise'
              'rating'
            ]
          }
        }
        {
          key: {
            keys: [
              'isActive'
              'expertise'
              'rating'
            ]
          }
        }
      ]
    }
  }
}

// RFQ Collection with optimized indexing
resource rfqCollection 'Microsoft.DocumentDB/databaseAccounts/mongodbDatabases/collections@2023-11-15' = {
  parent: cosmosDatabase
  name: 'rfqs'
  properties: {
    resource: {
      id: 'rfqs'
      shardKey: {
        buyerId: 'Hash'
      }
      indexes: [
        {
          key: {
            keys: [
              '_id'
            ]
          }
          options: {
            unique: true
          }
        }
        {
          key: {
            keys: [
              'buyerId'
            ]
          }
        }
        {
          key: {
            keys: [
              'category'
            ]
          }
        }
        {
          key: {
            keys: [
              'subcategory'
            ]
          }
        }
        {
          key: {
            keys: [
              'status'
            ]
          }
        }
        {
          key: {
            keys: [
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'expiryDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'category'
              'subcategory'
            ]
          }
        }
        {
          key: {
            keys: [
              'category'
              'location.coordinates'
            ]
          }
          options: {
            '2dsphere': true
          }
        }
        {
          key: {
            keys: [
              'status'
              'createdAt'
            ]
          }
        }
        {
          key: {
            keys: [
              'status'
              'expiryDate'
            ]
          }
        }
        {
          key: {
            keys: [
              'buyerId'
              'status'
            ]
          }
        }
      ]
    }
  }
}

// Outputs
output usersCollectionName string = usersCollection.name
output productsCollectionName string = productsCollection.name
output ordersCollectionName string = ordersCollection.name
output messagesCollectionName string = messagesCollection.name
output reviewsCollectionName string = reviewsCollection.name
output transactionsCollectionName string = transactionsCollection.name
output notificationsCollectionName string = notificationsCollection.name
output expertProfilesCollectionName string = expertProfilesCollection.name
output rfqCollectionName string = rfqCollection.name