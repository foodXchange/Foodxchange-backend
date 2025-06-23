const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: 'http://localhost:9200'
});

async function testElasticsearch() {
  try {
    const health = await client.cluster.health();
    console.log('✅ Elasticsearch is running!');
    console.log('Status:', health.status);
    console.log('Cluster name:', health.cluster_name);
    
    // List indices
    const indices = await client.cat.indices({ format: 'json' });
    console.log('\nCurrent indices:');
    indices.forEach(index => {
      console.log(`- ${index.index} (${index['docs.count']} docs)`);
    });
  } catch (error) {
    console.error('❌ Elasticsearch is not running!');
    console.error('Error:', error.message);
    console.log('\nPlease install and start Elasticsearch:');
    console.log('1. Download from: https://www.elastic.co/downloads/elasticsearch');
    console.log('2. Extract the zip file');
    console.log('3. Run: bin\\elasticsearch.bat');
  }
}

testElasticsearch();
