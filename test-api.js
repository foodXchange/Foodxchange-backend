const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';
let authToken = '';
let userId = '';
let productId = '';
let rfqId = '';
let proposalId = '';
let orderId = '';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Helper function to make requests
async function testEndpoint(method, endpoint, data = null, useAuth = false) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {}
    };

    if (useAuth && authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (data) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    const response = await axios(config);
    console.log(`${colors.green}✓${colors.reset} ${method} ${endpoint}`);
    return response.data;
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} ${method} ${endpoint} - ${error.response?.data?.error || error.message}`);
    return null;
  }
}

// Test functions
async function testAuth() {
  console.log(`\n${colors.blue}=== Testing Authentication ===${colors.reset}`);
  
  // Register buyer
  const buyerReg = await testEndpoint('POST', '/auth/register', {
    email: `buyer_${Date.now()}@test.com`,
    password: 'test123',
    name: 'Test Buyer',
    company: 'Buyer Corp',
    role: 'buyer'
  });

  // Register supplier
  const supplierReg = await testEndpoint('POST', '/auth/register', {
    email: `supplier_${Date.now()}@test.com`,
    password: 'test123',
    name: 'Test Supplier',
    company: 'Supplier Corp',
    role: 'supplier'
  });

  // Login
  const loginRes = await testEndpoint('POST', '/auth/login', {
    email: supplierReg?.data?.user?.email || 'test@example.com',
    password: 'test123'
  });

  if (loginRes?.data?.token) {
    authToken = loginRes.data.token;
    userId = loginRes.data.user.id;
    console.log(`${colors.green}✓ Got auth token${colors.reset}`);
  }

  // Test protected route
  await testEndpoint('GET', '/auth/me', null, true);
  await testEndpoint('PUT', '/auth/update-password', {
    currentPassword: 'test123',
    newPassword: 'test456'
  }, true);
}

async function testProducts() {
  console.log(`\n${colors.blue}=== Testing Products ===${colors.reset}`);
  
  // Public endpoints
  await testEndpoint('GET', '/products');
  await testEndpoint('GET', '/products/categories');
  
  // Create product (protected)
  const product = await testEndpoint('POST', '/products', {
    name: 'Premium Tomatoes',
    description: 'Fresh organic tomatoes',
    price: 50,
    unit: 'kg',
    category: 'Vegetables',
    minOrderQuantity: 10,
    tags: ['organic', 'fresh', 'premium']
  }, true);

  if (product?.data?._id) {
    productId = product.data._id;
  }

  // Get single product
  if (productId) {
    await testEndpoint('GET', `/products/${productId}`);
    
    // Update product
    await testEndpoint('PUT', `/products/${productId}`, {
      price: 45,
      description: 'Updated description'
    }, true);

    // Request sample
    await testEndpoint('POST', `/products/${productId}/sample-request`, {
      quantity: 1,
      message: 'Would like to test quality'
    }, true);
  }
}

async function testRFQs() {
  console.log(`\n${colors.blue}=== Testing RFQs ===${colors.reset}`);
  
  // Get RFQs (public)
  await testEndpoint('GET', '/rfq');
  
  // Create RFQ
  const rfq = await testEndpoint('POST', '/rfq', {
    title: 'Need 100kg Premium Tomatoes',
    description: 'Looking for organic tomatoes for our restaurant',
    category: 'Vegetables',
    quantity: 100,
    unit: 'kg',
    deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    targetPrice: 4000,
    deliveryLocation: 'New York, USA'
  }, true);

  if (rfq?.data?._id) {
    rfqId = rfq.data._id;
  }

  if (rfqId) {
    // Get single RFQ
    await testEndpoint('GET', `/rfq/${rfqId}`);
    
    // Update RFQ
    await testEndpoint('PUT', `/rfq/${rfqId}`, {
      quantity: 150,
      targetPrice: 6000
    }, true);

    // Submit proposal (as supplier)
    const proposal = await testEndpoint('POST', `/rfq/${rfqId}/proposal`, {
      totalPrice: 5500,
      pricePerUnit: 36.67,
      deliveryTerms: 'FOB',
      paymentTerms: 'Net 30',
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      notes: 'Premium quality guaranteed'
    }, true);

    if (proposal?.data?._id) {
      proposalId = proposal.data._id;
    }
  }
}

async function testOrders() {
  console.log(`\n${colors.blue}=== Testing Orders ===${colors.reset}`);
  
  // Create order from RFQ
  if (rfqId && proposalId) {
    const order = await testEndpoint('POST', '/orders/from-rfq', {
      rfqId,
      proposalId
    }, true);

    if (order?.data?._id) {
      orderId = order.data._id;
    }
  }

  // Get orders
  await testEndpoint('GET', '/orders', null, true);
  await testEndpoint('GET', '/orders/analytics?period=30d', null, true);

  if (orderId) {
    // Get single order
    await testEndpoint('GET', `/orders/${orderId}`, null, true);
    
    // Update order status
    await testEndpoint('PUT', `/orders/${orderId}/status`, {
      status: 'confirmed',
      notes: 'Order confirmed by supplier'
    }, true);

    // Add shipment tracking
    await testEndpoint('POST', `/orders/${orderId}/shipment`, {
      carrier: 'FedEx',
      trackingNumber: 'FX123456789',
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    }, true);
  }
}

async function testAI() {
  console.log(`\n${colors.blue}=== Testing AI Features ===${colors.reset}`);
  
  // Test AI endpoints
  await testEndpoint('POST', '/ai/analyze-product-image', {
    imageUrl: 'https://example.com/tomato.jpg',
    productType: 'vegetable'
  }, true);

  await testEndpoint('POST', '/ai/extract-document', {
    documentUrl: 'https://example.com/invoice.pdf',
    documentType: 'invoice'
  }, true);

  if (rfqId) {
    await testEndpoint('POST', '/ai/match-rfq', {
      rfqId
    }, true);
  }

  await testEndpoint('POST', '/ai/pricing-suggestion', {
    productName: 'Tomatoes',
    category: 'Vegetables',
    quantity: 100,
    currentPrice: 50
  }, true);

  await testEndpoint('POST', '/ai/check-compliance', {
    documentUrl: 'https://example.com/certificate.pdf',
    productCategory: 'Vegetables',
    targetMarket: 'USA'
  }, true);

  await testEndpoint('POST', '/ai/generate-description', {
    productName: 'Premium Organic Tomatoes',
    category: 'Vegetables',
    features: ['organic', 'non-GMO', 'locally grown'],
    targetAudience: 'restaurants'
  }, true);
}

async function testCompliance() {
  console.log(`\n${colors.blue}=== Testing Compliance ===${colors.reset}`);
  
  await testEndpoint('POST', '/compliance/check', {
    productType: 'food',
    targetMarket: 'USA',
    ingredients: ['tomatoes', 'salt']
  });
}

async function testSuppliers() {
  console.log(`\n${colors.blue}=== Testing Suppliers ===${colors.reset}`);
  
  await testEndpoint('GET', '/suppliers');
}

// Main test runner
async function runAllTests() {
  console.log(`${colors.yellow}Starting API Tests...${colors.reset}`);
  console.log(`API Base: ${API_BASE}`);
  
  try {
    // Check if server is running
    const health = await testEndpoint('GET', '/health');
    if (!health) {
      console.log(`${colors.red}Server is not running! Please start the server first.${colors.reset}`);
      return;
    }

    // Run all test suites
    await testAuth();
    await testProducts();
    await testRFQs();
    await testOrders();
    await testAI();
    await testCompliance();
    await testSuppliers();

    console.log(`\n${colors.green}✅ All tests completed!${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Test suite failed:${colors.reset}`, error.message);
  }
}

// Run tests
runAllTests();