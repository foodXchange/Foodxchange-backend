// server-stable.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./src/config/elasticsearch');
const searchRoutes = require('./src/routes/searchRoutes');
const authRoutes = require('./src/routes/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'FoodXchange Search API is running!',
    timestamp: new Date().toISOString()
  });
});

// Search routes
app.use('/api/v1', searchRoutes);
app.use('/api/v1/auth', authRoutes);

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Stable server running on http://localhost:${PORT}`);
  console.log('✅ Server is stable and ready for requests');
});

// Keep server alive
process.on('SIGTERM', () => console.log('Server shutting down...'));
process.on('SIGINT', () => console.log('Server shutting down...'));

module.exports = app;

