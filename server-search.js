// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const morgan = require('morgan');

// Import search configurations
const { testConnection, initializeIndices } = require('./src/config/elasticsearch');

// Import search routes
const searchRoutes = require('./src/routes/searchRoutes');

// Create Express app
const app = express();

// Connect to MongoDB (if you have it)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('📊 MongoDB connected'))
    .catch(err => console.log('❌ MongoDB connection error:', err.message));
}

// Initialize Elasticsearch
(async () => {
  const esConnected = await testConnection();
  if (esConnected) {
    await initializeIndices();
  }
})();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'FoodXchange Search API is running!',
    timestamp: new Date().toISOString()
  });
});

// Home Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to FoodXchange Search API',
    version: '1.0.0',
    endpoints: {
      search: '/api/v1/search',
      suggest: '/api/v1/suggest',
      health: '/health'
    }
  });
});

// Search Routes
app.use('/api/v1', searchRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error Handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 FoodXchange Search Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔍 Search API: http://localhost:${PORT}/api/v1/search`);
});

module.exports = app;
