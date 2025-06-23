const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth');
const userRoutes = require('./users');
const projectRoutes = require('./projects');
const proposalRoutes = require('./proposals');
const notificationRoutes = require('./notifications');
const searchRoutes = require('./search');
const analyticsRoutes = require('./analytics');
const adminRoutes = require('./admin');

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'FoodXchange API is running',
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || '1.0.0'
  });
});

// API documentation route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'FoodXchange API v1',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      proposals: '/api/v1/proposals',
      notifications: '/api/v1/notifications',
      search: '/api/v1/search',
      analytics: '/api/v1/analytics',
      admin: '/api/v1/admin'
    }
  });
});

// Mount all routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/proposals', proposalRoutes);
router.use('/notifications', notificationRoutes);
router.use('/search', searchRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);

// 404 handler for undefined routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

module.exports = router;