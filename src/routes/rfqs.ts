import express from 'express';
import { body, param, query } from 'express-validator';
import multer from 'multer';

import { RFQController } from '../controllers/RFQController';
import {
  validateRequest,
  commonValidations,
  foodValidations,
  sanitizers
} from '../middleware/advancedValidation';
import { requireAuth } from '../middleware/auth';
import {
  apiRateLimiter,
  rfqRateLimiter,
  uploadRateLimiter
} from '../middleware/rateLimiter';
import { fileUploadSecurity } from '../middleware/security';
import {
  extractTenantContext,
  enforceTenantIsolation,
  requireTenantFeature,
  checkTenantLimits,
  tenantFeatures
} from '../middleware/tenantIsolation';

const router = express.Router();
const rfqController = new RFQController();

// Configure multer for attachments
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// All routes require authentication
router.use(requireAuth);
router.use(extractTenantContext);
router.use(apiRateLimiter);

/**
 * @swagger
 * /api/rfqs:
 *   get:
 *     summary: Get all RFQs
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, closed, awarded, cancelled, expired]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, -createdAt, dueDate, -dueDate]
 *     responses:
 *       200:
 *         description: RFQs retrieved successfully
 */
router.get('/',
  enforceTenantIsolation,
  [
    ...commonValidations.pagination(),
    query('status').optional().isIn(['draft', 'published', 'closed', 'awarded', 'cancelled', 'expired']),
    query('category').optional().isString(),
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    query('sort').optional().isIn(['createdAt', '-createdAt', 'dueDate', '-dueDate'])
  ],
  validateRequest,
  rfqController.getRFQs
);

/**
 * @swagger
 * /api/rfqs/analytics:
 *   get:
 *     summary: Get RFQ analytics
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 */
router.get('/analytics',
  enforceTenantIsolation,
  requireTenantFeature(tenantFeatures.ANALYTICS),
  [
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601()
  ],
  validateRequest,
  rfqController.getRFQAnalytics
);

/**
 * @swagger
 * /api/rfqs/{id}:
 *   get:
 *     summary: Get single RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: RFQ retrieved successfully
 *       404:
 *         description: RFQ not found
 */
router.get('/:id',
  enforceTenantIsolation,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  rfqController.getRFQ
);

/**
 * @swagger
 * /api/rfqs:
 *   post:
 *     summary: Create new RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RFQ'
 *     responses:
 *       201:
 *         description: RFQ created successfully
 *       400:
 *         description: Validation error
 */
router.post('/',
  enforceTenantIsolation,
  checkTenantLimits('rfqs'),
  requireTenantFeature(tenantFeatures.RFQ_MANAGEMENT),
  rfqRateLimiter,
  [
    body('title').notEmpty().isLength({ max: 200 }),
    body('description').notEmpty().isLength({ max: 5000 }),
    body('category').notEmpty().isIn(['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods', 'bakery', 'frozen', 'organic', 'ingredients', 'other']),
    body('tags').optional().isArray(),
    body('tags.*').isString(),

    // Items validation
    body('items').isArray({ min: 1 }),
    body('items.*.name').notEmpty(),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.unit').notEmpty(),
    body('items.*.targetPrice').optional().isFloat({ min: 0 }),
    body('items.*.specifications').optional().isString(),
    body('items.*.requiredCertifications').optional().isArray(),
    body('items.*.preferredBrands').optional().isArray(),

    // Delivery validation
    body('deliveryLocation.address').notEmpty(),
    body('deliveryLocation.city').notEmpty(),
    body('deliveryLocation.country').notEmpty(),
    body('deliveryLocation.postalCode').notEmpty(),
    body('deliveryTerms.incoterm').notEmpty().isIn(['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']),
    body('deliverySchedule.type').optional().isIn(['one-time', 'recurring', 'flexible']),

    // Payment terms
    body('paymentTerms.method').optional().isIn(['net30', 'net60', 'net90', 'cod', 'prepaid', 'custom']),
    body('paymentTerms.currency').optional().isLength({ min: 3, max: 3 }),

    // Timeline
    body('dueDate').isISO8601().toDate(),
    body('validUntil').isISO8601().toDate(),

    // Status and visibility
    body('status').optional().isIn(['draft', 'published']),
    body('visibility').optional().isIn(['public', 'private', 'invited']),
    body('invitedSuppliers').optional().isArray(),
    body('invitedSuppliers.*').isMongoId(),

    // Selection criteria
    body('selectionCriteria.priceWeight').optional().isInt({ min: 0, max: 100 }),
    body('selectionCriteria.qualityWeight').optional().isInt({ min: 0, max: 100 }),
    body('selectionCriteria.deliveryWeight').optional().isInt({ min: 0, max: 100 }),
    body('selectionCriteria.paymentTermsWeight').optional().isInt({ min: 0, max: 100 }),
    body('selectionCriteria.certificationWeight').optional().isInt({ min: 0, max: 100 }),
    body('selectionCriteria.sustainabilityWeight').optional().isInt({ min: 0, max: 100 }),

    // Compliance
    body('compliance.requiredCertifications').optional().isArray(),
    body('compliance.requiredDocuments').optional().isArray(),
    body('compliance.qualityStandards').optional().isArray(),

    // Additional requirements
    body('additionalRequirements.sampleRequired').optional().isBoolean(),
    body('additionalRequirements.siteVisitRequired').optional().isBoolean(),
    body('additionalRequirements.insuranceRequired').optional().isBoolean(),
    body('additionalRequirements.minimumRating').optional().isFloat({ min: 0, max: 5 })
  ],
  validateRequest,
  rfqController.createRFQ
);

/**
 * @swagger
 * /api/rfqs/{id}:
 *   put:
 *     summary: Update RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RFQ'
 *     responses:
 *       200:
 *         description: RFQ updated successfully
 *       404:
 *         description: RFQ not found
 */
router.put('/:id',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    // Allow partial updates
    body('title').optional().isLength({ max: 200 }),
    body('description').optional().isLength({ max: 5000 }),
    body('additionalRequirements').optional().isObject()
  ],
  validateRequest,
  rfqController.updateRFQ
);

/**
 * @swagger
 * /api/rfqs/{id}/publish:
 *   post:
 *     summary: Publish RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: RFQ published successfully
 *       404:
 *         description: RFQ not found
 */
router.post('/:id/publish',
  enforceTenantIsolation,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  rfqController.publishRFQ
);

/**
 * @swagger
 * /api/rfqs/{id}/quotes:
 *   post:
 *     summary: Submit quote for RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Quote'
 *     responses:
 *       200:
 *         description: Quote submitted successfully
 *       400:
 *         description: Validation error
 */
router.post('/:id/quotes',
  enforceTenantIsolation,
  rfqRateLimiter,
  [
    param('id').isMongoId(),
    body('currency').notEmpty().isLength({ min: 3, max: 3 }),
    body('validUntil').isISO8601().toDate(),
    body('items').isArray({ min: 1 }),
    body('items.*.itemIndex').isInt({ min: 0 }),
    body('items.*.price').isFloat({ min: 0 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.leadTime').isInt({ min: 0 }),
    body('items.*.notes').optional().isString(),
    body('terms').optional().isString(),
    body('notes').optional().isString()
  ],
  validateRequest,
  rfqController.submitQuote
);

/**
 * @swagger
 * /api/rfqs/{id}/quotes/{quoteId}:
 *   put:
 *     summary: Update quote
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: quoteId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Quote'
 *     responses:
 *       200:
 *         description: Quote updated successfully
 *       404:
 *         description: Quote not found
 */
router.put('/:id/quotes/:quoteId',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    param('quoteId').isMongoId()
    // Same validation as submit quote
  ],
  validateRequest,
  rfqController.updateQuote
);

/**
 * @swagger
 * /api/rfqs/{id}/quotes/{quoteId}/withdraw:
 *   post:
 *     summary: Withdraw quote
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: quoteId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Quote withdrawn successfully
 */
router.post('/:id/quotes/:quoteId/withdraw',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    param('quoteId').isMongoId(),
    body('reason').optional().isString()
  ],
  validateRequest,
  rfqController.withdrawQuote
);

/**
 * @swagger
 * /api/rfqs/{id}/evaluate:
 *   post:
 *     summary: Evaluate quotes
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Quotes evaluated successfully
 */
router.post('/:id/evaluate',
  enforceTenantIsolation,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  rfqController.evaluateQuotes
);

/**
 * @swagger
 * /api/rfqs/{id}/award:
 *   post:
 *     summary: Award RFQ to supplier
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               supplierId:
 *                 type: string
 *               quoteId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: RFQ awarded successfully
 */
router.post('/:id/award',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    body('supplierId').isMongoId(),
    body('quoteId').isMongoId(),
    body('reason').optional().isString()
  ],
  validateRequest,
  rfqController.awardRFQ
);

/**
 * @swagger
 * /api/rfqs/{id}/cancel:
 *   post:
 *     summary: Cancel RFQ
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 required: true
 *     responses:
 *       200:
 *         description: RFQ cancelled successfully
 */
router.post('/:id/cancel',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    body('reason').notEmpty()
  ],
  validateRequest,
  rfqController.cancelRFQ
);

/**
 * @swagger
 * /api/rfqs/{id}/extend-deadline:
 *   post:
 *     summary: Extend RFQ deadline
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newDate:
 *                 type: string
 *                 format: date-time
 *                 required: true
 *     responses:
 *       200:
 *         description: Deadline extended successfully
 */
router.post('/:id/extend-deadline',
  enforceTenantIsolation,
  [
    param('id').isMongoId(),
    body('newDate').isISO8601().toDate()
  ],
  validateRequest,
  rfqController.extendDeadline
);

/**
 * @swagger
 * /api/rfqs/{id}/attachments:
 *   post:
 *     summary: Upload RFQ attachments
 *     tags: [RFQs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Attachments uploaded successfully
 */
router.post('/:id/attachments',
  enforceTenantIsolation,
  uploadRateLimiter,
  upload.array('files', 5),
  fileUploadSecurity,
  [
    param('id').isMongoId()
  ],
  validateRequest,
  rfqController.uploadAttachments
);

export default router;
