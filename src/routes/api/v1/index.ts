import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import supplierRoutes from './suppliers';
import rfqRoutes from './rfqs';
import orderRoutes from './orders';
import publicRoutes from './public';
import monitoringRoutes from './monitoring';
import { apiVersionMiddleware } from '../../../middleware/apiVersion';

const router = Router();

// Apply API versioning middleware
router.use(apiVersionMiddleware);

// Public routes (no authentication required)
router.use('/public', publicRoutes);
router.use('/auth', authRoutes);

// Protected routes (authentication required)
router.use('/users', userRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/rfqs', rfqRoutes);
router.use('/orders', orderRoutes);

// Monitoring routes (admin access required)
router.use('/monitoring', monitoringRoutes);

export default router;