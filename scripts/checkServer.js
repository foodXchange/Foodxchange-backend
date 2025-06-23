// scripts/checkServer.js
const http = require('http');

function checkServer() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/health',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log('✅ Server is running on port 5000');
    } else {
      console.log('⚠️ Server responded with status:', res.statusCode);
    }
  });

  req.on('error', (err) => {
    console.log('❌ Server is not running on port 5000');
    console.log('💡 Run: node server-search.js');
  });

  req.end();
}

checkServer();
