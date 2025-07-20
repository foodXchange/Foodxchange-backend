import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { Logger } from '../../core/logging/logger';
import { validateRequest } from '../../middleware/advancedValidation';
import { auth } from '../../middleware/auth';
import EnhancedValidationService from '../../services/validation/EnhancedValidationService';
import { apiResponse } from '../../utils/apiResponse';


const router = express.Router();
const logger = new Logger('ValidationRoutes');

// Validation schemas
const validateProductSchema = z.object({
  productData: z.object({
    name: z.string().min(1).max(200),
    category: z.string().min(1),
    subcategory: z.string().optional(),
    description: z.string().min(1).max(5000),
    specifications: z.record(z.any()).default({}),
    ingredients: z.array(z.string()).default([]),
    allergens: z.array(z.string()).default([]),
    nutritionalInfo: z.record(z.any()).default({}),
    packaging: z.object({
      type: z.string().min(1),
      size: z.string().min(1),
      material: z.string().min(1),
      weight: z.number().positive().optional(),
      dimensions: z.object({
        length: z.number().positive(),
        width: z.number().positive(),
        height: z.number().positive(),
        unit: z.string().default('cm')
      }).optional()
    }),
    pricing: z.object({
      currency: z.string().length(3).default('USD'),
      unitPrice: z.number().positive(),
      minimumOrder: z.number().positive(),
      discounts: z.array(z.object({
        quantity: z.number().positive(),
        percentage: z.number().min(0).max(100)
      })).default([])
    }),
    availability: z.object({
      inStock: z.boolean().default(true),
      quantity: z.number().min(0),
      leadTime: z.number().min(0),
      location: z.string().min(1)
    }),
    quality: z.object({
      certifications: z.array(z.string()).default([]),
      standards: z.array(z.string()).default([]),
      testResults: z.array(z.object({
        type: z.string().min(1),
        result: z.any(),
        date: z.string().refine((date) => !isNaN(Date.parse(date))),
        lab: z.string().min(1)
      })).default([])
    }),
    sustainability: z.object({
      carbonFootprint: z.number().min(0).optional(),
      packaging: z.array(z.string()).default([]),
      certifications: z.array(z.string()).default([]),
      sourcing: z.string().optional()
    }).optional()
  }),
  validationType: z.enum(['basic', 'advanced', 'compliance', 'ml_enhanced']).default('basic'),
  targetMarkets: z.array(z.string()).default([]),
  options: z.object({
    checkCornflakePatterns: z.boolean().default(true),
    generateSuggestions: z.boolean().default(true),
    validateCompliance: z.boolean().default(false),
    includeMLAnalysis: z.boolean().default(false),
    autoCorrect: z.boolean().default(false)
  }).optional()
});

const validateRFQSchema = z.object({
  rfqData: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    productSpecs: z.array(z.object({
      name: z.string().min(1),
      category: z.string().min(1),
      description: z.string().min(1),
      quantity: z.object({
        amount: z.number().positive(),
        unit: z.string().min(1)
      }),
      qualityRequirements: z.array(z.object({
        type: z.string().min(1),
        value: z.any(),
        required: z.boolean().default(true)
      })).default([])
    })),
    requirements: z.object({
      totalBudget: z.number().positive(),
      deliveryDate: z.string().refine((date) => !isNaN(Date.parse(date))),
      certifications: z.array(z.string()).default([])
    }),
    deadline: z.string().refine((date) => !isNaN(Date.parse(date)))
  }),
  validationType: z.enum(['structure', 'content', 'compliance', 'completeness']).default('structure'),
  options: z.object({
    checkSpecifications: z.boolean().default(true),
    validateBudget: z.boolean().default(true),
    checkDeadlines: z.boolean().default(true),
    validateRequirements: z.boolean().default(true)
  }).optional()
});

const validateComplianceSchema = z.object({
  complianceData: z.object({
    productType: z.string().min(1),
    targetMarkets: z.array(z.string()).min(1),
    certifications: z.array(z.object({
      type: z.string().min(1),
      number: z.string().min(1),
      issuer: z.string().min(1),
      validUntil: z.string().refine((date) => !isNaN(Date.parse(date)))
    })).default([]),
    ingredients: z.array(z.string()).default([]),
    allergens: z.array(z.string()).default([]),
    nutritionalClaims: z.array(z.string()).default([]),
    labeling: z.object({
      language: z.array(z.string()).default([]),
      claims: z.array(z.string()).default([]),
      warnings: z.array(z.string()).default([])
    }).optional()
  }),
  validationType: z.enum(['regulatory', 'labeling', 'safety', 'import']).default('regulatory'),
  options: z.object({
    includeRecommendations: z.boolean().default(true),
    checkRegulations: z.boolean().default(true),
    validateDocuments: z.boolean().default(false)
  }).optional()
});

const cornflakePatternSchema = z.object({
  description: z.string().min(1).max(500),
  field: z.string().min(1),
  incorrectValues: z.array(z.string()).min(1),
  correctValues: z.array(z.string()).min(1),
  category: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).default([])
});

const batchValidationSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['product', 'rfq', 'compliance']),
    data: z.any()
  })).min(1).max(100),
  validationType: z.enum(['basic', 'advanced', 'ml_enhanced']).default('basic'),
  options: z.object({
    stopOnFirstError: z.boolean().default(false),
    includeWarnings: z.boolean().default(true),
    generateReport: z.boolean().default(false)
  }).optional()
});

/**
 * @swagger
 * /api/v1/validation/product:
 *   post:
 *     summary: Validate product data
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productData
 *             properties:
 *               productData:
 *                 type: object
 *                 description: Product data to validate
 *               validationType:
 *                 type: string
 *                 enum: [basic, advanced, compliance, ml_enhanced]
 *                 default: basic
 *               targetMarkets:
 *                 type: array
 *                 items:
 *                   type: string
 *               options:
 *                 type: object
 *                 properties:
 *                   checkCornflakePatterns:
 *                     type: boolean
 *                     default: true
 *                   generateSuggestions:
 *                     type: boolean
 *                     default: true
 *                   validateCompliance:
 *                     type: boolean
 *                     default: false
 *                   includeMLAnalysis:
 *                     type: boolean
 *                     default: false
 *                   autoCorrect:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Product validation completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationResult'
 */
router.post('/product', auth, validateRequest(validateProductSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productData, validationType = 'basic', targetMarkets = [], options = {} } = req.body;
    const userId = req.user.id;

    logger.info('Product validation requested', {
      validationType,
      targetMarkets: targetMarkets.length,
      userId
    });

    const result = await EnhancedValidationService.validateProduct(
      productData,
      validationType,
      targetMarkets,
      options
    );

    res.json(apiResponse.success(result, 'Product validation completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/rfq:
 *   post:
 *     summary: Validate RFQ data
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rfqData
 *             properties:
 *               rfqData:
 *                 type: object
 *                 description: RFQ data to validate
 *               validationType:
 *                 type: string
 *                 enum: [structure, content, compliance, completeness]
 *                 default: structure
 *               options:
 *                 type: object
 *                 properties:
 *                   checkSpecifications:
 *                     type: boolean
 *                     default: true
 *                   validateBudget:
 *                     type: boolean
 *                     default: true
 *                   checkDeadlines:
 *                     type: boolean
 *                     default: true
 *                   validateRequirements:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: RFQ validation completed
 */
router.post('/rfq', auth, validateRequest(validateRFQSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rfqData, validationType = 'structure', options = {} } = req.body;
    const userId = req.user.id;

    logger.info('RFQ validation requested', { validationType, userId });

    const result = await EnhancedValidationService.validateRFQ(
      rfqData,
      validationType,
      options
    );

    res.json(apiResponse.success(result, 'RFQ validation completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/compliance:
 *   post:
 *     summary: Validate compliance data
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - complianceData
 *             properties:
 *               complianceData:
 *                 type: object
 *                 description: Compliance data to validate
 *               validationType:
 *                 type: string
 *                 enum: [regulatory, labeling, safety, import]
 *                 default: regulatory
 *               options:
 *                 type: object
 *                 properties:
 *                   includeRecommendations:
 *                     type: boolean
 *                     default: true
 *                   checkRegulations:
 *                     type: boolean
 *                     default: true
 *                   validateDocuments:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Compliance validation completed
 */
router.post('/compliance', auth, validateRequest(validateComplianceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { complianceData, validationType = 'regulatory', options = {} } = req.body;
    const userId = req.user.id;

    logger.info('Compliance validation requested', { validationType, userId });

    const result = await EnhancedValidationService.validateCompliance(
      complianceData,
      validationType,
      options
    );

    res.json(apiResponse.success(result, 'Compliance validation completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/cornflake-patterns:
 *   get:
 *     summary: Get cornflake error patterns
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity
 *       - in: query
 *         name: field
 *         schema:
 *           type: string
 *         description: Filter by field name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Cornflake patterns retrieved successfully
 */
router.get('/cornflake-patterns', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      category,
      severity,
      field,
      page = 1,
      limit = 20
    } = req.query;

    const filters = {
      category: category as string,
      severity: severity as string,
      field: field as string
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };

    logger.info('Getting cornflake patterns', { filters, pagination });

    const result = await EnhancedValidationService.getCornflakePatterns(filters, pagination);

    res.json(apiResponse.success(result, 'Cornflake patterns retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/cornflake-patterns:
 *   post:
 *     summary: Create new cornflake pattern
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - description
 *               - field
 *               - incorrectValues
 *               - correctValues
 *               - category
 *             properties:
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               field:
 *                 type: string
 *               incorrectValues:
 *                 type: array
 *                 items:
 *                   type: string
 *               correctValues:
 *                 type: array
 *                 items:
 *                   type: string
 *               category:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Cornflake pattern created successfully
 */
router.post('/cornflake-patterns', auth, validateRequest(cornflakePatternSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patternData = req.body;
    const userId = req.user.id;

    logger.info('Creating cornflake pattern', {
      field: patternData.field,
      category: patternData.category,
      userId
    });

    const pattern = await EnhancedValidationService.createCornflakePattern(patternData, userId);

    res.status(201).json(apiResponse.success(pattern, 'Cornflake pattern created successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/cornflake-patterns/{id}:
 *   put:
 *     summary: Update cornflake pattern
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Pattern ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               incorrectValues:
 *                 type: array
 *                 items:
 *                   type: string
 *               correctValues:
 *                 type: array
 *                 items:
 *                   type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Cornflake pattern updated successfully
 */
router.put('/cornflake-patterns/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    logger.info('Updating cornflake pattern', { id, userId });

    const pattern = await EnhancedValidationService.updateCornflakePattern(id, updates, userId);

    res.json(apiResponse.success(pattern, 'Cornflake pattern updated successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/cornflake-patterns/{id}:
 *   delete:
 *     summary: Delete cornflake pattern
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Pattern ID
 *     responses:
 *       200:
 *         description: Cornflake pattern deleted successfully
 */
router.delete('/cornflake-patterns/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info('Deleting cornflake pattern', { id, userId });

    await EnhancedValidationService.deleteCornflakePattern(id, userId);

    res.json(apiResponse.success(null, 'Cornflake pattern deleted successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/batch:
 *   post:
 *     summary: Perform batch validation
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                     - type
 *                     - data
 *                   properties:
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [product, rfq, compliance]
 *                     data:
 *                       type: object
 *               validationType:
 *                 type: string
 *                 enum: [basic, advanced, ml_enhanced]
 *                 default: basic
 *               options:
 *                 type: object
 *                 properties:
 *                   stopOnFirstError:
 *                     type: boolean
 *                     default: false
 *                   includeWarnings:
 *                     type: boolean
 *                     default: true
 *                   generateReport:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Batch validation completed
 */
router.post('/batch', auth, validateRequest(batchValidationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items, validationType = 'basic', options = {} } = req.body;
    const userId = req.user.id;

    logger.info('Batch validation requested', {
      itemCount: items.length,
      validationType,
      userId
    });

    const result = await EnhancedValidationService.validateBatch(
      items,
      validationType,
      options
    );

    res.json(apiResponse.success(result, 'Batch validation completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/analytics:
 *   get:
 *     summary: Get validation analytics
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter, year]
 *           default: week
 *         description: Analytics timeframe
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [product, rfq, compliance, all]
 *           default: all
 *         description: Validation type filter
 *     responses:
 *       200:
 *         description: Validation analytics retrieved successfully
 */
router.get('/analytics', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      timeframe = 'week',
      type = 'all'
    } = req.query;

    const userId = req.user.id;

    logger.info('Getting validation analytics', { timeframe, type, userId });

    const analytics = await EnhancedValidationService.getValidationAnalytics(
      timeframe as string,
      type as string
    );

    res.json(apiResponse.success(analytics, 'Validation analytics retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/suggestions:
 *   post:
 *     summary: Get AI suggestions for data improvement
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *               - dataType
 *             properties:
 *               data:
 *                 type: object
 *                 description: Data to analyze for suggestions
 *               dataType:
 *                 type: string
 *                 enum: [product, rfq, compliance]
 *               includeMLAnalysis:
 *                 type: boolean
 *                 default: true
 *               maxSuggestions:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *     responses:
 *       200:
 *         description: AI suggestions generated successfully
 */
router.post('/suggestions', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      data,
      dataType,
      includeMLAnalysis = true,
      maxSuggestions = 10
    } = req.body;
    const userId = req.user.id;

    logger.info('AI suggestions requested', { dataType, includeMLAnalysis, userId });

    const suggestions = await EnhancedValidationService.generateSuggestions(
      data,
      dataType,
      {
        includeMLAnalysis,
        maxSuggestions
      }
    );

    res.json(apiResponse.success(suggestions, 'AI suggestions generated successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/validation/health:
 *   get:
 *     summary: Get validation service health status
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation service health status
 */
router.get('/health', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const health = await EnhancedValidationService.getServiceHealth();

    res.json(apiResponse.success(health, 'Validation service health retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;
