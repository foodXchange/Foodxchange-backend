// src/config/elasticsearch.js
const { Client } = require('@elastic/elasticsearch');

// Create Elasticsearch client with proper configuration
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  // Disable sniffing to avoid Docker internal IP issues
  sniffOnStart: false,
  sniffOnConnectionFault: false,
  maxRetries: 3,
  requestTimeout: 30000,
  pingTimeout: 10000
});

// Test connection
const testConnection = async () => {
  try {
    const health = await esClient.cluster.health();
    console.log('✅ Elasticsearch connected:', health.status);

    // Log more details
    const info = await esClient.info();
    console.log('📊 Elasticsearch version:', info.version.number);
    console.log('🏷️  Cluster name:', info.cluster_name);

    return true;
  } catch (error) {
    console.error('❌ Elasticsearch connection failed:', error.message);
    return false;
  }
};

// Create indices if they don't exist
const initializeIndices = async () => {
  const indices = [
    { 
      name: 'foodxchange_products', 
      mapping: require('../search/indices/productIndex').productMapping 
    },
    { 
      name: 'foodxchange_suppliers', 
      mapping: {
        mappings: {
          properties: {
            companyName: { type: 'text', analyzer: 'standard' },
            country: { type: 'keyword' },
            certifications: { type: 'keyword' },
            verified: { type: 'boolean' },
            rating: { type: 'float' },
            responseTime: { type: 'integer' },
            location: { type: 'geo_point' }
          }
        }
      }
    }
  ];

  for (const index of indices) {
    try {
      const exists = await esClient.indices.exists({ index: index.name });

      if (!exists) {
        console.log(`Creating index: ${index.name}`);

        await esClient.indices.create({
          index: index.name,
          body: index.mapping
        });

        console.log(`✅ Index ${index.name} created`);
      } else {
        console.log(`📋 Index ${index.name} already exists`);
      }
    } catch (error) {
      console.error(`Error with index ${index.name}:`, error.message);
    }
  }
};

module.exports = {
  esClient,
  testConnection,
  initializeIndices
};
