// simpleLoginTest.js - Direct login test
const axios = require('axios');

const testLogin = async () => {
  console.log('Testing login with buyer@foodxchange.com / test123\n');
  
  try {
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'buyer@foodxchange.com',
      password: 'test123'
    });
    
    console.log('✅ LOGIN SUCCESSFUL!');
    console.log('User:', response.data.name);
    console.log('Role:', response.data.role);
    console.log('Token:', response.data.token ? 'Generated' : 'Missing');
    
  } catch (error) {
    console.log('❌ LOGIN FAILED');
    console.log('Error:', error.response?.data?.message || error.message);
    
    if (error.response?.status === 401) {
      console.log('\nTroubleshooting tips:');
      console.log('1. Make sure server is running (npm start)');
      console.log('2. Run: node resetPasswords.js');
      console.log('3. Restart the server');
      console.log('4. Try this test again');
    }
  }
};

testLogin();
