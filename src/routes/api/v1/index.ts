import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import supplierRoutes from './suppliers';
import rfqRoutes from './rfqs';
import orderRoutes from './orders';
import publicRoutes from './public';
import monitoringRoutes from './monitoring';
import imageRoutes from './images';
import rateLimitingRoutes from './rate-limiting';
import jobRoutes from './jobs';
import memoryRoutes from './memory';
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
router.use('/images', imageRoutes);
router.use('/jobs', jobRoutes);

// Admin routes (admin access required)
router.use('/monitoring', monitoringRoutes);
router.use('/memory', memoryRoutes);
router.use('/rate-limiting', rateLimitingRoutes);

export default router;