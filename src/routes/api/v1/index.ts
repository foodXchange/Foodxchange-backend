import { Router } from 'express';

import { apiVersionMiddleware } from '../../../middleware/apiVersion';

import authRoutes from './auth';
import imageRoutes from './images';
import jobRoutes from './jobs';
import memoryRoutes from './memory';
import monitoringRoutes from './monitoring';
import orderRoutes from './orders';
import publicRoutes from './public';
import rateLimitingRoutes from './rate-limiting';
import rfqRoutes from './rfqs';
import supplierRoutes from './suppliers';
import userRoutes from './users';

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
