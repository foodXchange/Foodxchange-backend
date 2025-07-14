/**
 * Test Script for Recommendation Engine API
 * Tests all recommendation endpoints with real HTTP requests
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test data
const testRFQRequirements = {
  productCategory: 'organic vegetables',
  specifications: {
    organic: true,
    freshness: 'grade A',
    packaging: 'bulk'
  },
  quantity: 1000,
  deliveryLocation: 'New York, NY',
  requiredCertifications: ['USDA Organic', 'Non-GMO'],
  maxBudget: 5000,
  urgency: 'medium',
  qualityRequirements: ['pesticide-free', 'locally sourced'],
  limit: 5
};

const testSupplierRequirements = {
  productCategory: 'dairy products',
  requirements: {
    quantity: 500,
    maxBudget: 3000,
    deliveryLocation: 'Chicago, IL',
    requiredCertifications: ['FDA Approved'],
    urgency: 'high'
  },
  limit: 3
};

// Mock authentication token (you'll need to replace with real token)
const authToken = 'your-test-jwt-token-here';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${authToken}`
};

async function testRecommendationAPIs() {
  console.log('🚀 Starting Recommendation Engine API Tests...\n');

  try {
    // Test 1: Product Recommendations
    console.log('📦 Testing Product Recommendations...');
    try {
      const productResponse = await axios.post(
        `${BASE_URL}/recommendations/products`,
        testRFQRequirements,
        { headers, timeout: 30000 }
      );

      console.log('✅ Product Recommendations Response:');
      console.log(`  - Status: ${productResponse.status}`);
      console.log(`  - Recommendations Count: ${productResponse.data.data.recommendations.length}`);
      console.log(`  - Processing Time: ${productResponse.data.data.metadata.processingTime}ms`);
      
      if (productResponse.data.data.recommendations.length > 0) {
        const firstRec = productResponse.data.data.recommendations[0];
        console.log(`  - Top Recommendation: ${firstRec.productName} (Score: ${firstRec.score.score})`);
      }
    } catch (error) {
      console.log('❌ Product Recommendations Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 2: Supplier Recommendations
    console.log('🏭 Testing Supplier Recommendations...');
    try {
      const supplierResponse = await axios.post(
        `${BASE_URL}/recommendations/suppliers`,
        testSupplierRequirements,
        { headers, timeout: 30000 }
      );

      console.log('✅ Supplier Recommendations Response:');
      console.log(`  - Status: ${supplierResponse.status}`);
      console.log(`  - Recommendations Count: ${supplierResponse.data.data.recommendations.length}`);
      
      if (supplierResponse.data.data.recommendations.length > 0) {
        const firstSupplier = supplierResponse.data.data.recommendations[0];
        console.log(`  - Top Supplier: ${firstSupplier.supplierName} (Score: ${firstSupplier.score.score})`);
      }
    } catch (error) {
      console.log('❌ Supplier Recommendations Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 3: Similar Products
    console.log('🔍 Testing Similar Products...');
    try {
      const productId = '507f1f77bcf86cd799439011'; // Mock MongoDB ObjectId
      const similarResponse = await axios.get(
        `${BASE_URL}/recommendations/similar-products/${productId}?limit=3`,
        { headers, timeout: 30000 }
      );

      console.log('✅ Similar Products Response:');
      console.log(`  - Status: ${similarResponse.status}`);
      console.log(`  - Similar Products Count: ${similarResponse.data.data.similarProducts.length}`);
    } catch (error) {
      console.log('❌ Similar Products Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 4: Personalized Recommendations
    console.log('👤 Testing Personalized Recommendations...');
    try {
      const personalizedResponse = await axios.get(
        `${BASE_URL}/recommendations/personalized?limit=5`,
        { headers, timeout: 30000 }
      );

      console.log('✅ Personalized Recommendations Response:');
      console.log(`  - Status: ${personalizedResponse.status}`);
      console.log(`  - Recommendations Count: ${personalizedResponse.data.data.recommendations.length}`);
      console.log(`  - Based on Behavior: ${personalizedResponse.data.data.metadata.basedOnBehavior}`);
    } catch (error) {
      console.log('❌ Personalized Recommendations Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 5: Advanced Matching
    console.log('🎯 Testing Advanced Matching...');
    try {
      const advancedMatchingData = {
        requirements: {
          productCategory: 'grains',
          quantity: 2000,
          maxBudget: 8000,
          requiredCertifications: ['Organic'],
          deliveryLocation: { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'USA' },
          maxDeliveryTime: 5,
          urgency: 'high'
        },
        suppliers: [
          {
            id: 'supplier1',
            name: 'Premium Grains Co',
            location: { lat: 40.5, lng: -74.2, city: 'Newark', country: 'USA' },
            certifications: ['Organic', 'Non-GMO'],
            categories: ['grains', 'cereals'],
            averageRating: 4.7,
            responseTime: 3,
            fulfillmentRate: 0.92
          }
        ],
        products: [
          {
            id: 'product1',
            name: 'Organic Quinoa',
            category: 'grains',
            supplierId: 'supplier1',
            basePrice: 3.50,
            minimumOrder: 100,
            maximumOrder: 10000,
            certifications: ['Organic']
          }
        ],
        mode: 'both'
      };

      const advancedResponse = await axios.post(
        `${BASE_URL}/recommendations/advanced-matching`,
        advancedMatchingData,
        { headers, timeout: 30000 }
      );

      console.log('✅ Advanced Matching Response:');
      console.log(`  - Status: ${advancedResponse.status}`);
      console.log(`  - Mode: ${advancedResponse.data.data.metadata.mode}`);
      
      if (advancedResponse.data.data.suppliers) {
        console.log(`  - Supplier Matches: ${advancedResponse.data.data.suppliers.length}`);
      }
      if (advancedResponse.data.data.products) {
        console.log(`  - Product Matches: ${advancedResponse.data.data.products.length}`);
      }
    } catch (error) {
      console.log('❌ Advanced Matching Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 6: Feedback Tracking
    console.log('📊 Testing Feedback Tracking...');
    try {
      const feedbackData = {
        recommendationId: 'rec_test_123',
        action: 'click',
        metadata: {
          source: 'api_test',
          timestamp: new Date().toISOString()
        }
      };

      const feedbackResponse = await axios.post(
        `${BASE_URL}/recommendations/feedback`,
        feedbackData,
        { headers, timeout: 10000 }
      );

      console.log('✅ Feedback Tracking Response:');
      console.log(`  - Status: ${feedbackResponse.status}`);
      console.log(`  - Message: ${feedbackResponse.data.message}`);
    } catch (error) {
      console.log('❌ Feedback Tracking Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 7: Analytics
    console.log('📈 Testing Analytics...');
    try {
      const analyticsResponse = await axios.get(
        `${BASE_URL}/recommendations/analytics`,
        { headers, timeout: 10000 }
      );

      console.log('✅ Analytics Response:');
      console.log(`  - Status: ${analyticsResponse.status}`);
      console.log(`  - Total Recommendations: ${analyticsResponse.data.data.totalRecommendations}`);
      console.log(`  - Click Through Rate: ${(analyticsResponse.data.data.clickThroughRate * 100).toFixed(1)}%`);
      console.log(`  - Conversion Rate: ${(analyticsResponse.data.data.conversionRate * 100).toFixed(1)}%`);
    } catch (error) {
      console.log('❌ Analytics Failed:', getErrorMessage(error));
    }

    console.log('\n---\n');

    // Test 8: Server Health Check
    console.log('🏥 Testing Server Health...');
    try {
      const healthResponse = await axios.get('http://localhost:5000/api', { timeout: 5000 });
      
      console.log('✅ Server Health Check:');
      console.log(`  - Status: ${healthResponse.status}`);
      console.log(`  - API Name: ${healthResponse.data.name}`);
      console.log(`  - Endpoints Available: ${Object.keys(healthResponse.data.endpoints).length}`);
      console.log(`  - Recommendations Endpoint: ${healthResponse.data.endpoints.recommendations ? '✅' : '❌'}`);
    } catch (error) {
      console.log('❌ Server Health Check Failed:', getErrorMessage(error));
    }

    console.log('\n🎉 API Testing Complete!\n');

  } catch (error) {
    console.error('💥 Test Suite Failed:', error.message);
  }
}

// Test without authentication (for endpoints that might not require it)
async function testPublicEndpoints() {
  console.log('🌐 Testing Public Endpoints...\n');

  try {
    // Test server info endpoint
    const serverInfo = await axios.get('http://localhost:5000/api', { timeout: 5000 });
    console.log('✅ Server Info Retrieved:');
    console.log(`  - API Version: ${serverInfo.data.version}`);
    console.log(`  - Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  - Available Endpoints: ${Object.keys(serverInfo.data.endpoints).join(', ')}`);
  } catch (error) {
    console.log('❌ Public Endpoints Test Failed:', getErrorMessage(error));
  }
}

// Performance test
async function performanceTest() {
  console.log('⚡ Running Performance Tests...\n');

  const testCases = [
    { name: 'Quick Product Recommendation', limit: 3 },
    { name: 'Medium Product Recommendation', limit: 10 },
    { name: 'Large Product Recommendation', limit: 20 }
  ];

  for (const testCase of testCases) {
    try {
      const startTime = Date.now();
      
      const response = await axios.post(
        `${BASE_URL}/recommendations/products`,
        { ...testRFQRequirements, limit: testCase.limit },
        { headers, timeout: 60000 }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`✅ ${testCase.name}:`);
      console.log(`  - Duration: ${duration}ms`);
      console.log(`  - Results: ${response.data.data.recommendations.length}`);
      console.log(`  - Performance: ${duration < 5000 ? '🟢 Good' : duration < 10000 ? '🟡 Acceptable' : '🔴 Slow'}`);
    } catch (error) {
      console.log(`❌ ${testCase.name} Failed:`, getErrorMessage(error));
    }
  }
}

function getErrorMessage(error) {
  if (error.response) {
    return `HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText}`;
  } else if (error.request) {
    return 'No response received from server';
  } else {
    return error.message;
  }
}

// Main execution
async function runAllTests() {
  console.log('🔬 FoodXchange Recommendation Engine API Test Suite');
  console.log('================================================\n');

  // Test public endpoints first
  await testPublicEndpoints();
  console.log('\n---\n');

  // Test authenticated endpoints
  await testRecommendationAPIs();
  console.log('\n---\n');

  // Run performance tests
  await performanceTest();

  console.log('\n📋 Test Summary:');
  console.log('================');
  console.log('• If you see authentication errors, update the authToken variable');
  console.log('• If you see connection errors, ensure the server is running on port 5000');
  console.log('• Performance tests help identify bottlenecks');
  console.log('• All tests simulate real API usage patterns');
  console.log('\n💡 Next Steps:');
  console.log('• Implement missing endpoints that failed');
  console.log('• Add proper authentication handling');
  console.log('• Optimize slow-performing endpoints');
  console.log('• Add error handling for edge cases');
}

// Export for use in other scripts
module.exports = {
  testRecommendationAPIs,
  testPublicEndpoints,
  performanceTest,
  runAllTests
};

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}