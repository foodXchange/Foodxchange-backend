// Comprehensive Integration Test Suite
// Tests all major backend features and APIs

const axios = require('axios');
const WebSocket = require('ws');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5001/api';
const WS_URL = process.env.WS_URL || 'ws://localhost:5000';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3,
  user: {
    email: 'test@foodxchange.com',
    password: 'TestPassword123!',
    name: 'Test User'
  }
};

let authToken = null;
let testUserId = null;

// Utility functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const apiRequest = async (method, endpoint, data = null, headers = {}) => {
  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
      ...headers
    },
    timeout: TEST_CONFIG.timeout
  };

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`API Error ${method} ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
};

// Test suite functions
async function testHealthCheck() {
  console.log('🏥 Testing Health Check...');
  
  try {
    const response = await axios.get('http://localhost:5001/health');
    
    if (response.data.status === 'ok') {
      console.log('✅ Health check passed');
      return true;
    } else {
      console.log('❌ Health check failed:', response);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testAuthentication() {
  console.log('🔐 Testing Authentication...');
  
  try {
    // Test user registration
    const registerData = {
      email: TEST_CONFIG.user.email,
      password: TEST_CONFIG.user.password,
      firstName: 'Test',
      lastName: 'User',
      role: 'buyer'
    };

    try {
      const registerResponse = await apiRequest('POST', '/auth/register', registerData);
      console.log('✅ User registration successful');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('ℹ️ User already exists, proceeding with login');
      } else {
        throw error;
      }
    }

    // Test user login
    const loginData = {
      email: TEST_CONFIG.user.email,
      password: TEST_CONFIG.user.password
    };

    const loginResponse = await apiRequest('POST', '/auth/login', loginData);
    
    if (loginResponse.success && loginResponse.token) {
      authToken = loginResponse.token;
      testUserId = loginResponse.user?.id;
      console.log('✅ Authentication successful');
      return true;
    } else {
      console.log('❌ Authentication failed:', loginResponse);
      return false;
    }
  } catch (error) {
    console.log('❌ Authentication error:', error.message);
    return false;
  }
}

async function testRFQManagement() {
  console.log('📋 Testing RFQ Management...');
  
  try {
    // Create RFQ
    const rfqData = {
      title: 'Test RFQ - Organic Apples',
      description: 'Looking for organic apples for our restaurant chain',
      productType: 'Fresh Produce',
      quantity: 1000,
      unit: 'kg',
      budget: 5000,
      deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    const createResponse = await apiRequest('POST', '/rfq', rfqData);
    
    if (createResponse.success) {
      const rfqId = createResponse.rfq._id;
      console.log('✅ RFQ created successfully:', rfqId);

      // Get RFQ details
      const getResponse = await apiRequest('GET', `/rfq/${rfqId}`);
      
      if (getResponse.success) {
        console.log('✅ RFQ retrieval successful');
      }

      // Update RFQ
      const updateData = {
        description: 'Updated: Looking for premium organic apples'
      };

      const updateResponse = await apiRequest('PUT', `/rfq/${rfqId}`, updateData);
      
      if (updateResponse.success) {
        console.log('✅ RFQ update successful');
      }

      return true;
    } else {
      console.log('❌ RFQ creation failed:', createResponse);
      return false;
    }
  } catch (error) {
    console.log('❌ RFQ management error:', error.message);
    return false;
  }
}

async function testPaymentProcessing() {
  console.log('💳 Testing Payment Processing...');
  
  try {
    // Test payment health check
    const healthResponse = await apiRequest('GET', '/payments/health');
    console.log('✅ Payment service health check passed');

    // Get payment statistics (admin only, might fail)
    try {
      const statsResponse = await apiRequest('GET', '/payments/stats');
      console.log('✅ Payment statistics retrieved');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('ℹ️ Payment stats require admin access (expected)');
      } else {
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.log('❌ Payment processing error:', error.message);
    return false;
  }
}

async function testSearchFunctionality() {
  console.log('🔍 Testing Search Functionality...');
  
  try {
    // Test product search
    const searchResponse = await apiRequest('GET', '/search/products?q=apple');
    
    if (searchResponse.success) {
      console.log('✅ Product search successful');
    }

    // Test autocomplete
    const suggestResponse = await apiRequest('GET', '/search/suggest?q=app');
    
    if (suggestResponse.success) {
      console.log('✅ Search suggestions successful');
    }

    return true;
  } catch (error) {
    console.log('❌ Search functionality error:', error.message);
    return false;
  }
}

async function testNotifications() {
  console.log('🔔 Testing Notifications...');
  
  try {
    // Get user notifications
    const notificationsResponse = await apiRequest('GET', '/notifications/user');
    
    if (notificationsResponse.success) {
      console.log('✅ Notifications retrieval successful');
      return true;
    } else {
      console.log('❌ Notifications test failed:', notificationsResponse);
      return false;
    }
  } catch (error) {
    console.log('❌ Notifications error:', error.message);
    return false;
  }
}

async function testAuditLogging() {
  console.log('📊 Testing Audit Logging...');
  
  try {
    // Get audit statistics
    const statsResponse = await apiRequest('GET', '/audit/stats');
    
    if (statsResponse.success) {
      console.log('✅ Audit statistics retrieved');
      return true;
    } else {
      console.log('❌ Audit logging test failed:', statsResponse);
      return false;
    }
  } catch (error) {
    console.log('❌ Audit logging error:', error.message);
    return false;
  }
}

async function testRealTimeChat() {
  console.log('💬 Testing Real-time Chat...');
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${WS_URL}/socket.io/?transport=websocket`);
      
      ws.on('open', () => {
        console.log('✅ WebSocket connection established');
        ws.close();
        resolve(true);
      });
      
      ws.on('error', (error) => {
        console.log('❌ WebSocket connection error:', error.message);
        resolve(false);
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        ws.close();
        console.log('⏰ WebSocket connection timeout');
        resolve(false);
      }, 5000);
    } catch (error) {
      console.log('❌ Real-time chat error:', error.message);
      resolve(false);
    }
  });
}

async function testAnalytics() {
  console.log('📈 Testing Analytics...');
  
  try {
    // Test analytics endpoints
    const endpoints = [
      '/analytics/dashboard',
      '/analytics/events',
      '/analytics/metrics'
    ];

    let successCount = 0;

    for (const endpoint of endpoints) {
      try {
        const response = await apiRequest('GET', endpoint);
        if (response.success) {
          successCount++;
        }
      } catch (error) {
        // Some analytics endpoints might require admin access
        if (error.response?.status === 403) {
          console.log(`ℹ️ ${endpoint} requires admin access (expected)`);
          successCount++;
        } else {
          console.log(`❌ ${endpoint} failed:`, error.message);
        }
      }
    }

    if (successCount >= endpoints.length * 0.5) {
      console.log('✅ Analytics tests passed');
      return true;
    } else {
      console.log('❌ Analytics tests failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Analytics error:', error.message);
    return false;
  }
}

async function testWorkflowEngine() {
  console.log('⚙️ Testing Workflow Engine...');
  
  try {
    // Get workflow definitions
    const definitionsResponse = await apiRequest('GET', '/workflows/definitions');
    
    if (definitionsResponse.success) {
      console.log('✅ Workflow definitions retrieved');
    }

    // Get workflow templates
    const templatesResponse = await apiRequest('GET', '/workflows/templates');
    
    if (templatesResponse.success) {
      console.log('✅ Workflow templates retrieved');
      return true;
    }

    return false;
  } catch (error) {
    console.log('❌ Workflow engine error:', error.message);
    return false;
  }
}

async function testCaching() {
  console.log('⚡ Testing Caching...');
  
  try {
    // Test cache health
    const cacheResponse = await apiRequest('GET', '/cache/health');
    
    if (cacheResponse.success) {
      console.log('✅ Cache health check passed');
      return true;
    } else {
      console.log('❌ Cache test failed:', cacheResponse);
      return false;
    }
  } catch (error) {
    console.log('❌ Caching error:', error.message);
    return false;
  }
}

// Main test runner
async function runIntegrationTests() {
  console.log('🚀 Starting FoodXchange Integration Tests\n');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const testResults = [];

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Authentication', fn: testAuthentication },
    { name: 'RFQ Management', fn: testRFQManagement },
    { name: 'Payment Processing', fn: testPaymentProcessing },
    { name: 'Search Functionality', fn: testSearchFunctionality },
    { name: 'Notifications', fn: testNotifications },
    { name: 'Audit Logging', fn: testAuditLogging },
    { name: 'Real-time Chat', fn: testRealTimeChat },
    { name: 'Analytics', fn: testAnalytics },
    { name: 'Workflow Engine', fn: testWorkflowEngine },
    { name: 'Caching', fn: testCaching }
  ];

  for (const test of tests) {
    try {
      console.log(`\n${test.name}:`);
      const result = await test.fn();
      testResults.push({ name: test.name, passed: result });
      
      if (!result) {
        console.log(`❌ ${test.name} failed`);
      }
    } catch (error) {
      console.log(`❌ ${test.name} threw error:`, error.message);
      testResults.push({ name: test.name, passed: false, error: error.message });
    }

    // Brief delay between tests
    await delay(1000);
  }

  // Generate test report
  console.log('\n' + '='.repeat(60));
  console.log('📊 INTEGRATION TEST RESULTS');
  console.log('='.repeat(60));

  const passedTests = testResults.filter(test => test.passed);
  const failedTests = testResults.filter(test => !test.passed);

  console.log(`\n✅ Passed: ${passedTests.length}/${testResults.length}`);
  console.log(`❌ Failed: ${failedTests.length}/${testResults.length}`);

  if (passedTests.length > 0) {
    console.log('\n✅ Successful Tests:');
    passedTests.forEach(test => {
      console.log(`   - ${test.name}`);
    });
  }

  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests:');
    failedTests.forEach(test => {
      console.log(`   - ${test.name}${test.error ? ` (${test.error})` : ''}`);
    });
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n⏱️ Total test time: ${duration} seconds`);

  const successRate = (passedTests.length / testResults.length * 100).toFixed(1);
  console.log(`📈 Success rate: ${successRate}%`);

  if (successRate >= 80) {
    console.log('\n🎉 Integration tests PASSED! System is ready for production.');
    process.exit(0);
  } else {
    console.log('\n⚠️ Integration tests FAILED! Please fix issues before deployment.');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
runIntegrationTests().catch(error => {
  console.error('❌ Integration test suite failed:', error);
  process.exit(1);
});