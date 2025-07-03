// File: src/api/routes/rfq.js
const express = require('express');
const router = express.Router();

// @route   GET /api/rfqs
// @desc    Get all RFQs
// @access  Private
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        id: 'rfq_001',
        title: 'Premium Cornflakes Supply',
        status: 'receiving_bids',
        bidCount: 5,
        complianceScore: 95,
        deadline: '2025-02-15',
        createdAt: new Date().toISOString()
      }
    ]
  });
});

// @route   POST /api/rfqs
// @desc    Create new RFQ
// @access  Private
router.post('/', (req, res) => {
  res.json({ message: 'Create RFQ endpoint - TODO: implement RFQ creation' });
});

module.exports = router;
