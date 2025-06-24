// simpleTest.js - Simple API test
const axios = require('axios');

const testHealth = async () => {
  try {
    console.log('Testing health endpoint...');
    const response = await axios.get('http://localhost:5000/health');
    console.log('✅ API is running!', response.data);
  } catch (error) {
    console.error('❌ API is not running. Start the server first with: npm start');
  }
};

setTimeout(testHealth, 1000);
