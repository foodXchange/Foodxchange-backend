import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { auditController } from '../controllers/AuditController';
import { authenticateToken, authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation rules
const createAuditLogValidation = [
  body('action')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Action must be between 1 and 200 characters'),

  body('category')
    .isIn(['auth', 'data', 'system', 'security', 'compliance', 'financial', 'api'])
    .withMessage('Invalid category'),

  body('severity')
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity level'),

  body('resource.type')
    .isString()
    .withMessage('Resource type is required'),

  body('resource.id')
    .optional()
    .isString()
    .withMessage('Resource ID must be a string'),

  body('result')
    .isIn(['success', 'failure', 'partial'])
    .withMessage('Invalid result'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

const getAuditLogsValidation = [
  query('action')
    .optional()
    .isString()
    .withMessage('Action must be a string'),

  query('category')
    .optional()
    .isIn(['auth', 'data', 'system', 'security', 'compliance', 'financial', 'api'])
    .withMessage('Invalid category'),

  query('severity')
    .optional()
    .isIn(['info', 'warning', 'error', 'critical'])
    .withMessage('Invalid severity'),

  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const searchAuditLogsValidation = [
  query('q')
    .isString()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const resolveAlertValidation = [
  param('alertId')
    .isString()
    .withMessage('Alert ID is required'),

  body('resolution')
    .isString()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Resolution must be between 1 and 1000 characters')
];

// Audit log routes
router.get('/logs',
  validateRequest(getAuditLogsValidation),
  auditController.getAuditLogs
);

router.get('/logs/search',
  validateRequest(searchAuditLogsValidation),
  auditController.searchAuditLogs
);

router.get('/logs/export',
  authorize('admin'),
  auditController.exportAuditLogs
);

router.get('/logs/:id',
  param('id').isMongoId().withMessage('Invalid audit log ID'),
  auditController.getAuditLog
);

router.post('/logs',
  authorize('admin'),
  validateRequest(createAuditLogValidation),
  auditController.createAuditLog
);

// Statistics routes
router.get('/stats',
  auditController.getAuditStats
);

router.get('/metrics/trends',
  query('metric').isString().withMessage('Metric name is required'),
  query('hours').optional().isInt({ min: 1, max: 168 }).withMessage('Hours must be between 1 and 168'),
  auditController.getMetricTrends
);

// Compliance routes
router.get('/compliance/dashboard',
  authorize('admin'),
  auditController.getComplianceDashboard
);

router.get('/compliance/alerts',
  auditController.getComplianceAlerts
);

router.post('/compliance/alerts/:alertId/acknowledge',
  param('alertId').isString().withMessage('Alert ID is required'),
  auditController.acknowledgeAlert
);

router.post('/compliance/alerts/:alertId/resolve',
  validateRequest(resolveAlertValidation),
  auditController.resolveAlert
);

// Webhook for external audit events
router.post('/webhook',
  body('source').isString().withMessage('Source is required'),
  body('event').isObject().withMessage('Event data is required'),
  async (req, res) => {
    try {
      const { source, event } = req.body;

      // Create audit log from webhook
      const auditLog = new (await import('../models/AuditLog')).AuditLog({
        action: event.action || 'external_event',
        category: 'api',
        severity: event.severity || 'info',
        resource: {
          type: 'webhook',
          id: source,
          name: event.name
        },
        result: 'success',
        metadata: {
          source,
          event,
          webhookReceived: new Date()
        },
        timestamp: new Date()
      });

      await auditLog.save();

      res.status(201).json({
        success: true,
        data: {
          message: 'Webhook received and logged',
          auditLogId: auditLog._id
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'WEBHOOK_PROCESSING_FAILED',
          message: 'Failed to process webhook'
        }
      });
    }
  }
);

export default router;
