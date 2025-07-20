import { Router } from 'express';

import { asyncHandler } from '../../core/errors';

const router = Router();

// Product routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get all products',
    data: [],
    count: 0
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get product by ID',
    data: null
  });
}));

export default router;
