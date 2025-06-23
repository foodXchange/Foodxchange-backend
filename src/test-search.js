// test-search.js
// Test the complete search system

require('dotenv').config();
const { esClient } = require('./config/elasticsearch');
const { redis } = require('./config/redis');

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
      description: 'High-quality organic wheat, certified by USDA. Perfect for bread making.',
      category: 'grains',
      subcategory: 'wheat',
      tags: ['organic', 'premium', 'india', 'wheat'],
      specifications: {
        productName: 'Organic Wheat',
        variety: 'Hard Red Winter',
        grade: 'Premium',
        origin: 'Punjab, India',
        packaging: {
          type: 'Bags',
          size: '50kg',
          material: 'Jute'
        }
      },
      quantity: {
        value: 1000,
        unit: 'ton',
        minimumOrder: 20
      },
      budget: {
        min: 300,
        max: 350,
        currency: 'USD',
        negotiable: true
      },
      certifications: ['Organic', 'USDA', 'Non-GMO'],
      delivery: {
        location: {
          lat: 30.7333,
          lon: 76.7794
        },
        city: 'Chandigarh',
        country: 'India',
        incoterms: 'FOB',
        leadTime: 30
      },
      buyer: {
        id: 'buyer-123',
        companyName: 'Global Foods Inc',
        country: 'USA',
        verified: true,
        rating: 4.5
      },
      status: 'active',
      visibility: 'public',
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      viewCount: 0,
      proposalCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const indexResult = await esClient.index({
      index: 'foodxchange_products',
      id: testProduct.projectId,
      body: testProduct,
      refresh: true // Make it immediately searchable
    });
    console.log('✅ Product indexed:', indexResult._id);

    // Search for the product
    console.log('\n4️⃣ Searching for wheat...');
    const searchResult = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: {
          multi_match: {
            query: 'wheat',
            fields: ['title^3', 'description^2', 'tags']
          }
        }
      }
    });
    console.log('✅ Search results:', searchResult.hits.total.value, 'documents found');
    if (searchResult.hits.hits.length > 0) {
      console.log('📄 First result:', searchResult.hits.hits[0]._source.title);
    }

    // Test aggregations
    console.log('\n5️⃣ Testing aggregations...');
    const aggResult = await esClient.search({
      index: 'foodxchange_products',
      body: {
        size: 0,
        aggs: {
          categories: {
            terms: {
              field: 'category'
            }
          }
        }
      }
    });
    console.log('✅ Categories:', aggResult.aggregations.categories.buckets);

    console.log('\n✅ All tests passed! Your search system is ready.');
    console.log('\n🎯 Next steps:');
    console.log('  1. Index your existing MongoDB data');
    console.log('  2. Create search API endpoints');
    console.log('  3. Build search UI\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
  } finally {
    // Close connections
    await redis.quit();
    process.exit();
  }
}

// Run tests
testSearchSystem();