const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ 
    message: 'rfqs service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
