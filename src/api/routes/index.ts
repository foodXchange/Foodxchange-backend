// File: src/api/routes/index.ts
import { Router, Request, Response } from 'express';

const router = Router();

// Import route modules
import aiRoutes from './ai';
import authRoutes from './auth';
import complianceRoutes from './compliance';
import orderRoutes from './order';
import recommendationRoutes from './recommendations';
import rfqRoutes from './rfq';
import supplierRoutes from './supplier';

// API version and info
router.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API',
    endpoints: {
      auth: '/api/auth',
      rfqs: '/api/rfqs',
      compliance: '/api/compliance',
      suppliers: '/api/suppliers',
      orders: '/api/orders',
      ai: '/api/ai',
      recommendations: '/api/recommendations'
    },
    documentation: '/api/docs',
    websocket: `ws://localhost:${process.env.WS_PORT || 3001}/ws`,
    timestamp: new Date().toISOString()
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/rfqs', rfqRoutes);
router.use('/compliance', complianceRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/orders', orderRoutes);
router.use('/ai', aiRoutes);
router.use('/recommendations', recommendationRoutes);

export default router;
