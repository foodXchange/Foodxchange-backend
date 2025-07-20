import * as dotenv from 'dotenv';

import { telemetryClient } from '../config/applicationInsights';
import { computerVisionService } from '../services/azure/computerVision.service';
import { documentIntelligenceService } from '../services/azure/documentIntelligence.service';
import { openAIService } from '../services/azure/openAI.service';
import { serviceBusService } from '../services/azure/serviceBus.service';
import { storageService } from '../services/azure/storage.service';

// Load environment variables
dotenv.config();

async function initializeAzureServices() {
  console.log('🚀 Initializing Azure Services...\n');

  const results = {
    documentIntelligence: false,
    computerVision: false,
    openAI: false,
    serviceBus: false,
    storage: false,
    applicationInsights: false
  };

  // 1. Test Application Insights
  console.log('📊 Testing Application Insights...');
  try {
    if (telemetryClient) {
      telemetryClient.trackEvent({
        name: 'AzureServices.InitializationTest',
        properties: {
          timestamp: new Date().toISOString(),
          source: 'initialization-script'
        }
      });
      telemetryClient.flush();
      results.applicationInsights = true;
      console.log('✅ Application Insights - Connected');
    } else {
      console.log('⚠️  Application Insights - Not configured');
    }
  } catch (error: any) {
    console.log('❌ Application Insights - Error:', error.message);
  }

  // 2. Test Document Intelligence
  console.log('\n📄 Testing Document Intelligence...');
  try {
    const healthStatus = documentIntelligenceService.getHealthStatus();
    if (healthStatus.healthy) {
      console.log('✅ Document Intelligence - Service ready');
      console.log('   Supported models:', documentIntelligenceService.getSupportedDocumentTypes().slice(0, 3).join(', '), '...');
      results.documentIntelligence = true;
    } else {
      console.log('❌ Document Intelligence - Not configured properly');
      console.log('   Details:', healthStatus.details);
    }
  } catch (error: any) {
    console.log('❌ Document Intelligence - Error:', error.message);
  }

  // 3. Test Computer Vision
  console.log('\n🖼️  Testing Computer Vision...');
  try {
    const healthStatus = computerVisionService.getHealthStatus();
    if (healthStatus.healthy) {
      console.log('✅ Computer Vision - Service ready');
      results.computerVision = true;
    } else {
      console.log('❌ Computer Vision - Not configured properly');
      console.log('   Details:', healthStatus.details);
    }
  } catch (error: any) {
    console.log('❌ Computer Vision - Error:', error.message);
  }

  // 4. Test Azure OpenAI
  console.log('\n🤖 Testing Azure OpenAI...');
  try {
    const healthStatus = openAIService.getHealthStatus();
    if (healthStatus.healthy) {
      console.log('✅ Azure OpenAI - Service ready');
      console.log('   Deployment:', healthStatus.details.deploymentId);
      results.openAI = true;
    } else {
      console.log('❌ Azure OpenAI - Not configured properly');
      console.log('   Details:', healthStatus.details);
    }
  } catch (error: any) {
    console.log('❌ Azure OpenAI - Error:', error.message);
  }

  // 5. Test Service Bus
  console.log('\n📨 Testing Service Bus...');
  try {
    const healthStatus = serviceBusService.getHealthStatus();
    if (healthStatus.healthy) {
      console.log('✅ Service Bus - Service ready');
      console.log('   Active senders:', healthStatus.details.activeSenders);
      console.log('   Active receivers:', healthStatus.details.activeReceivers);
      results.serviceBus = true;
    } else {
      console.log('❌ Service Bus - Not configured properly');
      console.log('   Details:', healthStatus.details);
    }
  } catch (error: any) {
    console.log('❌ Service Bus - Error:', error.message);
  }

  // 6. Test Storage
  console.log('\n☁️  Testing Azure Storage...');
  try {
    const healthStatus = storageService.getHealthStatus();
    if (healthStatus.healthy) {
      console.log('✅ Azure Storage - Service ready');
      console.log('   Container:', healthStatus.details.containerName);
      results.storage = true;
    } else {
      console.log('❌ Azure Storage - Not configured properly');
      console.log('   Details:', healthStatus.details);
    }
  } catch (error: any) {
    console.log('❌ Azure Storage - Error:', error.message);
  }

  // Summary
  console.log('\n📋 Summary:');
  const successCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;

  Object.entries(results).forEach(([service, success]) => {
    console.log(`${success ? '✅' : '❌'} ${service}`);
  });

  console.log(`\n🎯 ${successCount}/${totalCount} Azure services initialized successfully`);

  if (successCount === totalCount) {
    console.log('🎉 All Azure services are ready!');
  } else {
    console.log('⚠️  Some services need configuration. Check the details above.');
  }

  return results;
}

// Test with actual API calls
async function testAzureAPIs() {
  console.log('\n🧪 Testing Azure APIs with real calls...\n');

  // Test Computer Vision with a sample image
  if (computerVisionService.getHealthStatus().healthy) {
    try {
      console.log('🖼️  Testing Computer Vision API...');
      // Using a sample food image URL for testing
      const testImageUrl = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=300';

      const analysis = await computerVisionService.analyzeProductImage(testImageUrl);
      console.log('✅ Computer Vision API - Working!');
      console.log(`   Description: ${analysis.description}`);
      console.log(`   Quality Score: ${analysis.qualityScore}/10`);
      console.log(`   Tags: ${analysis.tags.slice(0, 3).map(t => t.name).join(', ')}...`);
    } catch (error: any) {
      console.log('❌ Computer Vision API - Error:', error.message);
    }
  }

  // Test Azure OpenAI with a simple request
  if (openAIService.getHealthStatus().healthy) {
    try {
      console.log('\n🤖 Testing Azure OpenAI API...');

      const sampleData = {
        buyerHistory: {
          totalSamples: 5,
          conversionRate: 0.6,
          averageQualityScore: 8.2,
          preferredCategories: ['organic', 'vegetables']
        },
        product: {
          category: 'vegetables',
          price: 2.99,
          qualityScore: 8.5,
          certifications: ['organic', 'non-gmo']
        },
        sampleInteraction: {
          requestTime: new Date(),
          communicationFrequency: 3
        },
        supplierProfile: {
          rating: 4.5,
          reliabilityScore: 9.1,
          responseTime: 2
        }
      };

      const prediction = await openAIService.predictSampleConversion(sampleData);
      console.log('✅ Azure OpenAI API - Working!');
      console.log(`   Conversion Probability: ${(prediction.probability * 100).toFixed(1)}%`);
      console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(1)}%`);
      console.log(`   Positive Factors: ${prediction.factors.positive.length}`);
    } catch (error: any) {
      console.log('❌ Azure OpenAI API - Error:', error.message);
    }
  }

  console.log('\n🎉 Azure API testing completed!');
}

// Run initialization
if (require.main === module) {
  initializeAzureServices()
    .then(async (results) => {
      // If basic health checks pass, test actual APIs
      if (results.computerVision || results.openAI) {
        await testAzureAPIs();
      }

      const successCount = Object.values(results).filter(Boolean).length;
      process.exit(successCount > 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Initialization failed:', error);
      process.exit(1);
    });
}

export { initializeAzureServices };
