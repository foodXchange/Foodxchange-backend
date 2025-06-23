// test-search-simple.js
require('dotenv').config();

async function testConnections() {
  console.log('🧪 Testing FoodXchange Search Connections\n');

  try {
    // Test Elasticsearch with simple HTTP request
    console.log('1️⃣ Testing Elasticsearch with direct HTTP...');
    const fetch = require('node-fetch').default || require('node-fetch');
    
    try {
      const response = await fetch('http://localhost:9200/_cluster/health');
      const health = await response.json();
      console.log('✅ Elasticsearch HTTP:', health.status);
    } catch (httpError) {
      console.log('❌ Direct HTTP failed, trying with client...');
      
      // Try with ES client
      const { esClient } = require('./src/config/elasticsearch');
      const health = await esClient.cluster.health();
      console.log('✅ Elasticsearch Client:', health.status);
    }

    // Test Redis
    console.log('\n2️⃣ Testing Redis...');
    const redis = require('./src/config/redis');
    
    await redis.set('test:connection', 'success');
    const result = await redis.get('test:connection');
    console.log('✅ Redis:', result);
    await redis.del('test:connection');

    console.log('\n✅ All connections working!');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    console.error('Stack:', error.stack);
  }

  process.exit(0);
}

testConnections();