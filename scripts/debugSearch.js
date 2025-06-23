// scripts/debugSearch.js
require('dotenv').config();
const { esClient } = require('../src/config/elasticsearch');

async function debugSearch() {
  try {
    // Get all documents first
    const allDocs = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: { match_all: {} },
        size: 5
      }
    });
    
    console.log('=== Index Status ===');
    console.log(`Total documents: ${allDocs.hits.total.value}`);
    console.log('Sample documents:');
    allDocs.hits.hits.forEach((hit, i) => {
      console.log(`${i+1}. Title: ${hit._source.title || 'No title'}`);
      console.log(`   Category: ${hit._source.category}`);
      console.log(`   Description: ${hit._source.description?.substring(0, 50)}...`);
      console.log('');
    });

    // Test direct text search
    const riceSearch = await esClient.search({
      index: 'foodxchange_products',
      body: {
        query: {
          multi_match: {
            query: 'rice',
            fields: ['title', 'description']
          }
        }
      }
    });
    
    console.log('=== Direct Rice Search ===');
    console.log(`Found: ${riceSearch.hits.total.value} results`);
    
  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

debugSearch();
