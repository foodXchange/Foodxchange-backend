import express from 'express';
import { body, param, query } from 'express-validator';

import { Logger } from '../core/logging/logger';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { advancedAnalyticsService } from '../services/analytics/AdvancedAnalyticsService';

const router = express.Router();
const logger = new Logger('AnalyticsRoutes');

// Rate limiting for analytics
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many analytics requests'
});

router.use(analyticsLimiter);

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get comprehensive dashboard metrics
 * @access  Private
 */
router.get('/dashboard',
  auth,
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
    query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Calculate date range
      const period = req.query.period || '30d';
      let startDate: Date, endDate: Date;

      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate);
        endDate = new Date(req.query.endDate);
      } else {
        endDate = new Date();
        const days = parseInt(period.replace('d', '').replace('y', '')) * (period.includes('y') ? 365 : 1);
        startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
      }

      const metrics = await advancedAnalyticsService.generateDashboardMetrics(
        req.user.company,
        { start: startDate, end: endDate },
        req.user.role
      );

      logger.info('Dashboard metrics generated', {
        userId: req.user.id,
        companyId: req.user.company,
        period
      });

      res.json({
        success: true,
        data: {
          metrics,
          period: {
            start: startDate,
            end: endDate,
            period
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get dashboard metrics', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard metrics'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/realtime
 * @desc    Get real-time metrics
 * @access  Private
 */
router.get('/realtime',
  auth,
  async (req: any, res: any) => {
    try {
      const metrics = await advancedAnalyticsService.getRealtimeMetrics(
        req.user.company,
        req.user.role
      );

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Failed to get realtime metrics', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve realtime metrics'
      });
    }
  }
);

/**
 * @route   POST /api/analytics/custom
 * @desc    Generate custom analytics
 * @access  Private
 */
router.post('/custom',
  auth,
  [
    body('kpis').isArray().withMessage('KPIs must be an array'),
    body('chartTypes').isArray().withMessage('Chart types must be an array'),
    body('reportFormats').optional().isArray().withMessage('Report formats must be an array')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const config = {
        kpis: req.body.kpis,
        chartTypes: req.body.chartTypes,
        reportFormats: req.body.reportFormats || ['PDF']
      };

      const analytics = await advancedAnalyticsService.generateCustomAnalytics(
        req.user.company,
        config
      );

      logger.info('Custom analytics generated', {
        userId: req.user.id,
        companyId: req.user.company,
        config
      });

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Failed to generate custom analytics', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate custom analytics'
      });
    }
  }
);

/**
 * @route   POST /api/analytics/reports/export
 * @desc    Export analytics report
 * @access  Private
 */
router.post('/reports/export',
  auth,
  [
    body('reportType').isIn(['SALES', 'CUSTOMERS', 'PRODUCTS', 'COMPREHENSIVE']).withMessage('Invalid report type'),
    body('format').isIn(['PDF', 'CSV', 'EXCEL']).withMessage('Invalid format'),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const { reportType, format, startDate, endDate } = req.body;

      const report = await advancedAnalyticsService.exportAnalyticsReport(
        req.user.company,
        reportType,
        format,
        {
          start: new Date(startDate),
          end: new Date(endDate)
        }
      );

      logger.info('Analytics report exported', {
        userId: req.user.id,
        companyId: req.user.company,
        reportType,
        format,
        reportId: report.reportId
      });

      res.json({
        success: true,
        data: report,
        message: 'Report generated successfully'
      });

    } catch (error) {
      logger.error('Failed to export analytics report', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export report'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/reports/:reportId/download
 * @desc    Download generated report
 * @access  Private
 */
router.get('/reports/:reportId/download',
  auth,
  [
    param('reportId').notEmpty().withMessage('Report ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // In real implementation, would serve actual file
      // For now, return placeholder response

      logger.info('Report download requested', {
        userId: req.user.id,
        reportId: req.params.reportId
      });

      res.json({
        success: true,
        message: 'Report download would be served here',
        reportId: req.params.reportId
      });

    } catch (error) {
      logger.error('Failed to download report', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download report'
      });
    }
  }
);

export default router;
