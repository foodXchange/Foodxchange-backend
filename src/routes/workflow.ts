import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { workflowController } from '../controllers/WorkflowController';
import { authenticateToken } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation rules
const createWorkflowValidation = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),

  body('category')
    .isIn(['procurement', 'sales', 'finance', 'hr', 'compliance', 'vendor-management', 'quality', 'custom'])
    .withMessage('Invalid category'),

  body('steps')
    .isArray({ min: 1 })
    .withMessage('At least one step is required'),

  body('steps.*.id')
    .isString()
    .withMessage('Step ID is required'),

  body('steps.*.name')
    .isString()
    .withMessage('Step name is required'),

  body('steps.*.type')
    .isIn(['approval', 'action', 'condition', 'notification', 'parallel', 'wait'])
    .withMessage('Invalid step type'),

  body('trigger.type')
    .isIn(['manual', 'event', 'schedule', 'webhook'])
    .withMessage('Invalid trigger type')
];

const startWorkflowValidation = [
  param('definitionId')
    .isMongoId()
    .withMessage('Invalid workflow definition ID'),

  body('input')
    .optional()
    .isObject()
    .withMessage('Input must be an object'),

  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

const submitApprovalValidation = [
  param('instanceId')
    .isString()
    .withMessage('Instance ID is required'),

  param('stepId')
    .isString()
    .withMessage('Step ID is required'),

  body('action')
    .isIn(['approved', 'rejected', 'delegated'])
    .withMessage('Action must be approved, rejected, or delegated'),

  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Comment cannot exceed 1000 characters'),

  body('delegatedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid user ID for delegation')
];

const cancelWorkflowValidation = [
  param('instanceId')
    .isString()
    .withMessage('Instance ID is required'),

  body('reason')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters')
];

// Workflow definition routes
router.post('/definitions',
  authorize('admin', 'seller'),
  validateRequest(createWorkflowValidation),
  workflowController.createWorkflowDefinition
);

router.get('/definitions',
  workflowController.getWorkflowDefinitions
);

router.get('/definitions/:id',
  param('id').isMongoId(),
  workflowController.getWorkflowDefinition
);

router.put('/definitions/:id',
  authorize('admin', 'seller'),
  param('id').isMongoId(),
  workflowController.updateWorkflowDefinition
);

// Workflow instance routes
router.post('/definitions/:definitionId/start',
  validateRequest(startWorkflowValidation),
  workflowController.startWorkflow
);

router.get('/instances',
  workflowController.getWorkflowInstances
);

router.get('/instances/:instanceId',
  param('instanceId').isString(),
  workflowController.getWorkflowInstance
);

router.post('/instances/:instanceId/cancel',
  validateRequest(cancelWorkflowValidation),
  workflowController.cancelWorkflow
);

// Approval routes
router.post('/instances/:instanceId/steps/:stepId/approve',
  validateRequest(submitApprovalValidation),
  workflowController.submitApproval
);

router.get('/approvals',
  workflowController.getApprovalRequests
);

// Template routes
router.get('/templates',
  workflowController.getWorkflowTemplates
);

router.post('/templates/:templateId/create',
  param('templateId').isMongoId(),
  workflowController.createFromTemplate
);

// Statistics routes
router.get('/stats',
  workflowController.getWorkflowStats
);

// Export/Import routes
router.get('/definitions/:id/export',
  authorize('admin', 'seller'),
  param('id').isMongoId(),
  async (req, res) => {
    try {
      const json = await workflowEngine.exportWorkflow(req.params.id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="workflow-${req.params.id}.json"`);
      res.send(json);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: 'Failed to export workflow'
        }
      });
    }
  }
);

router.post('/import',
  authorize('admin', 'seller'),
  body('definition').isString(),
  async (req, res) => {
    try {
      const definition = await workflowEngine.importWorkflow(
        req.body.definition,
        {
          createdBy: req.user?.id,
          company: req.user?.companyId
        }
      );

      res.status(201).json({
        success: true,
        data: definition
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: {
          code: 'IMPORT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to import workflow'
        }
      });
    }
  }
);

export default router;
