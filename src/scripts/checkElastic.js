// scripts/checkElastic.js
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'http://localhost:9200'
});

async function checkElastic() {
  try {
    // Check if Elasticsearch is running
    await client.ping();
    console.log('✅ Elasticsearch is running');
    
    // List all indices
    const indices = await client.cat.indices({ format: 'json' });
    console.log('\n📊 Indices:');
    indices.forEach(index => {
      console.log(`- ${index.index}: ${index['docs.count']} documents`);
    });
    
    // Check products index
    const exists = await client.indices.exists({ index: 'products' });
    if (exists) {
      // Count documents
      const count = await client.count({ index: 'products' });
      console.log(`\n📦 Products index has ${count.count} documents`);
      
      // Get a sample document
      const sample = await client.search({
        index: 'products',
        size: 1,
        body: { query: { match_all: {} } }
      });
      
      if (sample.hits.hits.length > 0) {
        console.log('\n📄 Sample document:');
        console.log(JSON.stringify(sample.hits.hits[0]._source, null, 2));
      }
    } else {
      console.log('\n❌ Products index does not exist!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n⚠️  Is Elasticsearch running on port 9200?');
    console.log('Start it with: elasticsearch (on Windows) or elasticsearch-7.17.0/bin/elasticsearch (on Mac/Linux)');
  }
}

checkElastic();