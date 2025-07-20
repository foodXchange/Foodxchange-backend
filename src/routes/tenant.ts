import express from 'express';
import { body, param, query } from 'express-validator';

import { TenantController } from '../controllers/TenantController';
import { validateRequest } from '../middleware/advancedValidation';
import { requireAuth } from '../middleware/auth';
import {
  extractTenantContext,
  enforceTenantIsolation,
  requireTenantFeature,
  tenantFeatures
} from '../middleware/tenantIsolation';


const router = express.Router();
const tenantController = new TenantController();

// Apply authentication and tenant context extraction to all routes
router.use(requireAuth);
router.use(extractTenantContext);

/**
 * @swagger
 * /api/tenant/info:
 *   get:
 *     summary: Get current tenant information
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant information retrieved successfully
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
 *                     name:
 *                       type: string
 *                     subscriptionTier:
 *                       type: string
 *                     features:
 *                       type: array
 *                       items:
 *                         type: string
 *                     limits:
 *                       type: object
 */
router.get('/info', tenantController.getTenantInfo);

/**
 * @swagger
 * /api/tenant/usage:
 *   get:
 *     summary: Get tenant resource usage
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant usage information retrieved successfully
 */
router.get('/usage', tenantController.getTenantUsage);

/**
 * @swagger
 * /api/tenant/features:
 *   get:
 *     summary: Get available features for tenant
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available features retrieved successfully
 */
router.get('/features', tenantController.getAvailableFeatures);

/**
 * @swagger
 * /api/tenant/settings:
 *   get:
 *     summary: Get tenant settings
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant settings retrieved successfully
 */
router.get('/settings', tenantController.getTenantSettings);

/**
 * @swagger
 * /api/tenant/settings:
 *   put:
 *     summary: Update tenant settings
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customBranding:
 *                 type: boolean
 *               customDomain:
 *                 type: string
 *               webhookEndpoints:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Tenant settings updated successfully
 */
router.put('/settings',
  [
    body('customBranding').optional().isBoolean(),
    body('customDomain').optional().isURL(),
    body('webhookEndpoints').optional().isArray(),
    body('webhookEndpoints.*').isURL()
  ],
  validateRequest,
  tenantController.updateTenantSettings
);

/**
 * @swagger
 * /api/tenant/users:
 *   get:
 *     summary: Get tenant users
 *     tags: [Tenant]
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
 *         name: role
 *         schema:
 *           type: string
 *           enum: [buyer, seller, admin, contractor, agent]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, locked, suspended]
 *     responses:
 *       200:
 *         description: Tenant users retrieved successfully
 */
router.get('/users',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isIn(['buyer', 'seller', 'admin', 'contractor', 'agent']),
    query('status').optional().isIn(['active', 'inactive', 'locked', 'suspended'])
  ],
  validateRequest,
  enforceTenantIsolation,
  tenantController.getTenantUsers
);

/**
 * @swagger
 * /api/tenant/users/{userId}:
 *   get:
 *     summary: Get tenant user details
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant user details retrieved successfully
 */
router.get('/users/:userId',
  [param('userId').isMongoId()],
  validateRequest,
  enforceTenantIsolation,
  tenantController.getTenantUser
);

/**
 * @swagger
 * /api/tenant/users/{userId}/role:
 *   put:
 *     summary: Update tenant user role
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               role:
 *                 type: string
 *                 enum: [buyer, seller, admin, contractor, agent]
 *             required:
 *               - role
 *     responses:
 *       200:
 *         description: User role updated successfully
 */
router.put('/users/:userId/role',
  [
    param('userId').isMongoId(),
    body('role').isIn(['buyer', 'seller', 'admin', 'contractor', 'agent'])
  ],
  validateRequest,
  enforceTenantIsolation,
  tenantController.updateUserRole
);

/**
 * @swagger
 * /api/tenant/users/{userId}/status:
 *   put:
 *     summary: Update tenant user status
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               status:
 *                 type: string
 *                 enum: [active, inactive, locked, suspended]
 *             required:
 *               - status
 *     responses:
 *       200:
 *         description: User status updated successfully
 */
router.put('/users/:userId/status',
  [
    param('userId').isMongoId(),
    body('status').isIn(['active', 'inactive', 'locked', 'suspended'])
  ],
  validateRequest,
  enforceTenantIsolation,
  tenantController.updateUserStatus
);

/**
 * @swagger
 * /api/tenant/invite:
 *   post:
 *     summary: Invite user to tenant
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               role:
 *                 type: string
 *                 enum: [buyer, seller, admin, contractor, agent]
 *               displayName:
 *                 type: string
 *             required:
 *               - email
 *               - role
 *     responses:
 *       200:
 *         description: User invitation sent successfully
 */
router.post('/invite',
  [
    body('email').isEmail(),
    body('role').isIn(['buyer', 'seller', 'admin', 'contractor', 'agent']),
    body('displayName').optional().isString().isLength({ min: 1, max: 100 })
  ],
  validateRequest,
  enforceTenantIsolation,
  requireTenantFeature(tenantFeatures.API_ACCESS),
  tenantController.inviteUser
);

/**
 * @swagger
 * /api/tenant/subscription:
 *   get:
 *     summary: Get tenant subscription details
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription details retrieved successfully
 */
router.get('/subscription', tenantController.getSubscriptionDetails);

/**
 * @swagger
 * /api/tenant/subscription/upgrade:
 *   post:
 *     summary: Upgrade tenant subscription
 *     tags: [Tenant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tier:
 *                 type: string
 *                 enum: [basic, standard, premium, enterprise]
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *             required:
 *               - tier
 *     responses:
 *       200:
 *         description: Subscription upgrade initiated successfully
 */
router.post('/subscription/upgrade',
  [
    body('tier').isIn(['basic', 'standard', 'premium', 'enterprise']),
    body('billingCycle').optional().isIn(['monthly', 'yearly'])
  ],
  validateRequest,
  tenantController.upgradeSubscription
);

/**
 * @swagger
 * /api/tenant/activity:
 *   get:
 *     summary: Get tenant activity log
 *     tags: [Tenant]
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
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Activity log retrieved successfully
 */
router.get('/activity',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('action').optional().isString(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601()
  ],
  validateRequest,
  enforceTenantIsolation,
  requireTenantFeature(tenantFeatures.AUDIT_TRAILS),
  tenantController.getActivityLog
);

export default router;
