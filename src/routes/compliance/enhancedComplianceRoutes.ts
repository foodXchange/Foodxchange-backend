import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { auth } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validation';
import { Logger } from '../../core/logging/logger';
import { apiResponse } from '../../utils/apiResponse';
import EnhancedComplianceService from '../../services/compliance/EnhancedComplianceService';
import { z } from 'zod';

const router = express.Router();
const logger = new Logger('ComplianceRoutes');

// Validation schemas
const complianceCheckSchema = z.object({
  productId: z.string().min(1),
  region: z.string().min(1),
  options: z.object({
    skipCache: z.boolean().optional(),
    includeAIAnalysis: z.boolean().optional(),
    generateReport: z.boolean().optional(),
  }).optional(),
});

const certificationUploadSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['organic', 'halal', 'kosher', 'fairtrade', 'non-gmo', 'brc', 'ifs', 'haccp', 'gmp', 'iso22000', 'sqs', 'fssc22000']),
  issuingBody: z.string().min(1),
  certificateNumber: z.string().min(1),
  issueDate: z.string().refine((date) => !isNaN(Date.parse(date))),
  expiryDate: z.string().refine((date) => !isNaN(Date.parse(date))),
  documentUrl: z.string().url().optional(),
  scope: z.string().optional(),
  restrictions: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

const complianceReportSchema = z.object({
  checkId: z.string().min(1),
  reportType: z.enum(['summary', 'detailed', 'regulatory', 'audit']).default('summary'),
});

/**
 * @swagger
 * /api/v1/compliance/check:
 *   post:
 *     summary: Perform compliance check
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - region
 *             properties:
 *               productId:
 *                 type: string
 *                 description: Product ID to check
 *               region:
 *                 type: string
 *                 description: Target region for compliance
 *               options:
 *                 type: object
 *                 properties:
 *                   skipCache:
 *                     type: boolean
 *                     description: Skip cache and force fresh check
 *                   includeAIAnalysis:
 *                     type: boolean
 *                     description: Include AI-powered analysis
 *                   generateReport:
 *                     type: boolean
 *                     description: Generate compliance report
 *     responses:
 *       200:
 *         description: Compliance check completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComplianceCheck'
 */
router.post('/check', auth, validateRequest(complianceCheckSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, region, options = {} } = req.body;
    const userId = req.user.id;

    logger.info('Compliance check requested', { productId, region, userId });

    const complianceCheck = await EnhancedComplianceService.performComplianceCheck(
      productId,
      region,
      userId,
      options
    );

    res.json(apiResponse.success(complianceCheck, 'Compliance check completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/{id}:
 *   get:
 *     summary: Get compliance check status
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Compliance check ID
 *     responses:
 *       200:
 *         description: Compliance check details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ComplianceCheck'
 */
router.get('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info('Getting compliance check', { id, userId });

    // Get compliance check (implementation would include access validation)
    const complianceCheck = await EnhancedComplianceService.getComplianceCheck(id);

    if (!complianceCheck) {
      return res.status(404).json(apiResponse.error('Compliance check not found', 'NOT_FOUND'));
    }

    res.json(apiResponse.success(complianceCheck, 'Compliance check retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/{id}/approve:
 *   put:
 *     summary: Approve compliance check
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Compliance check ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Approval notes
 *     responses:
 *       200:
 *         description: Compliance check approved
 */
router.put('/:id/approve', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;

    logger.info('Approving compliance check', { id, userId });

    // Implementation for approval
    const result = await EnhancedComplianceService.approveComplianceCheck(id, userId, notes);

    res.json(apiResponse.success(result, 'Compliance check approved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/product/{productId}:
 *   get:
 *     summary: Get product compliance status
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *         description: Target region
 *     responses:
 *       200:
 *         description: Product compliance status
 */
router.get('/product/:productId', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const { region } = req.query;
    const userId = req.user.id;

    logger.info('Getting product compliance', { productId, region, userId });

    const compliance = await EnhancedComplianceService.getProductCompliance(productId, region as string);

    res.json(apiResponse.success(compliance, 'Product compliance retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/certification:
 *   post:
 *     summary: Upload certification
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - issuingBody
 *               - certificateNumber
 *               - issueDate
 *               - expiryDate
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [organic, halal, kosher, fairtrade, non-gmo, brc, ifs, haccp, gmp, iso22000, sqs, fssc22000]
 *               issuingBody:
 *                 type: string
 *               certificateNumber:
 *                 type: string
 *               issueDate:
 *                 type: string
 *                 format: date
 *               expiryDate:
 *                 type: string
 *                 format: date
 *               documentUrl:
 *                 type: string
 *                 format: url
 *               scope:
 *                 type: string
 *               restrictions:
 *                 type: array
 *                 items:
 *                   type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Certification uploaded successfully
 */
router.post('/certification', auth, validateRequest(certificationUploadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const certificationData = req.body;
    const userId = req.user.id;
    const companyId = req.user.company;

    logger.info('Uploading certification', { type: certificationData.type, userId });

    const certification = await EnhancedComplianceService.createCertification(companyId, {
      ...certificationData,
      issueDate: new Date(certificationData.issueDate),
      expiryDate: new Date(certificationData.expiryDate),
    });

    res.status(201).json(apiResponse.success(certification, 'Certification uploaded successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/certifications:
 *   get:
 *     summary: Get company certifications
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeExpired
 *         schema:
 *           type: boolean
 *         description: Include expired certifications
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by certification type
 *     responses:
 *       200:
 *         description: Company certifications
 */
router.get('/certifications', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { includeExpired = false, type } = req.query;
    const companyId = req.user.company;

    logger.info('Getting company certifications', { companyId, includeExpired, type });

    const certifications = await EnhancedComplianceService.getCompanyCertifications(
      companyId,
      includeExpired === 'true'
    );

    // Filter by type if specified
    const filteredCertifications = type 
      ? certifications.filter(cert => cert.type === type)
      : certifications;

    res.json(apiResponse.success(filteredCertifications, 'Certifications retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/report:
 *   post:
 *     summary: Generate compliance report
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checkId
 *             properties:
 *               checkId:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [summary, detailed, regulatory, audit]
 *                 default: summary
 *     responses:
 *       200:
 *         description: Compliance report generated
 */
router.post('/report', auth, validateRequest(complianceReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { checkId, reportType = 'summary' } = req.body;
    const userId = req.user.id;

    logger.info('Generating compliance report', { checkId, reportType, userId });

    const report = await EnhancedComplianceService.generateComplianceReport(checkId, reportType);

    res.json(apiResponse.success(report, 'Compliance report generated successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/validate:
 *   post:
 *     summary: Validate compliance for product data
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productType
 *             properties:
 *               productType:
 *                 type: string
 *               targetMarket:
 *                 type: string
 *               certifications:
 *                 type: array
 *                 items:
 *                   type: string
 *               specifications:
 *                 type: object
 *               ingredients:
 *                 type: array
 *                 items:
 *                   type: string
 *               allergens:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Compliance validation result
 */
router.post('/validate', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validationRequest = req.body;
    const userId = req.user.id;

    logger.info('Validating compliance', { productType: validationRequest.productType, userId });

    const validation = await EnhancedComplianceService.validateCompliance(validationRequest);

    res.json(apiResponse.success(validation, 'Compliance validation completed successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/expiring:
 *   get:
 *     summary: Get expiring certifications
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: daysAhead
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days ahead to check
 *     responses:
 *       200:
 *         description: Expiring certifications
 */
router.get('/expiring', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { daysAhead = 30 } = req.query;
    const userId = req.user.id;

    logger.info('Getting expiring certifications', { daysAhead, userId });

    const expiringCertifications = await EnhancedComplianceService.getExpiringCertifications(
      parseInt(daysAhead as string)
    );

    res.json(apiResponse.success(expiringCertifications, 'Expiring certifications retrieved successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/certification/{id}:
 *   put:
 *     summary: Update certification
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certification ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               documentUrl:
 *                 type: string
 *                 format: url
 *               scope:
 *                 type: string
 *               restrictions:
 *                 type: array
 *                 items:
 *                   type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Certification updated successfully
 */
router.put('/certification/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user.id;
    const companyId = req.user.company;

    logger.info('Updating certification', { id, userId });

    const certification = await EnhancedComplianceService.updateCertification(id, companyId, updates);

    res.json(apiResponse.success(certification, 'Certification updated successfully'));
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/compliance/certification/{id}:
 *   delete:
 *     summary: Delete certification
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certification ID
 *     responses:
 *       200:
 *         description: Certification deleted successfully
 */
router.delete('/certification/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const companyId = req.user.company;

    logger.info('Deleting certification', { id, userId });

    await EnhancedComplianceService.deleteCertification(id, companyId);

    res.json(apiResponse.success(null, 'Certification deleted successfully'));
  } catch (error) {
    next(error);
  }
});

export default router;