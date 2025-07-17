import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { auth } from '../../middleware/auth';
import { validateRequest } from '../../middleware/advancedValidation';
import { Logger } from '../../core/logging/logger';
import { apiResponse } from '../../utils/apiResponse';
import EnhancedRFQService from '../../services/marketplace/EnhancedRFQService';
import { z } from 'zod';

const router = express.Router();
const logger = new Logger('RFQRoutes');

// Validation schemas
const createRFQSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  visibility: z.enum(['public', 'private', 'invited_only']).default('public'),
  deadline: z.string().refine((date) => !isNaN(Date.parse(date))),
  productSpecs: z.array(z.object({
    name: z.string().min(1),
    category: z.string().min(1),
    subcategory: z.string().optional(),
    description: z.string().min(1),
    quantity: z.object({
      amount: z.number().positive(),
      unit: z.string().min(1),
      tolerance: z.number().min(0).max(1).default(0.1),
      isFlexible: z.boolean().default(false),
      minimumOrder: z.number().positive(),
      maximumOrder: z.number().positive().optional(),
      frequency: z.enum(['one_time', 'weekly', 'monthly', 'quarterly', 'annual']).default('one_time'),
      duration: z.number().positive().optional(),
    }),
    qualityRequirements: z.array(z.object({
      type: z.enum(['certification', 'specification', 'test_result', 'sample']),
      name: z.string().min(1),
      value: z.any(),
      operator: z.enum(['equals', 'greater_than', 'less_than', 'contains', 'range']).default('equals'),
      required: z.boolean().default(true),
      priority: z.enum(['must_have', 'nice_to_have', 'preferred']).default('must_have'),
      verification: z.enum(['document', 'test', 'audit', 'self_declaration']).default('document'),
    })).default([]),
    packaging: z.object({
      type: z.string().min(1),
      size: z.string().min(1),
      material: z.string().min(1),
      sustainability: z.array(z.string()).default([]),
      labeling: z.array(z.string()).default([]),
      customRequirements: z.array(z.string()).default([]),
    }),
    delivery: z.object({
      location: z.string().min(1),
      coordinates: z.object({
        lat: z.number(),
        lng: z.number(),
      }).optional(),
      timeframe: z.string().min(1),
      incoterms: z.string().min(1),
      transportation: z.array(z.string()).default([]),
      specialRequirements: z.array(z.string()).default([]),
    }),
    pricing: z.object({
      currency: z.string().length(3).default('USD'),
      budgetRange: z.object({
        min: z.number().positive(),
        max: z.number().positive(),
      }),
      paymentTerms: z.string().min(1),
      priceIncludes: z.array(z.string()).default([]),
      negotiable: z.boolean().default(true),
      volumeDiscounts: z.boolean().default(false),
    }),
    compliance: z.object({
      certifications: z.array(z.string()).default([]),
      regulations: z.array(z.string()).default([]),
      testing: z.array(z.string()).default([]),
      documentation: z.array(z.string()).default([]),
      region: z.string().min(1),
    }),
    isOptional: z.boolean().default(false),
    priority: z.number().min(1).max(10).default(5),
  })).min(1),
  requirements: z.object({
    totalBudget: z.number().positive(),
    currency: z.string().length(3).default('USD'),
    deliveryLocation: z.string().min(1),
    deliveryDate: z.string().refine((date) => !isNaN(Date.parse(date))),
    paymentTerms: z.string().min(1),
    qualityStandards: z.array(z.string()).default([]),
    certifications: z.array(z.string()).default([]),
    supplierRequirements: z.array(z.object({
      type: z.enum(['certification', 'experience', 'capacity', 'location', 'rating']),
      description: z.string().min(1),
      required: z.boolean().default(true),
      weight: z.number().min(0).max(1).default(0.5),
    })).default([]),
    contractTerms: z.array(z.string()).default([]),
    specialInstructions: z.string().default(''),
  }),
  tags: z.array(z.string()).default([]),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string().url(),
    description: z.string().optional(),
    isPublic: z.boolean().default(true),
  })).default([]),
});

const updateRFQSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  deadline: z.string().refine((date) => !isNaN(Date.parse(date))).optional(),
  tags: z.array(z.string()).optional(),
});

const submitProposalSchema = z.object({
  products: z.array(z.object({
    specId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    totalPrice: z.number().positive(),
    specifications: z.record(z.any()).default({}),
    quality: z.object({
      certifications: z.array(z.object({
        type: z.string().min(1),
        issuer: z.string().min(1),
        number: z.string().min(1),
        validUntil: z.string().refine((date) => !isNaN(Date.parse(date))),
        documentUrl: z.string().url(),
        verified: z.boolean().default(false),
      })).default([]),
      testResults: z.array(z.object({
        type: z.string().min(1),
        result: z.any(),
        date: z.string().refine((date) => !isNaN(Date.parse(date))),
        lab: z.string().min(1),
        documentUrl: z.string().url(),
      })).default([]),
      qualityGuarantee: z.string().default(''),
      warranty: z.string().default(''),
      returns: z.string().default(''),
    }),
    packaging: z.object({
      type: z.string().min(1),
      size: z.string().min(1),
      material: z.string().min(1),
      sustainability: z.array(z.string()).default([]),
      customization: z.array(z.string()).default([]),
    }),
    delivery: z.object({
      method: z.string().min(1),
      timeframe: z.string().min(1),
      cost: z.number().min(0),
      insurance: z.boolean().default(false),
      tracking: z.boolean().default(false),
    }),
    alternatives: z.array(z.object({
      description: z.string().min(1),
      price: z.number().positive(),
      specifications: z.record(z.any()).default({}),
      advantages: z.array(z.string()).default([]),
    })).default([]),
    samples: z.array(z.object({
      description: z.string().min(1),
      cost: z.number().min(0),
      deliveryTime: z.number().positive(),
      available: z.boolean().default(true),
    })).default([]),
  })).min(1),
  currency: z.string().length(3).default('USD'),
  deliveryTime: z.number().positive(),
  deliveryDate: z.string().refine((date) => !isNaN(Date.parse(date))),
  validUntil: z.string().refine((date) => !isNaN(Date.parse(date))),
  paymentTerms: z.string().min(1),
  terms: z.object({
    paymentTerms: z.string().min(1),
    deliveryTerms: z.string().min(1),
    warranty: z.string().min(1),
    returns: z.string().min(1),
    penalties: z.string().min(1),
    bonuses: z.string().min(1),
    exclusivity: z.boolean().default(false),
    confidentiality: z.boolean().default(true),
  }),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string().url(),
    description: z.string().optional(),
  })).default([]),
});

/**
 * @swagger
 * /api/v1/rfq:
 *   post:
 *     summary: Create new RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRFQRequest'
 *     responses:
 *       201:
 *         description: RFQ created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RFQ'
 */
router.post('/', auth, validateRequest(createRFQSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rfqData = req.body;
    const buyerId = req.user.id;
    const { autoPublish = false, generateMatching = true, notifySuppliers = false } = req.query;

    logger.info('Creating RFQ', { title: rfqData.title, buyerId });

    // Convert date strings to Date objects
    const processedRFQData = {
      ...rfqData,
      deadline: new Date(rfqData.deadline),
      requirements: {
        ...rfqData.requirements,
        deliveryDate: new Date(rfqData.requirements.deliveryDate),
      },
    };

    const rfq = await EnhancedRFQService.createRFQ(buyerId, processedRFQData, {
      autoPublish: autoPublish === 'true',
      generateMatching: generateMatching === 'true',
      notifySuppliers: notifySuppliers === 'true',
    });

    res.status(201).json(apiResponse.success(rfq, 'RFQ created successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq:
 *   get:
 *     summary: Get all RFQs (with filters)
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, closed, awarded, cancelled, expired]
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by product category
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by delivery location
 *       - in: query
 *         name: budgetMin
 *         schema:
 *           type: number
 *         description: Minimum budget
 *       - in: query
 *         name: budgetMax
 *         schema:
 *           type: number
 *         description: Maximum budget
 *       - in: query
 *         name: matchingScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum matching score for suppliers
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
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, deadline, budget, priority]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: RFQs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     rfqs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/RFQ'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      category,
      location,
      budgetMin,
      budgetMax,
      matchingScore,
      page = 1,
      limit = 20,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    const filters = {
      status: status as string,
      category: category as string,
      location: location as string,
      budgetRange: budgetMin || budgetMax ? {
        min: budgetMin ? parseFloat(budgetMin as string) : undefined,
        max: budgetMax ? parseFloat(budgetMax as string) : undefined,
      } : undefined,
      matchingScore: matchingScore ? parseFloat(matchingScore as string) : undefined,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    };

    const sortField = `${order === 'desc' ? '-' : ''}${sort}`;

    logger.info('Getting RFQs', { filters, pagination, sort: sortField });

    const result = await EnhancedRFQService.listRFQs(filters, pagination.page, pagination.limit, sortField);

    res.json(apiResponse.success(result, 'RFQs retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}:
 *   get:
 *     summary: Get specific RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     responses:
 *       200:
 *         description: RFQ details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RFQ'
 */
router.get('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info('Getting RFQ', { id, userId });

    const rfq = await EnhancedRFQService.getRFQ(id, userId);

    if (!rfq) {
      return res.status(404).json(apiResponse.error('RFQ not found', 'NOT_FOUND'));
    }

    res.json(apiResponse.success(rfq, 'RFQ retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}:
 *   put:
 *     summary: Update RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRFQRequest'
 *     responses:
 *       200:
 *         description: RFQ updated successfully
 */
router.put('/:id', auth, validateRequest(updateRFQSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const buyerId = req.user.id;

    logger.info('Updating RFQ', { id, buyerId });

    // Convert date strings to Date objects
    const processedUpdates = {
      ...updates,
      deadline: updates.deadline ? new Date(updates.deadline) : undefined,
    };

    const rfq = await EnhancedRFQService.updateRFQ(id, buyerId, processedUpdates);

    res.json(apiResponse.success(rfq, 'RFQ updated successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}:
 *   delete:
 *     summary: Delete RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     responses:
 *       200:
 *         description: RFQ deleted successfully
 */
router.delete('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const buyerId = req.user.id;

    logger.info('Deleting RFQ', { id, buyerId });

    await EnhancedRFQService.deleteRFQ(id, buyerId);

    res.json(apiResponse.success(null, 'RFQ deleted successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/publish:
 *   post:
 *     summary: Publish RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notifySuppliers:
 *                 type: boolean
 *                 default: true
 *               targetSuppliers:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: RFQ published successfully
 */
router.post('/:id/publish', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { notifySuppliers = true, targetSuppliers } = req.body;
    const buyerId = req.user.id;

    logger.info('Publishing RFQ', { id, buyerId });

    const rfq = await EnhancedRFQService.publishRFQ(id, buyerId, {
      notifySuppliers,
      targetSuppliers,
    });

    res.json(apiResponse.success(rfq, 'RFQ published successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/proposal:
 *   post:
 *     summary: Submit proposal to RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitProposalRequest'
 *     responses:
 *       201:
 *         description: Proposal submitted successfully
 */
router.post('/:id/proposal', auth, validateRequest(submitProposalSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rfqId } = req.params;
    const proposalData = req.body;
    const supplierId = req.user.id;
    const { submitAsDraft = false, requestComplianceCheck = true, attachSamples = false } = req.query;

    logger.info('Submitting proposal', { rfqId, supplierId });

    // Convert date strings to Date objects
    const processedProposalData = {
      ...proposalData,
      deliveryDate: new Date(proposalData.deliveryDate),
      validUntil: new Date(proposalData.validUntil),
      products: proposalData.products.map((product: any) => ({
        ...product,
        quality: {
          ...product.quality,
          certifications: product.quality.certifications.map((cert: any) => ({
            ...cert,
            validUntil: new Date(cert.validUntil),
          })),
          testResults: product.quality.testResults.map((test: any) => ({
            ...test,
            date: new Date(test.date),
          })),
        },
      })),
    };

    const proposal = await EnhancedRFQService.submitProposal(rfqId, supplierId, processedProposalData, {
      submitAsDraft: submitAsDraft === 'true',
      requestComplianceCheck: requestComplianceCheck === 'true',
      attachSamples: attachSamples === 'true',
    });

    res.status(201).json(apiResponse.success(proposal, 'Proposal submitted successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/proposals:
 *   get:
 *     summary: Get all proposals for RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     responses:
 *       200:
 *         description: Proposals retrieved successfully
 */
router.get('/:id/proposals', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info('Getting RFQ proposals', { id, userId });

    const rfq = await EnhancedRFQService.getRFQ(id, userId);

    if (!rfq) {
      return res.status(404).json(apiResponse.error('RFQ not found', 'NOT_FOUND'));
    }

    res.json(apiResponse.success(rfq.proposals, 'Proposals retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/proposal/{proposalId}/accept:
 *   put:
 *     summary: Accept proposal
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *       - in: path
 *         name: proposalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Proposal ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               closeRFQ:
 *                 type: boolean
 *                 default: true
 *               createContract:
 *                 type: boolean
 *                 default: false
 *               notifyOthers:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Proposal accepted successfully
 */
router.put('/:id/proposal/:proposalId/accept', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: rfqId, proposalId } = req.params;
    const { closeRFQ = true, createContract = false, notifyOthers = true } = req.body;
    const buyerId = req.user.id;

    logger.info('Accepting proposal', { rfqId, proposalId, buyerId });

    const proposal = await EnhancedRFQService.acceptProposal(rfqId, proposalId, buyerId, {
      closeRFQ,
      createContract,
      notifyOthers,
    });

    res.json(apiResponse.success(proposal, 'Proposal accepted successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/close:
 *   put:
 *     summary: Close RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for closing
 *     responses:
 *       200:
 *         description: RFQ closed successfully
 */
router.put('/:id/close', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const buyerId = req.user.id;

    logger.info('Closing RFQ', { id, buyerId, reason });

    const rfq = await EnhancedRFQService.closeRFQ(id, buyerId);

    res.json(apiResponse.success(rfq, 'RFQ closed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/buyer/{buyerId}:
 *   get:
 *     summary: Get buyer's RFQs
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buyerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Buyer ID
 *     responses:
 *       200:
 *         description: Buyer's RFQs retrieved successfully
 */
router.get('/buyer/:buyerId', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buyerId } = req.params;
    const userId = req.user.id;

    // Only allow users to get their own RFQs or admin users
    if (buyerId !== userId && req.user.role !== 'admin') {
      return res.status(403).json(apiResponse.error('Access denied', 'FORBIDDEN'));
    }

    logger.info('Getting buyer RFQs', { buyerId });

    const rfqs = await EnhancedRFQService.getBuyerRFQs(buyerId);

    res.json(apiResponse.success(rfqs, 'Buyer RFQs retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/supplier/{supplierId}/opportunities:
 *   get:
 *     summary: Get supplier opportunities
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: supplierId
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Product category filter
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Location filter
 *       - in: query
 *         name: budgetMin
 *         schema:
 *           type: number
 *         description: Minimum budget
 *       - in: query
 *         name: budgetMax
 *         schema:
 *           type: number
 *         description: Maximum budget
 *       - in: query
 *         name: matchingScore
 *         schema:
 *           type: number
 *           minimum: 0
 *           maximum: 1
 *         description: Minimum matching score
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
 *         description: Supplier opportunities retrieved successfully
 */
router.get('/supplier/:supplierId/opportunities', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId } = req.params;
    const userId = req.user.id;

    // Only allow suppliers to get their own opportunities or admin users
    if (supplierId !== userId && req.user.role !== 'admin') {
      return res.status(403).json(apiResponse.error('Access denied', 'FORBIDDEN'));
    }

    const {
      category,
      location,
      budgetMin,
      budgetMax,
      matchingScore,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {
      category: category as string,
      location: location as string,
      budgetRange: budgetMin || budgetMax ? {
        min: budgetMin ? parseFloat(budgetMin as string) : undefined,
        max: budgetMax ? parseFloat(budgetMax as string) : undefined,
      } : undefined,
      matchingScore: matchingScore ? parseFloat(matchingScore as string) : undefined,
    };

    const pagination = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    };

    logger.info('Getting supplier opportunities', { supplierId, filters, pagination });

    const opportunities = await EnhancedRFQService.getRFQOpportunities(supplierId, filters, pagination);

    res.json(apiResponse.success(opportunities, 'Supplier opportunities retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/rfq/{id}/analytics:
 *   get:
 *     summary: Get RFQ analytics
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ ID
 *     responses:
 *       200:
 *         description: RFQ analytics retrieved successfully
 */
router.get('/:id/analytics', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info('Getting RFQ analytics', { id, userId });

    const analytics = await EnhancedRFQService.getRFQAnalytics(id);

    res.json(apiResponse.success(analytics, 'RFQ analytics retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;