const http = require('http');

// Test search for rice
const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/search?query=rice',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Search results for "rice":');
    console.log('Total found:', result.results ? result.results.length : 0);
    if (result.results && result.results.length > 0) {
      console.log('\nProducts found:');
      result.results.forEach(product => {
        console.log(`- ${product.name || product.title}`);
      });
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.end();
