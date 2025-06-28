const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.log('⚠️  Continuing without MongoDB - using demo data');
  }
};

// Connect to database (non-blocking)
connectDB();

// ===== AUTHENTICATION ENDPOINTS =====

// Login endpoint (essential for your login page)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  console.log('🔐 Login attempt:', { email, password: '***' });
  
  if (email === 'demo@foodxchange.com' && password === 'demo123') {
    res.json({
      success: true,
      data: {
        token: 'demo-token-' + Date.now(),
        user: { 
          id: '1', 
          email, 
          name: 'Demo User',
          company: 'Demo Company' 
        }
      },
      message: 'Login successful'
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid credentials. Use: demo@foodxchange.com / demo123' 
    });
  }
});

// Register endpoint
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, company } = req.body;
  
  res.json({
    success: true,
    data: {
      token: 'demo-token-' + Date.now(),
      user: { id: Date.now().toString(), email, name, company }
    },
    message: 'Registration successful'
  });
});

// ===== HEALTH CHECK ENDPOINT =====
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FoodXchange Backend',
    timestamp: new Date().toISOString()
  });
});

// ===== RFQ ENDPOINTS =====
app.get('/api/rfqs', (req, res) => {
  const { status } = req.query;
  
  const sampleRFQs = [
    {
      id: '1',
      title: 'Organic Coffee Beans - 1000kg',
      description: 'Looking for high-quality organic coffee beans',
      status: status || 'published',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      products: [
        { name: 'Arabica Coffee Beans', quantity: 1000, unit: 'kg' }
      ]
    },
    {
      id: '2', 
      title: 'Fresh Vegetables - Weekly Supply',
      description: 'Weekly supply of fresh vegetables for restaurant chain',
      status: 'draft',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      products: [
        { name: 'Fresh Tomatoes', quantity: 500, unit: 'kg' },
        { name: 'Fresh Lettuce', quantity: 200, unit: 'kg' }
      ]
    }
  ];
  
  res.json({
    success: true,
    data: sampleRFQs,
    total: sampleRFQs.length
  });
});

app.post('/api/rfqs', (req, res) => {
  const rfqData = req.body;
  
  res.json({
    success: true,
    data: {
      id: Date.now().toString(),
      ...rfqData,
      status: 'draft',
      createdAt: new Date().toISOString()
    },
    message: 'RFQ created successfully'
  });
});

// ===== PRODUCT ENDPOINTS =====
app.get('/api/products', (req, res) => {
  const sampleProducts = [
    {
      id: '1',
      name: 'Premium Arabica Coffee Beans',
      description: 'High-quality organic coffee beans from Ethiopia',
      price: 15.99,
      unit: 'kg',
      minOrder: 50,
      supplier: {
        id: '1',
        name: 'Global Coffee Suppliers',
        verified: true,
        rating: 4.8
      },
      certifications: ['Organic', 'Fair Trade'],
      images: ['https://via.placeholder.com/300x200']
    },
    {
      id: '2',
      name: 'Fresh Organic Tomatoes',
      description: 'Locally grown organic tomatoes',
      price: 3.50,
      unit: 'kg',
      minOrder: 100,
      supplier: {
        id: '2',
        name: 'Farm Fresh Produce',
        verified: true,
        rating: 4.6
      },
      certifications: ['Organic'],
      images: ['https://via.placeholder.com/300x200']
    }
  ];
  
  res.json({
    success: true,
    data: sampleProducts,
    total: sampleProducts.length
  });
});

// ===== SUPPLIER ENDPOINTS =====
app.get('/api/suppliers', (req, res) => {
  const sampleSuppliers = [
    {
      id: '1',
      name: 'Global Coffee Suppliers',
      description: 'Leading supplier of premium coffee beans worldwide',
      verified: true,
      rating: 4.8,
      categories: ['Coffee', 'Beverages'],
      certifications: ['ISO 9001', 'Organic'],
      totalProducts: 150,
      responseTime: '< 2 hours',
      website: 'https://globalcoffee.com'
    },
    {
      id: '2',
      name: 'Farm Fresh Produce',
      description: 'Local organic farm specializing in fresh vegetables',
      verified: true,
      rating: 4.6,
      categories: ['Vegetables', 'Organic'],
      certifications: ['Organic', 'Local'],
      totalProducts: 75,
      responseTime: '< 4 hours',
      website: 'https://farmfresh.com'
    }
  ];
  
  res.json({
    success: true,
    data: sampleSuppliers,
    total: sampleSuppliers.length
  });
});

// ===== ORDER ENDPOINTS =====
app.get('/api/orders', (req, res) => {
  const sampleOrders = [
    {
      id: '1',
      status: 'delivered',
      expectedDelivery: '2024-01-15',
      actualDelivery: '2024-01-14',
      trackingNumber: 'TRK123456789'
    },
    {
      id: '2',
      status: 'shipped',
      expectedDelivery: '2024-01-20',
      trackingNumber: 'TRK987654321'
    }
  ];
  
  res.json({
    success: true,
    data: sampleOrders,
    total: sampleOrders.length
  });
});

// ===== AI ENDPOINTS =====
app.get('/api/ai/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'operational',
      features: ['supplier-matching', 'demand-forecasting', 'price-optimization'],
      lastUpdated: new Date().toISOString()
    }
  });
});

app.post('/api/ai/match-suppliers', (req, res) => {
  const { requirements } = req.body;
  
  res.json({
    success: true,
    data: {
      matches: [
        { supplierId: '1', confidence: 0.95, reasons: ['High rating', 'Certified organic'] },
        { supplierId: '2', confidence: 0.87, reasons: ['Local supplier', 'Fast delivery'] }
      ],
      confidence: 0.91,
      recommendations: ['Consider bulk pricing', 'Check seasonal availability']
    }
  });
});

// ===== DEFAULT AND ERROR ROUTES =====

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'FoodXchange Backend API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      rfqs: '/api/rfqs',
      products: '/api/products',
      suppliers: '/api/suppliers',
      orders: '/api/orders',
      ai: '/api/ai/*'
    },
    documentation: 'https://docs.foodxchange.com'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    availableRoutes: [
      '/',
      '/health', 
      '/api/auth/login',
      '/api/rfqs',
      '/api/products',
      '/api/suppliers',
      '/api/orders',
      '/api/ai/status'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Start server
const PORT = 5000;  // Force port 5000
app.listen(PORT, () => {
  console.log(`🚀 FoodXchange Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login endpoint: http://localhost:${PORT}/api/auth/login`);
  console.log(`🤖 AI endpoints: http://localhost:${PORT}/api/ai/status`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('📋 Demo Credentials:');
  console.log('   Email: demo@foodxchange.com');
  console.log('   Password: demo123');
});