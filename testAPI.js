// testAPI.js - Test API endpoints
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const testAPI = async () => {
  try {
    console.log('🧪 Testing FoodXchange API...\n');

    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get('http://localhost:5000/health');
    console.log('✅ Health check:', health.data);

    // Test login
    console.log('\n2. Testing login...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'buyer@foodxchange.com',
      password: 'test123'
    });
    console.log('✅ Login successful:', {
      user: loginResponse.data.name,
      role: loginResponse.data.role
    });

    const token = loginResponse.data.token;
    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    // Test products endpoint
    console.log('\n3. Testing products endpoint...');
    const products = await axios.get(`${API_URL}/products`);
    console.log('✅ Products endpoint working. Total products:', products.data.total);

    // Test RFQs endpoint
    console.log('\n4. Testing RFQs endpoint...');
    const rfqs = await axios.get(`${API_URL}/rfqs`, authHeader);
    console.log('✅ RFQs endpoint working. Total RFQs:', rfqs.data.total);

    console.log('\n✅ All API tests passed!');
    
  } catch (error) {
    console.error('\n❌ API test failed:', error.response?.data || error.message);
  }
};

testAPI();
