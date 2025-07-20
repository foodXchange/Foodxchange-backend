import { SearchClient, AzureKeyCredential } from '@azure/search-documents';

import { config } from '../core/config';
import { Logger } from '../core/logging/logger';

const logger = new Logger('AzureConfigTest');

async function testAzureSearchConfig() {
  try {
    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const indexName = process.env.AZURE_SEARCH_INDEX_NAME;
    const apiKey = process.env.AZURE_SEARCH_KEY;

    if (!endpoint || !indexName || !apiKey || apiKey === 'paste_the_primary_admin_key_here') {
      logger.error('Azure Search not properly configured', {
        endpoint: endpoint ? 'configured' : 'missing',
        indexName: indexName ? 'configured' : 'missing',
        apiKey: apiKey && apiKey !== 'paste_the_primary_admin_key_here' ? 'configured' : 'missing/placeholder'
      });
      return false;
    }

    logger.info('Testing Azure Search configuration...', {
      endpoint,
      indexName
    });

    const searchClient = new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(apiKey)
    );

    // Test basic search functionality
    const results = await searchClient.search('organic tomatoes', {
      top: 5,
      includeTotalCount: true
    });

    logger.info('✅ Azure Search test successful!', {
      totalCount: results.count,
      hasResults: results.count > 0
    });

    return true;
  } catch (error) {
    logger.error('❌ Azure Search test failed', error);
    return false;
  }
}

async function testAllAzureServices() {
  logger.info('Testing all Azure service configurations...');

  const results = {
    search: await testAzureSearchConfig()
    // Add other service tests here
  };

  const allPassed = Object.values(results).every(Boolean);

  logger.info('Azure configuration test results:', {
    ...results,
    overall: allPassed ? 'PASSED' : 'FAILED'
  });

  return allPassed;
}

// Run tests if called directly
if (require.main === module) {
  testAllAzureServices()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      logger.error('Test execution failed', error);
      process.exit(1);
    });
}

export { testAzureSearchConfig, testAllAzureServices };
