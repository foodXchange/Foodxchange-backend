import express from 'express';
import asyncHandler from 'express-async-handler';

import { AnalyticsController } from '../../controllers/AnalyticsController';
import { requireAuth } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';

const router = express.Router();
const analyticsController = new AnalyticsController();

// Rate limiter for analytics operations
const analyticsRateLimiter = createCustomRateLimiter('analytics', 60, 100); // 100 requests per hour

// Apply middleware to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(analyticsRateLimiter);

/**
 * @route GET /api/v1/analytics/dashboard
 * @desc Get dashboard metrics
 * @access Private
 */
router.get('/dashboard',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getDashboardMetrics.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/reports
 * @desc Generate comprehensive reports
 * @access Private
 */
router.get('/reports',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.generateReport.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/real-time
 * @desc Get real-time analytics
 * @access Private
 */
router.get('/real-time',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getRealTimeAnalytics.bind(analyticsController))
);

/**
 * @route POST /api/v1/analytics/track
 * @desc Track analytics event
 * @access Private
 */
router.post('/track',
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(analyticsController.trackEvent.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/category/:category
 * @desc Get analytics by category
 * @access Private
 */
router.get('/category/:category',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getAnalyticsByCategory.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/products/top
 * @desc Get top performing products
 * @access Private
 */
router.get('/products/top',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getTopProducts.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/revenue/trends
 * @desc Get revenue trends
 * @access Private
 */
router.get('/revenue/trends',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getRevenueTrends.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/users
 * @desc Get user analytics
 * @access Private
 */
router.get('/users',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getUserAnalytics.bind(analyticsController))
);

/**
 * @route GET /api/v1/analytics/export
 * @desc Get export data for analytics
 * @access Private
 */
router.get('/export',
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(analyticsController.getExportData.bind(analyticsController))
);

export default router;
