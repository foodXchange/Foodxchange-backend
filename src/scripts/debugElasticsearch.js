// scripts/debugElasticsearch.js
require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

async function debugElasticsearch() {
  try {
    console.log('🔍 Debugging Elasticsearch...\n');
    
    // 1. Check if Elasticsearch is running
    const health = await client.cluster.health();
    console.log('✅ Elasticsearch Status:', health.status);
    
    // 2. List all indices
    const indices = await client.cat.indices({ format: 'json' });
    console.log('\n📊 Available indices:');
    indices.forEach(index => {
      console.log(`- ${index.index} (${index['docs.count']} docs)`);
    });
    
    // 3. Check if products index exists
    const indexName = 'products';
    const exists = await client.indices.exists({ index: indexName });
    console.log(`\n📦 Products index exists: ${exists}`);
    
    if (exists) {
      // 4. Get mapping for products index
      const mapping = await client.indices.getMapping({ index: indexName });
      console.log('\n🗺️ Products index mapping:');
      console.log(JSON.stringify(mapping[indexName].mappings, null, 2));
      
      // 5. Get sample documents
      const searchResult = await client.search({
        index: indexName,
        size: 3,
        body: {
          query: {
            match_all: {}
          }
        }
      });
      
      console.log(`\n📄 Sample documents (found ${searchResult.hits.total.value} total):`);
      searchResult.hits.hits.forEach((hit, index) => {
        console.log(`\nDocument ${index + 1}:`);
        console.log(JSON.stringify(hit._source, null, 2));
      });
      
      // 6. Test different search queries
      console.log('\n🔍 Testing search queries:');
      
      // Test query 1: Simple match
      const test1 = await client.search({
        index: indexName,
        body: {
          query: {
            match: {
              name: 'rice'
            }
          }
        }
      });
      console.log(`\nSearch for "rice" in name field: ${test1.hits.total.value} results`);
      
      // Test query 2: Multi-match
      const test2 = await client.search({
        index: indexName,
        body: {
          query: {
            multi_match: {
              query: 'rice',
              fields: ['name', 'title', 'description', 'tags']
            }
          }
        }
      });
      console.log(`Multi-match search for "rice": ${test2.hits.total.value} results`);
      
      // Test query 3: Term query for category
      const test3 = await client.search({
        index: indexName,
        body: {
          query: {
            term: {
              category: 'grains'
            }
          }
        }
      });
      console.log(`Search for category "grains": ${test3.hits.total.value} results`);
      
    } else {
      console.log('\n❌ Products index does not exist!');
      console.log('Creating index and reindexing products...');
      
      // Create the index with proper mapping
      await client.indices.create({
        index: indexName,
        body: {
          mappings: {
            properties: {
              name: { type: 'text', analyzer: 'standard' },
              title: { type: 'text', analyzer: 'standard' },
              description: { type: 'text', analyzer: 'standard' },
              category: { type: 'keyword' },
              subcategory: { type: 'keyword' },
              tags: { type: 'text', analyzer: 'standard' },
              status: { type: 'keyword' },
              price: { type: 'float' },
              supplier: { type: 'text' }
            }
          }
        }
      });
      
      console.log('✅ Index created! Now run reindexProducts.js');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.meta && error.meta.body) {
      console.error('Details:', JSON.stringify(error.meta.body, null, 2));
    }
  }
}

debugElasticsearch();