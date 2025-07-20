import express from 'express';
import { body, query } from 'express-validator';

import { analyticsDashboardController } from '../controllers/AnalyticsDashboardController';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';

const router = express.Router();

// Rate limiting for advanced analytics
const advancedAnalyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: 'Too many advanced analytics requests'
});

router.use(advancedAnalyticsLimiter);

/**
 * @route   GET /api/advanced-analytics/dashboard
 * @desc    Get comprehensive analytics dashboard
 * @access  Private
 */
router.get('/dashboard',
  auth,
  [
    query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period'),
    query('includeForecasts').optional().isBoolean().withMessage('Include forecasts must be boolean'),
    query('includeRealtime').optional().isBoolean().withMessage('Include realtime must be boolean')
  ],
  validate,
  analyticsDashboardController.getComprehensiveDashboard
);

/**
 * @route   GET /api/advanced-analytics/executive-summary
 * @desc    Get executive-level summary and insights
 * @access  Private (Manager+ roles)
 */
router.get('/executive-summary',
  auth,
  [
    query('timeframe').optional().isIn(['WEEK', 'MONTH', 'QUARTER', 'YEAR']).withMessage('Invalid timeframe')
  ],
  validate,
  (req: any, res: any, next: any) => {
    // Check if user has executive access
    if (!['ADMIN', 'MANAGER', 'OWNER'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Executive access required'
      });
    }
    next();
  },
  analyticsDashboardController.getExecutiveSummary
);

/**
 * @route   POST /api/advanced-analytics/generate-report
 * @desc    Generate and download analytics report
 * @access  Private
 */
router.post('/generate-report',
  auth,
  [
    body('reportType').isIn(['SALES', 'CUSTOMERS', 'PRODUCTS', 'COMPREHENSIVE']).withMessage('Invalid report type'),
    body('format').isIn(['PDF', 'EXCEL', 'CSV']).withMessage('Invalid format'),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required'),
    body('includeCharts').optional().isBoolean().withMessage('Include charts must be boolean')
  ],
  validate,
  analyticsDashboardController.generateAnalyticsReport
);

/**
 * @route   GET /api/advanced-analytics/predictive-insights
 * @desc    Get predictive analytics and forecasting
 * @access  Private
 */
router.get('/predictive-insights',
  auth,
  [
    query('productIds').optional().isString().withMessage('Product IDs must be comma-separated string'),
    query('timeframe').optional().isIn(['WEEK', 'MONTH', 'QUARTER']).withMessage('Invalid timeframe')
  ],
  validate,
  analyticsDashboardController.getPredictiveInsights
);

/**
 * @route   GET /api/advanced-analytics/benchmarks
 * @desc    Get performance benchmarks and industry comparisons
 * @access  Private
 */
router.get('/benchmarks',
  auth,
  [
    query('category').optional().isString().withMessage('Category must be string'),
    query('timeframe').optional().isIn(['WEEK', 'MONTH', 'QUARTER', 'YEAR']).withMessage('Invalid timeframe')
  ],
  validate,
  analyticsDashboardController.getPerformanceBenchmarks
);

export default router;
