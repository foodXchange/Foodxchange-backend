import { Router } from 'express';
import { asyncHandler } from '../../core/errors';

const router = Router();

// Order routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get all orders',
    data: [],
    count: 0
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get order by ID',
    data: null
  });
}));

export default router;