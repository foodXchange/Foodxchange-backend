import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import haccpRoutes from './haccp';

const router = Router();

// Mount HACCP routes
router.use('/haccp', haccpRoutes);

// Compliance routes
router.post('/validate', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Compliance validation',
    data: {
      valid: true,
      issues: []
    }
  });
}));

router.get('/rules/:productType', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Get compliance rules',
    data: {
      productType: req.params.productType,
      rules: []
    }
  });
}));

export default router;