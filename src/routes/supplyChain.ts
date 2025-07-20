import express from 'express';
import { body, param, query } from 'express-validator';

import { Logger } from '../core/logging/logger';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { blockchainService, SupplyChainEvent, ProductBatch } from '../services/blockchain/BlockchainService';

const router = express.Router();
const logger = new Logger('SupplyChainRoutes');

// Rate limiting
const supplyChainLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window
  message: 'Too many supply chain requests'
});

router.use(supplyChainLimiter);

/**
 * @route   POST /api/supply-chain/batches
 * @desc    Create a new product batch
 * @access  Private (Seller only)
 */
router.post('/batches',
  auth,
  [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('batchNumber').notEmpty().withMessage('Batch number is required'),
    body('manufacturingDate').isISO8601().withMessage('Valid manufacturing date required'),
    body('expiryDate').isISO8601().withMessage('Valid expiry date required'),
    body('origin.farm').notEmpty().withMessage('Farm origin is required'),
    body('origin.location').notEmpty().withMessage('Origin location is required'),
    body('origin.certifications').isArray().withMessage('Certifications must be an array'),
    body('qualityMetrics.grade').notEmpty().withMessage('Quality grade is required'),
    body('qualityMetrics.freshness').isFloat({ min: 0, max: 100 }).withMessage('Freshness must be 0-100'),
    body('qualityMetrics.organic').isBoolean().withMessage('Organic must be boolean'),
    body('currentLocation').notEmpty().withMessage('Current location is required'),
    body('currentOwner').notEmpty().withMessage('Current owner is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check if user is authorized (seller or admin)
      if (!['SELLER', 'ADMIN'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Only sellers can create product batches'
        });
      }

      const batchData = {
        productId: req.body.productId,
        batchNumber: req.body.batchNumber,
        manufacturingDate: new Date(req.body.manufacturingDate),
        expiryDate: new Date(req.body.expiryDate),
        origin: req.body.origin,
        qualityMetrics: req.body.qualityMetrics,
        currentLocation: req.body.currentLocation,
        currentOwner: req.body.currentOwner
      };

      const batch = await blockchainService.createProductBatch(batchData);

      logger.info('Product batch created', {
        batchId: batch.id,
        productId: batch.productId,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        data: batch,
        message: 'Product batch created successfully'
      });

    } catch (error) {
      logger.error('Failed to create product batch', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create product batch'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/batches/:batchId
 * @desc    Get product batch details
 * @access  Private
 */
router.get('/batches/:batchId',
  auth,
  [
    param('batchId').notEmpty().withMessage('Batch ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const batch = await blockchainService.getProductBatch(req.params.batchId);

      if (!batch) {
        return res.status(404).json({
          success: false,
          message: 'Product batch not found'
        });
      }

      res.json({
        success: true,
        data: batch
      });

    } catch (error) {
      logger.error('Failed to get product batch', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve product batch'
      });
    }
  }
);

/**
 * @route   POST /api/supply-chain/batches/:batchId/events
 * @desc    Add supply chain event to batch
 * @access  Private
 */
router.post('/batches/:batchId/events',
  auth,
  [
    param('batchId').notEmpty().withMessage('Batch ID is required'),
    body('eventType').isIn(['CREATED', 'SHIPPED', 'RECEIVED', 'QUALITY_CHECK', 'STORED', 'DELIVERED'])
      .withMessage('Invalid event type'),
    body('location.latitude').isFloat().withMessage('Valid latitude required'),
    body('location.longitude').isFloat().withMessage('Valid longitude required'),
    body('location.address').notEmpty().withMessage('Address is required'),
    body('actor.id').notEmpty().withMessage('Actor ID is required'),
    body('actor.name').notEmpty().withMessage('Actor name is required'),
    body('actor.role').notEmpty().withMessage('Actor role is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const eventData = {
        productId: req.body.productId || '',
        eventType: req.body.eventType,
        timestamp: new Date(),
        location: req.body.location,
        actor: req.body.actor,
        metadata: req.body.metadata || {}
      };

      const event = await blockchainService.addSupplyChainEvent(
        req.params.batchId,
        eventData
      );

      logger.info('Supply chain event added', {
        batchId: req.params.batchId,
        eventType: eventData.eventType,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        data: event,
        message: 'Supply chain event added successfully'
      });

    } catch (error) {
      logger.error('Failed to add supply chain event', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add supply chain event'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/products/:productId/history
 * @desc    Get supply chain history for a product
 * @access  Private
 */
router.get('/products/:productId/history',
  auth,
  [
    param('productId').notEmpty().withMessage('Product ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const history = await blockchainService.getSupplyChainHistory(req.params.productId);

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      logger.error('Failed to get supply chain history', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve supply chain history'
      });
    }
  }
);

/**
 * @route   POST /api/supply-chain/batches/:batchId/verify
 * @desc    Verify supply chain integrity for a batch
 * @access  Private
 */
router.post('/batches/:batchId/verify',
  auth,
  [
    param('batchId').notEmpty().withMessage('Batch ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const verification = await blockchainService.verifySupplyChainIntegrity(req.params.batchId);

      logger.info('Supply chain verification completed', {
        batchId: req.params.batchId,
        isValid: verification.isValid,
        userId: req.user.id
      });

      res.json({
        success: true,
        data: verification
      });

    } catch (error) {
      logger.error('Failed to verify supply chain integrity', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify supply chain integrity'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/network/status
 * @desc    Get blockchain network status
 * @access  Private (Admin only)
 */
router.get('/network/status',
  auth,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const status = await blockchainService.getNetworkStatus();

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Failed to get network status', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get network status'
      });
    }
  }
);

/**
 * @route   GET /api/supply-chain/batches
 * @desc    Search and filter product batches
 * @access  Private
 */
router.get('/batches',
  auth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('productId').optional().notEmpty().withMessage('Product ID cannot be empty'),
    query('verified').optional().isBoolean().withMessage('Verified must be boolean')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // This would be implemented with proper database queries in a real system
      // For now, return empty results with proper pagination structure

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      res.json({
        success: true,
        data: {
          batches: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0
          }
        }
      });

    } catch (error) {
      logger.error('Failed to search batches', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search batches'
      });
    }
  }
);

export default router;
