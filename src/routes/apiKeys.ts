import express from 'express';
import { body, param, query } from 'express-validator';

import { ApiKeyController } from '../controllers/ApiKeyController';
import { validateRequest, commonValidations } from '../middleware/advancedValidation';
import { requireAuth } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { extractTenantContext, enforceTenantIsolation, requireTenantFeature, tenantFeatures } from '../middleware/tenantIsolation';


const router = express.Router();
const apiKeyController = new ApiKeyController();

// Apply authentication and tenant context to all routes
router.use(requireAuth);
router.use(extractTenantContext);
router.use(enforceTenantIsolation);
router.use(requireTenantFeature(tenantFeatures.API_ACCESS));

// Apply rate limiting
router.use(apiRateLimiter);

/**
 * @swagger
 * /api/keys:
 *   get:
 *     summary: List all API keys for the tenant
 *     tags: [API Keys]
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
 *           enum: [active, inactive, expired]
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
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
 *                     keys:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           lastUsedAt:
 *                             type: string
 *                             format: date-time
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           isActive:
 *                             type: boolean
 */
router.get('/',
  [
    ...commonValidations.pagination(),
    query('status').optional().isIn(['active', 'inactive', 'expired'])
  ],
  validateRequest,
  apiKeyController.listApiKeys
);

/**
 * @swagger
 * /api/keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
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
 *               - permissions
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the API key
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [read, write, delete, admin]
 *               expiresIn:
 *                 type: integer
 *                 description: Number of days until expiration
 *               rateLimit:
 *                 type: integer
 *                 description: Custom rate limit (requests per minute)
 *               allowedIPs:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: ipv4
 *               allowedDomains:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: hostname
 *     responses:
 *       201:
 *         description: API key created successfully
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
 *                     id:
 *                       type: string
 *                     key:
 *                       type: string
 *                       description: The actual API key (shown only once)
 *                     name:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 */
router.post('/',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('API key name is required')
      .isLength({ min: 3, max: 50 })
      .withMessage('Name must be between 3 and 50 characters'),

    body('permissions')
      .isArray({ min: 1 })
      .withMessage('At least one permission is required'),

    body('permissions.*')
      .isIn(['read', 'write', 'delete', 'admin', '*'])
      .withMessage('Invalid permission'),

    body('expiresIn')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Expiration must be between 1 and 365 days'),

    body('rateLimit')
      .optional()
      .isInt({ min: 10, max: 10000 })
      .withMessage('Rate limit must be between 10 and 10000 requests per minute'),

    body('allowedIPs')
      .optional()
      .isArray()
      .withMessage('Allowed IPs must be an array'),

    body('allowedIPs.*')
      .isIP()
      .withMessage('Invalid IP address'),

    body('allowedDomains')
      .optional()
      .isArray()
      .withMessage('Allowed domains must be an array'),

    body('allowedDomains.*')
      .isFQDN()
      .withMessage('Invalid domain')
  ],
  validateRequest,
  apiKeyController.createApiKey
);

/**
 * @swagger
 * /api/keys/{keyId}:
 *   get:
 *     summary: Get API key details
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key details retrieved successfully
 */
router.get('/:keyId',
  [
    param('keyId').isAlphanumeric().isLength({ min: 8, max: 16 })
  ],
  validateRequest,
  apiKeyController.getApiKey
);

/**
 * @swagger
 * /api/keys/{keyId}:
 *   put:
 *     summary: Update API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
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
 *               name:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               rateLimit:
 *                 type: integer
 *               allowedIPs:
 *                 type: array
 *                 items:
 *                   type: string
 *               allowedDomains:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: API key updated successfully
 */
router.put('/:keyId',
  [
    param('keyId').isAlphanumeric().isLength({ min: 8, max: 16 }),

    body('name')
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Name must be between 3 and 50 characters'),

    body('permissions')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one permission is required'),

    body('permissions.*')
      .isIn(['read', 'write', 'delete', 'admin', '*'])
      .withMessage('Invalid permission'),

    body('rateLimit')
      .optional()
      .isInt({ min: 10, max: 10000 })
      .withMessage('Rate limit must be between 10 and 10000 requests per minute'),

    body('allowedIPs')
      .optional()
      .isArray()
      .withMessage('Allowed IPs must be an array'),

    body('allowedIPs.*')
      .isIP()
      .withMessage('Invalid IP address'),

    body('allowedDomains')
      .optional()
      .isArray()
      .withMessage('Allowed domains must be an array'),

    body('allowedDomains.*')
      .isFQDN()
      .withMessage('Invalid domain')
  ],
  validateRequest,
  apiKeyController.updateApiKey
);

/**
 * @swagger
 * /api/keys/{keyId}/revoke:
 *   post:
 *     summary: Revoke an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key revoked successfully
 */
router.post('/:keyId/revoke',
  [
    param('keyId').isAlphanumeric().isLength({ min: 8, max: 16 })
  ],
  validateRequest,
  apiKeyController.revokeApiKey
);

/**
 * @swagger
 * /api/keys/{keyId}/regenerate:
 *   post:
 *     summary: Regenerate an API key
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: API key regenerated successfully
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
 *                     key:
 *                       type: string
 *                       description: The new API key (shown only once)
 */
router.post('/:keyId/regenerate',
  [
    param('keyId').isAlphanumeric().isLength({ min: 8, max: 16 })
  ],
  validateRequest,
  apiKeyController.regenerateApiKey
);

/**
 * @swagger
 * /api/keys/{keyId}/usage:
 *   get:
 *     summary: Get API key usage statistics
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           minimum: 1
 *           maximum: 90
 *     responses:
 *       200:
 *         description: API key usage statistics retrieved successfully
 */
router.get('/:keyId/usage',
  [
    param('keyId').isAlphanumeric().isLength({ min: 8, max: 16 }),
    query('days')
      .optional()
      .isInt({ min: 1, max: 90 })
      .withMessage('Days must be between 1 and 90')
  ],
  validateRequest,
  apiKeyController.getApiKeyUsage
);

/**
 * @swagger
 * /api/keys/validate:
 *   post:
 *     summary: Validate an API key
 *     tags: [API Keys]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *             properties:
 *               key:
 *                 type: string
 *                 description: The API key to validate
 *     responses:
 *       200:
 *         description: API key validation result
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
 *                     valid:
 *                       type: boolean
 *                     tenantId:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.post('/validate',
  [
    body('key')
      .notEmpty()
      .withMessage('API key is required')
      .matches(/^fx_[A-Za-z0-9_-]{43}$/)
      .withMessage('Invalid API key format')
  ],
  validateRequest,
  apiKeyController.validateApiKey
);

export default router;
