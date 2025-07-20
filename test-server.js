require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'FoodXchange API',
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Basic API info
app.get('/api', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/api',
      '/api/auth/login',
      '/api/auth/register',
      '/api/products',
      '/api/rfqs',
      '/api/orders'
    ]
  });
});

// Test auth endpoint
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }
  
  // Mock successful login
  if (email === 'test@example.com' && password === 'password123') {
    return res.json({
      success: true,
      token: 'mock-jwt-token-' + Date.now(),
      user: {
        id: '123',
        email: email,
        name: 'Test User',
        role: 'buyer'
      }
    });
  }
  
  res.status(401).json({
    success: false,
    message: 'Invalid credentials'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
✅ Test server running successfully!
📍 Port: ${PORT}
🏥 Health: http://localhost:${PORT}/health
📚 API: http://localhost:${PORT}/api
🔐 Login: POST http://localhost:${PORT}/api/auth/login
  `);
});