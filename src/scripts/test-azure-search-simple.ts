import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testAzureSearch() {
  console.log('🔍 Testing Azure Search Configuration...\n');

  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
  const apiKey = process.env.AZURE_SEARCH_KEY;

  console.log('Configuration:', {
    endpoint: endpoint || 'NOT SET',
    indexName: indexName || 'NOT SET',
    apiKey: apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT SET'
  });

  if (!endpoint || !indexName || !apiKey) {
    console.error('❌ Missing required Azure Search configuration');
    return false;
  }

  try {
    const searchClient = new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(apiKey)
    );

    console.log('🔗 Connecting to Azure Search...');

    // Test 1: Basic search
    console.log('📋 Test 1: Basic search functionality');
    const results = await searchClient.search('*', {
      top: 1,
      includeTotalCount: true
    });

    console.log(`✅ Search successful! Found ${results.count || 0} total documents`);

    // Test 2: Specific search
    console.log('📋 Test 2: Specific search query');
    const specificResults = await searchClient.search('organic', {
      top: 3,
      includeTotalCount: true
    });

    console.log(`✅ Specific search successful! Found ${specificResults.count || 0} documents for "organic"`);

    // Test 3: Search with facets
    console.log('📋 Test 3: Search with facets');
    const facetResults = await searchClient.search('*', {
      facets: ['category', 'brand', 'isOrganic'],
      top: 1
    });

    console.log('✅ Faceted search successful!');
    if (facetResults.facets) {
      console.log('Available facets:', Object.keys(facetResults.facets));
    }

    console.log('\n🎉 All Azure Search tests passed!');
    return true;

  } catch (error: any) {
    console.error('❌ Azure Search test failed:', error.message);

    if (error.statusCode === 403) {
      console.error('💡 Hint: Check if the API key is correct and has proper permissions');
    } else if (error.statusCode === 404) {
      console.error('💡 Hint: Check if the endpoint URL and index name are correct');
    }

    return false;
  }
}

// Run the test
testAzureSearch()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
