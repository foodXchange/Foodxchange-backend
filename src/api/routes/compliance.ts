// File: src/api/routes/compliance.ts
import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { complianceController } from '../../controllers/compliance/complianceController';
import { asyncHandler } from '../../core/errors';
import { authenticate } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validation';


const router = Router();

// All routes require authentication
router.use(authenticate);

// @route   POST /api/compliance/check
// @desc    Run compliance check on a product
// @access  Private
router.post('/check',
  validateRequest([
    body('productId').isMongoId().withMessage('Valid product ID is required'),
    body('region').notEmpty().withMessage('Region is required'),
    body('certifications').optional().isArray()
  ]),
  asyncHandler(complianceController.checkProductCompliance.bind(complianceController))
);

// @route   POST /api/compliance/bulk-check
// @desc    Run compliance check on multiple products
// @access  Private
router.post('/bulk-check',
  validateRequest([
    body('productIds').isArray().withMessage('Product IDs must be an array'),
    body('productIds.*').isMongoId().withMessage('Each product ID must be valid'),
    body('region').notEmpty().withMessage('Region is required')
  ]),
  asyncHandler(complianceController.bulkComplianceCheck.bind(complianceController))
);

// @route   GET /api/compliance/history/:productId
// @desc    Get compliance history for a product
// @access  Private
router.get('/history/:productId',
  validateRequest([
    param('productId').isMongoId().withMessage('Valid product ID is required'),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ]),
  asyncHandler(complianceController.getComplianceHistory.bind(complianceController))
);

// @route   POST /api/compliance/verify-certification
// @desc    Verify a certification
// @access  Private
router.post('/verify-certification',
  validateRequest([
    body('certificationType').notEmpty().withMessage('Certificate type is required'),
    body('certificateNumber').notEmpty().withMessage('Certificate number is required'),
    body('issuer').notEmpty().withMessage('Issuer is required')
  ]),
  asyncHandler(complianceController.verifyCertification.bind(complianceController))
);

// @route   GET /api/compliance/requirements/:region
// @desc    Get compliance requirements by region
// @access  Private
router.get('/requirements/:region',
  validateRequest([
    param('region').notEmpty().withMessage('Region is required'),
    query('category').optional().isString()
  ]),
  asyncHandler(complianceController.getRegionalRequirements.bind(complianceController))
);

// @route   POST /api/compliance/report
// @desc    Generate compliance report
// @access  Private
router.post('/report',
  validateRequest([
    body('productId').isMongoId().withMessage('Valid product ID is required'),
    body('format').optional().isIn(['pdf', 'excel', 'json']).withMessage('Format must be pdf, excel, or json')
  ]),
  asyncHandler(complianceController.generateComplianceReport.bind(complianceController))
);

// @route   GET /api/compliance/stats
// @desc    Get compliance statistics
// @access  Private
router.get('/stats',
  validateRequest([
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('region').optional().isString(),
    query('category').optional().isString()
  ]),
  asyncHandler(complianceController.getComplianceStats.bind(complianceController))
);

export default router;
