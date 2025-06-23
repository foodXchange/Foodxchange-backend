const axios = require('axios');

async function testAuth() {
  try {
    console.log('Testing authentication endpoint...\n');
    
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'buyer@test.com',
      password: 'password123'
    });
    
    console.log('✅ Authentication test successful!');
    console.log('Token:', response.data.token.substring(0, 20) + '...');
    console.log('User:', response.data.user);
    
  } catch (error) {
    if (error.response) {
      console.log('❌ Authentication failed:', error.response.data.message);
    } else {
      console.log('❌ Cannot connect to backend. Make sure it\'s running on port 5000');
    }
  }
}

setTimeout(testAuth, 2000);
