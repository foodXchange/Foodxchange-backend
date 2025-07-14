const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ 
    message: 'orders service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
