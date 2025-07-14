import { Router } from 'express';

const router = Router();

// Import routes will be implemented here
router.get('/', (_req, res) => {
  res.json({ message: 'Import routes placeholder' });
});

export default router;