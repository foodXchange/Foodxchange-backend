// File: src/api/routes/supplier.js
const express = require('express');
const router = express.Router();

// @route   GET /api/suppliers
// @desc    Get all suppliers
// @access  Private
router.get('/', (req, res) => {
  res.json({ message: 'Get suppliers endpoint - TODO: implement supplier directory' });
});

module.exports = router;
