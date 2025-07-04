// File: src/api/routes/order.js
const express = require('express');
const router = express.Router();

// @route   GET /api/orders
// @desc    Get all orders
// @access  Private
router.get('/', (req, res) => {
  res.json({ message: 'Get orders endpoint - TODO: implement order management' });
});

module.exports = router;
