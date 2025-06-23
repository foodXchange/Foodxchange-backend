const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Enable CORS for all origins during development
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'FoodXchange Backend API is running!',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/login'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    service: 'FoodXchange API',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected successfully');
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err);
});

// Import routes
try {
  const authRoutes = require('./src/routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded');
} catch (err) {
  console.warn('⚠️  Auth routes not found, creating mock endpoint');
  // Mock auth endpoint for testing
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt:', email);

    // Mock successful login for testing
    if (email === 'buyer@test.com' && password === 'password123') {
      res.json({
        message: 'Login successful',
        token: 'mock-jwt-token-' + Date.now(),
        user: {
          id: '1',
          name: 'Test Buyer',
          email: 'buyer@test.com',
          role: 'buyer'
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });
}

// Import and use other routes outside the try-catch
const productsRoutes = require('./src/routes/products');
const requestsRoutes = require('./src/routes/requests');
const ordersRoutes = require('./src/routes/orders');
const rfqRoutes = require('./src/routes/rfqs');
const proposalRoutes = require('./src/routes/proposals');

app.use('/api/rfqs', rfqRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/orders', ordersRoutes);

app.use('/api/products', productsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/rfqs', requestsRoutes); // Alias for requests
app.use('/api/orders', ordersRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.path);
  res.status(404).json({ message: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         FoodXchange Backend Server Started! ✓                ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}                           ║
║  MongoDB: ${MONGODB_URI}  ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});
