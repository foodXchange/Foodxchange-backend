// src/scripts/initializeSearch.js
require('dotenv').config();
const { esClient } = require('../config/elasticsearch');
const { productMapping, createProductIndex } = require('../search/indices/productIndex');

async function initializeSearch() {
  console.log('🚀 Initializing FoodXchange Search System...\n');

  try {
    // Test connection
    const health = await esClient.cluster.health();
    console.log('✅ Elasticsearch Status:', health.status);
    
    // Delete existing indices (for fresh start)
    console.log('\n🗑️  Cleaning up old indices...');
    try {
      await esClient.indices.delete({ index: 'foodxchange_*' });
      console.log('✅ Old indices deleted');
    } catch (error) {
      console.log('ℹ️  No old indices to delete');
    }
    
    // Create product index
    console.log('\n📦 Creating Product Index...');
    await createProductIndex(esClient);
    
    // Create other indices
    console.log('\n📋 Creating Other Indices...');
    
    // Supplier index
    await esClient.indices.create({
      index: 'foodxchange_suppliers',
      body: {
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
    });
    console.log('✅ Supplier index created');
    
    // Get all indices
    console.log('\n📊 Current Indices:');
    const indices = await esClient.cat.indices({ format: 'json' });
    indices.forEach(index => {
      console.log(`  - ${index.index} (docs: ${index['docs.count']}, size: ${index['store.size']})`);
    });
    
    console.log('\n✅ Search system initialized successfully!');
    
  } catch (error) {
    console.error('\n❌ Initialization failed:', error.message);
    console.error(error);
  } finally {
    process.exit();
  }
}

// Run initialization
initializeSearch();
