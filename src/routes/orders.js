const router = require('express').Router();
const auth = require('../middleware/auth');

// Mock orders for now
router.get('/', auth, async (req, res) => {
  res.json([]);
});

module.exports = router;
