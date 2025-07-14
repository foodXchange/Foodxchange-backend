// File: src/api/routes/supplier.ts
import { Router, Request, Response } from 'express';

const router = Router();

// @route   GET /api/suppliers
// @desc    Get all suppliers
// @access  Private
router.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Get suppliers endpoint - TODO: implement supplier directory' });
});

export default router;
