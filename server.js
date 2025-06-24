const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./src/config/db');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use(cors());

// Mount routes
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const rfqRoutes = require('./src/routes/rfqs');
const orderRoutes = require('./src/routes/orders');
const companyRoutes = require('./src/routes/companies');
const requestRoutes = require('./src/routes/requests');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rfqs', rfqRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/requests', requestRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'FoodXchange API is running!',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Error handler middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║          FoodXchange API Server               ║
║                                               ║
║  Status: Running ✅                           ║
║  Port: ${PORT}                                  ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
║  Database: MongoDB                            ║
║                                               ║
║  API Endpoints:                               ║
║  - /api/auth     (Authentication)             ║
║  - /api/products (Product catalog)            ║
║  - /api/rfqs     (Request for quotations)     ║
║  - /api/orders   (Order management)           ║
║  - /api/companies (Company profiles)          ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});
