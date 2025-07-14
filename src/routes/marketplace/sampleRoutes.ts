import { Router } from 'express';
import { asyncHandler } from '../../core/errors';

const router = Router();

// Sample request routes
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get all sample requests',
    data: [],
    count: 0
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Create sample request',
    data: null
  });
}));

export default router;