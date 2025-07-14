import { Router } from 'express';
import { asyncHandler } from '../../core/errors';

const router = Router();

// RFQ routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get all RFQs',
    data: [],
    count: 0
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Create RFQ',
    data: null
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get RFQ by ID',
    data: null
  });
}));

export default router;