import { Router } from 'express';

import { asyncHandler } from '../../core/errors';

const router = Router();

// Supplier routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get all suppliers',
    data: [],
    count: 0
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get supplier by ID',
    data: null
  });
}));

export default router;
