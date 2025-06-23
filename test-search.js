// test-search.js
require('dotenv').config();
const { esClient } = require('./src/config/elasticsearch');
const { redis } = require('./src/config/redis');

async function testSearchSystem() {
  console.log('🧪 Testing FoodXchange Search System\n');

  try {
    // Test Redis
    console.log('1️⃣ Testing Redis...');
    await redis.set('test:search', 'Redis is working!');
    const redisTest = await redis.get('test:search');
    console.log('✅ Redis:', redisTest);
    await redis.del('test:search');

    // Test Elasticsearch
    console.log('\n2️⃣ Testing Elasticsearch...');
    const health = await esClient.cluster.health();
    console.log('✅ Elasticsearch:', health.status);

    // Add a test product
    console.log('\n3️⃣ Adding test product...');
    const testProduct = {
      projectId: 'test-001',
      title: 'Premium Organic Wheat from India',
      description: 'High-quality organic wheat, certified by USDA.',
      category: 'grains',
      subcategory: 'wheat',
      tags: ['organic', 'premium', 'india', 'wheat'],
      status: 'active',
      visibility: 'public',
      viewCount: 0,
      proposalCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const indexResult = await esClient.index({
      index: 'foodxchange_products',
      id: testProduct.projectId,
      body: testProduct,
      refresh: true
    });
    console.log('✅ Product indexed:', indexResult._id);

    // Search for the product
    console.log('\n4️⃣ Searching for wheat...');
    const searchResult = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: {
          match: {
            title: 'wheat'
          }
        }
      }
    });
    console.log('✅ Search results:', searchResult.hits.total.value, 'documents found');

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await redis.quit();
    process.exit();
  }
}

testSearchSystem();
