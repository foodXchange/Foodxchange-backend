import express from 'express';
import { body, param, query } from 'express-validator';

import { Logger } from '../core/logging/logger';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { supplyChainAnalyticsService } from '../services/blockchain/SupplyChainAnalyticsService';

const router = express.Router();
const logger = new Logger('SupplyChainAnalyticsRoutes');

// Rate limiting
const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: 'Too many analytics requests'
});

router.use(analyticsLimiter);

/**
 * @route   GET /api/supply-chain/analytics/metrics
 * @desc    Get supply chain metrics
 * @access  Private
 */
router.get('/metrics',
  auth,
  [
    query('startDate').optional().isISO8601().withMessage('Valid start date required'),
    query('endDate').optional().isISO8601().withMessage('Valid end date required'),
    query('productIds').optional().isArray().withMessage('Product IDs must be an array'),
    query('suppliers').optional().isArray().withMessage('Suppliers must be an array')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const filters: any = {};

      if (req.query.startDate) filters.startDate = new Date(req.query.startDate);
      if (req.query.endDate) filters.endDate = new Date(req.query.endDate);
      if (req.query.productIds) filters.productIds = req.query.productIds;
      if (req.query.suppliers) filters.suppliers = req.query.suppliers;

      const metrics = await supplyChainAnalyticsService.generateSupplyChainMetrics(filters);

      logger.info('Supply chain metrics generated', {
        userId: req.user.id,
        filters
      });

      res.json({
        success: true,
        data: metrics
      });

    } catch (error) {
      logger.error('Failed to get supply chain metrics', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve supply chain metrics'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/analytics/insights
 * @desc    Get supply chain insights for company
 * @access  Private
 */
router.get('/insights',
  auth,
  [
    query('timeframe').optional().isIn(['WEEK', 'MONTH', 'QUARTER']).withMessage('Invalid timeframe')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const timeframe = req.query.timeframe || 'MONTH';
      const insights = await supplyChainAnalyticsService.generateSupplyChainInsights(
        req.user.company,
        timeframe
      );

      logger.info('Supply chain insights generated', {
        userId: req.user.id,
        companyId: req.user.company,
        timeframe
      });

      res.json({
        success: true,
        data: insights
      });

    } catch (error) {
      logger.error('Failed to get supply chain insights', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve supply chain insights'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/analytics/traceability/:batchId
 * @desc    Get traceability report for batch
 * @access  Private
 */
router.get('/traceability/:batchId',
  auth,
  [
    param('batchId').notEmpty().withMessage('Batch ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const report = await supplyChainAnalyticsService.generateTraceabilityReport(
        req.params.batchId
      );

      logger.info('Traceability report generated', {
        userId: req.user.id,
        batchId: req.params.batchId
      });

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Failed to generate traceability report', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate traceability report'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/analytics/anomalies
 * @desc    Detect supply chain anomalies
 * @access  Private
 */
router.get('/anomalies',
  auth,
  [
    query('threshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Threshold must be 0-1')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const threshold = parseFloat(req.query.threshold) || 0.95;
      const anomalies = await supplyChainAnalyticsService.detectAnomalies(
        req.user.company,
        threshold
      );

      logger.info('Anomaly detection completed', {
        userId: req.user.id,
        companyId: req.user.company,
        anomaliesFound: anomalies.length
      });

      res.json({
        success: true,
        data: anomalies
      });

    } catch (error) {
      logger.error('Failed to detect anomalies', error);
      res.status(500).json({
        success: false,
        message: 'Failed to detect anomalies'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/analytics/compliance/:regulationType
 * @desc    Get compliance report
 * @access  Private
 */
router.get('/compliance/:regulationType',
  auth,
  [
    param('regulationType').isIn(['FDA', 'USDA', 'HACCP', 'ORGANIC']).withMessage('Invalid regulation type')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const report = await supplyChainAnalyticsService.generateComplianceReport(
        req.user.company,
        req.params.regulationType
      );

      logger.info('Compliance report generated', {
        userId: req.user.id,
        companyId: req.user.company,
        regulationType: req.params.regulationType
      });

      res.json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Failed to generate compliance report', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate compliance report'
      });
    }
  }
);

/**
 * @route   POST /api/supply-chain/analytics/quality-prediction
 * @desc    Predict quality risk for current conditions
 * @access  Private
 */
router.post('/quality-prediction',
  auth,
  [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('temperature').isFloat().withMessage('Temperature must be a number'),
    body('humidity').isFloat({ min: 0, max: 100 }).withMessage('Humidity must be 0-100'),
    body('transitTime').isFloat({ min: 0 }).withMessage('Transit time must be positive'),
    body('handlingCount').isInt({ min: 0 }).withMessage('Handling count must be non-negative')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const { productId, temperature, humidity, transitTime, handlingCount } = req.body;

      const prediction = await supplyChainAnalyticsService.predictQualityRisk(
        productId,
        { temperature, humidity, transitTime, handlingCount }
      );

      logger.info('Quality risk prediction completed', {
        userId: req.user.id,
        productId,
        riskLevel: prediction.riskLevel
      });

      res.json({
        success: true,
        data: prediction
      });

    } catch (error) {
      logger.error('Failed to predict quality risk', error);
      res.status(500).json({
        success: false,
        message: 'Failed to predict quality risk'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/analytics/dashboard
 * @desc    Get comprehensive supply chain dashboard data
 * @access  Private
 */
router.get('/dashboard',
  auth,
  async (req: any, res: any) => {
    try {
      // Gather all dashboard data in parallel
      const [metrics, insights, anomalies] = await Promise.all([
        supplyChainAnalyticsService.generateSupplyChainMetrics(),
        supplyChainAnalyticsService.generateSupplyChainInsights(req.user.company),
        supplyChainAnalyticsService.detectAnomalies(req.user.company, 0.8)
      ]);

      const dashboardData = {
        metrics,
        insights,
        anomalies,
        lastUpdated: new Date()
      };

      logger.info('Supply chain dashboard data generated', {
        userId: req.user.id,
        companyId: req.user.company
      });

      res.json({
        success: true,
        data: dashboardData
      });

    } catch (error) {
      logger.error('Failed to generate dashboard data', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate dashboard data'
      });
    }
  }
);

export default router;
