const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'FoodXchange API is running!' });
});

// Seller login route
app.post('/api/seller/login', (req, res) => {
  const { email, password } = req.body;
  
  // Test account
  if (email === 'demo@supplier.com' && password === 'TempPass123!') {
    res.json({
      success: true,
      token: 'test-token-123',
      seller: {
        id: '1',
        companyName: 'Demo Supplier Company',
        email: email,
        country: 'Italy'
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   API available at: http://localhost:${PORT}`);
});
