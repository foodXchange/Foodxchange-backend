import express from 'express';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    message: 'users service is running',
    timestamp: new Date().toISOString()
  });
});

export default router;
