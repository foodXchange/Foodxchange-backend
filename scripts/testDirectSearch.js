// scripts/testDirectSearch.js
require('dotenv').config();
const { esClient } = require('./src/config/elasticsearch');

async function testDirectSearch() {
  try {
    console.log('=== Testing Direct Elasticsearch Queries ===');
    
    // Test 1: Get all documents
    const allDocs = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: { match_all: {} },
        size: 5
      }
    });
    
    console.log(`Total documents: ${allDocs.hits.total.value}`);
    console.log('Sample titles:');
    allDocs.hits.hits.forEach(hit => {
      console.log(`- ${hit._source.title || hit._source.name || 'No title'}`);
    });
    
    // Test 2: Search for rice in different fields
    const riceTests = [
      { field: 'title', query: 'rice' },
      { field: 'description', query: 'rice' },
      { field: 'tags', query: 'rice' },
      { field: '_all', query: 'rice' }
    ];
    
    for (const test of riceTests) {
      const result = await esClient.search({
        index: 'foodxchange_products',
        body: {
          query: {
            match: {
              [test.field]: test.query
            }
          }
        }
      });
      console.log(`Search "${test.query}" in ${test.field}: ${result.hits.total.value} results`);
    }
    
    // Test 3: Wildcard search
    const wildcardResult = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: {
          wildcard: {
            'title.keyword': '*rice*'
          }
        }
      }
    });
    console.log(`Wildcard search for rice: ${wildcardResult.hits.total.value} results`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testDirectSearch();
