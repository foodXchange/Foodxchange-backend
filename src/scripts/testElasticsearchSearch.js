# Create the test script
@'
// scripts/testElasticsearchSearch.js
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'http://localhost:9200'
});

async function testSearch() {
  try {
    console.log('🔍 Testing Elasticsearch searches...\n');
    
    // 1. Get all documents
    console.log('1. Getting all documents from foodxchange_products:');
    const allDocs = await client.search({
      index: 'foodxchange_products',
      size: 5,
      body: {
        query: {
          match_all: {}
        }
      }
    });
    
    console.log(`Total documents: ${allDocs.hits.total.value}`);
    console.log('Sample documents:');
    allDocs.hits.hits.forEach(hit => {
      console.log(`- ${hit._source.name || hit._source.title} (${hit._source.category})`);
    });
    
    // 2. Search for "rice"
    console.log('\n2. Searching for "rice":');
    const riceSearch = await client.search({
      index: 'foodxchange_products',
      body: {
        query: {
          multi_match: {
            query: 'rice',
            fields: ['name', 'title', 'description', 'tags']
          }
        }
      }
    });
    
    console.log(`Found ${riceSearch.hits.total.value} results for "rice"`);
    riceSearch.hits.hits.forEach(hit => {
      console.log(`- ${hit._source.name || hit._source.title} (score: ${hit._score})`);
    });
    
    // 3. Search by category
    console.log('\n3. Searching for category "grains":');
    const categorySearch = await client.search({
      index: 'foodxchange_products',
      body: {
        query: {
          term: {
            category: 'grains'
          }
        }
      }
    });
    
    console.log(`Found ${categorySearch.hits.total.value} products in "grains" category`);
    
    // 4. Check document structure
    console.log('\n4. Sample document structure:');
    if (allDocs.hits.hits.length > 0) {
      console.log(JSON.stringify(allDocs.hits.hits[0]._source, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSearch();
'@ | Out-File -FilePath "scripts/testElasticsearchSearch.js" -Encoding UTF8

# Run it
node scripts/testElasticsearchSearch.js