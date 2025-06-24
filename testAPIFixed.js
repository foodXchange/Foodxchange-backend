// testAPIFixed.js - Fixed API test
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

const testAPI = async () => {
  try {
    console.log('🧪 Testing FoodXchange API...\n');

    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get('http://localhost:5000/health');
    console.log('✅ Health check passed\n');

    // Show available test accounts
    console.log('2. Available test accounts:');
    console.log('   - buyer@foodxchange.com / test123');
    console.log('   - seller@foodxchange.com / test123');
    console.log('   - admin@foodxchange.com / test123\n');

    // Test login with each account
    console.log('3. Testing login with buyer account...');
    try {
      const buyerLogin = await axios.post(`${API_URL}/auth/login`, {
        email: 'buyer@foodxchange.com',
        password: 'test123'
      });
      console.log('✅ Buyer login successful!');
      console.log('   Token:', buyerLogin.data.token ? 'Generated' : 'Missing');
      console.log('   User:', buyerLogin.data.name);
      console.log('   Role:', buyerLogin.data.role);
      
      const buyerToken = buyerLogin.data.token;

      // Test authenticated endpoints
      console.log('\n4. Testing authenticated endpoints with buyer token...');
      
      // Get RFQs
      const rfqs = await axios.get(`${API_URL}/rfqs`, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      console.log('✅ RFQs endpoint working. Total RFQs:', rfqs.data.total);

      // Get Companies
      const companies = await axios.get(`${API_URL}/companies`, {
        headers: { Authorization: `Bearer ${buyerToken}` }
      });
      console.log('✅ Companies endpoint working. Total companies:', companies.data.total);

    } catch (loginError) {
      console.error('❌ Buyer login failed:', loginError.response?.data || loginError.message);
    }

    // Test products endpoint (public)
    console.log('\n5. Testing public products endpoint...');
    const products = await axios.get(`${API_URL}/products`);
    console.log('✅ Products endpoint working. Total products:', products.data.total);
    console.log('   Sample products:');
    products.data.products.slice(0, 3).forEach(p => {
      console.log(`   - ${p.name} (${p.category})`);
    });

    console.log('\n✅ API tests completed!');
    
  } catch (error) {
    console.error('\n❌ API test failed:', error.response?.data || error.message);
  }
};

testAPI();
