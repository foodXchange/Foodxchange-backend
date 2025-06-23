// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

// Import configurations - FIXED PATHS
const connectDB = require('./src/config/db');
const { testConnection, initializeIndices } = require('./src/config/elasticsearch');
const { errorHandler } = require('./src/middleware/errorHandler');
const cronJobs = require('./src/utils/cronJobs');

// Import routes - FIXED PATHS
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const projectRoutes = require('./src/routes/projects');
const proposalRoutes = require('./src/routes/proposals');
const notificationRoutes = require('./src/routes/notifications');
const searchRoutes = require('./src/routes/searchRoutes');

// Create Express app
const app = express();

// Connect to MongoDB
connectDB();

// Initialize Elasticsearch
(async () => {
  const esConnected = await testConnection();
  if (esConnected) {
    await initializeIndices();
  }
})();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'FoodXchange API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Home Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to FoodXchange API',
    version: '1.0.0',
    documentation: '/api/v1',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      proposals: '/api/v1/proposals',
      notifications: '/api/v1/notifications',
      search: '/api/v1/search'
    }
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/proposals', proposalRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1', searchRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error Handler Middleware (must be last)
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1`);

  // Start cron jobs
  if (cronJobs && cronJobs.startAll) {
    cronJobs.startAll();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (cronJobs && cronJobs.stopAll) {
    cronJobs.stopAll();
  }

  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  if (cronJobs && cronJobs.stopAll) {
    cronJobs.stopAll();
  }

  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

module.exports = app;
