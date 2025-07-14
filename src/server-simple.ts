import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB Connection
const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Continue running without DB for now
  }
};

// Connect to database
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// API Info route
app.get('/api', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      rfqs: '/api/rfq',
      orders: '/api/orders',
      suppliers: '/api/suppliers',
      compliance: '/api/compliance',
      ai: '/api/ai',
      recommendations: '/api/recommendations'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'FoodXchange API is running - Phase 2 Ready!'
  });
});

// Import route files that exist
import authRoutes from './api/routes/auth';
import productRoutes from './api/routes/products';
import rfqRoutes from './api/routes/rfq';
import orderRoutes from './api/routes/order';
import supplierRoutes from './api/routes/supplier';
import complianceRoutes from './api/routes/compliance';
import aiRoutes from './api/routes/ai';
import recommendationRoutes from './api/routes/recommendations';

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/rfq', rfqRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/recommendations', recommendationRoutes);

app.get('/api/analytics', (req, res) => {
  res.json({
    message: 'Analytics endpoint - Phase 2 implementation',
    data: {
      totalProducts: 0,
      totalOrders: 0,
      totalSuppliers: 0
    }
  });
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
🚀 FoodXchange Backend Server Started!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
💻 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/api/health

✅ Phase 1: Azure AI Integration Complete
🔄 Phase 2: Ready to implement...
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export default app;