// File: src/api/routes/index.js
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const rfqRoutes = require('./rfq');
const complianceRoutes = require('./compliance');
const supplierRoutes = require('./supplier');
const orderRoutes = require('./order');

// API version and info
router.get('/', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API',
    endpoints: {
      auth: '/api/auth',
      rfqs: '/api/rfqs',
      compliance: '/api/compliance',
      suppliers: '/api/suppliers',
      orders: '/api/orders'
    },
    documentation: '/api/docs',
    websocket: `ws://localhost:${process.env.WS_PORT || 3001}/ws`,
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/rfqs', rfqRoutes);
router.use('/compliance', complianceRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/orders', orderRoutes);

module.exports = router;
