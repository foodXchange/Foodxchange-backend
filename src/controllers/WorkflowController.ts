import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { WorkflowDefinition, WorkflowInstance, WorkflowTemplate } from '../models/Workflow';
import { approvalService } from '../services/workflow/ApprovalService';
import { workflowEngine } from '../services/workflow/WorkflowEngine';

interface WorkflowRequest extends Request {
  user?: {
    id: string;
    role: string;
    companyId: string;
  };
}

export class WorkflowController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('WorkflowController');
  }

  /**
   * Create workflow definition
   */
  async createWorkflowDefinition(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const definitionData = {
        ...req.body,
        createdBy: userId,
        company: req.user?.companyId
      };

      const definition = new WorkflowDefinition(definitionData);
      await definition.save();

      // Register with workflow engine
      await workflowEngine.registerWorkflow({
        ...definition.toObject(),
        id: definition._id.toString(),
        createdBy: userId,
        createdAt: definition.createdAt,
        updatedAt: definition.updatedAt
      });

      res.status(201).json({
        success: true,
        data: definition
      });
    } catch (error) {
      this.logger.error('Failed to create workflow definition:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_WORKFLOW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create workflow definition'
        }
      });
    }
  }

  /**
   * Get workflow definitions
   */
  async getWorkflowDefinitions(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { category, isActive, tags, limit = 50, offset = 0 } = req.query;

      const query: any = {};
      if (req.user?.companyId) {
        query.$or = [
          { company: req.user.companyId },
          { company: { $exists: false } } // Global workflows
        ];
      }

      if (category) query.category = category;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };

      const [definitions, total] = await Promise.all([
        WorkflowDefinition.find(query)
          .populate('createdBy', 'firstName lastName')
          .sort({ createdAt: -1 })
          .limit(Number(limit))
          .skip(Number(offset)),
        WorkflowDefinition.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          definitions,
          total,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error) {
      this.logger.error('Failed to get workflow definitions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_WORKFLOWS_FAILED',
          message: 'Failed to retrieve workflow definitions'
        }
      });
    }
  }

  /**
   * Get single workflow definition
   */
  async getWorkflowDefinition(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const definition = await WorkflowDefinition.findById(id)
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName');

      if (!definition) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow definition not found'
          }
        });
        return;
      }

      // Check access
      if (definition.company && definition.company.toString() !== req.user?.companyId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access to this workflow is denied'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: definition
      });
    } catch (error) {
      this.logger.error('Failed to get workflow definition:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_WORKFLOW_FAILED',
          message: 'Failed to retrieve workflow definition'
        }
      });
    }
  }

  /**
   * Update workflow definition
   */
  async updateWorkflowDefinition(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const definition = await WorkflowDefinition.findById(id);
      if (!definition) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow definition not found'
          }
        });
        return;
      }

      // Check permissions
      if (definition.company && definition.company.toString() !== req.user?.companyId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'UPDATE_DENIED',
            message: 'You do not have permission to update this workflow'
          }
        });
        return;
      }

      // Update fields
      Object.assign(definition, updates, {
        updatedBy: req.user?.id,
        version: this.incrementVersion(definition.version)
      });

      await definition.save();

      // Re-register with workflow engine
      await workflowEngine.registerWorkflow({
        ...definition.toObject(),
        id: definition._id.toString(),
        createdBy: definition.createdBy.toString(),
        updatedBy: req.user?.id,
        createdAt: definition.createdAt,
        updatedAt: definition.updatedAt
      });

      res.json({
        success: true,
        data: definition
      });
    } catch (error) {
      this.logger.error('Failed to update workflow definition:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_WORKFLOW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update workflow definition'
        }
      });
    }
  }

  /**
   * Start workflow instance
   */
  async startWorkflow(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { definitionId } = req.params;
      const { input, metadata } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      // Check definition exists and user has permission
      const definition = await WorkflowDefinition.findById(definitionId);
      if (!definition) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: 'Workflow definition not found'
          }
        });
        return;
      }

      if (!definition.isActive) {
        res.status(400).json({
          success: false,
          error: {
            code: 'WORKFLOW_INACTIVE',
            message: 'Workflow is not active'
          }
        });
        return;
      }

      // Start workflow
      const engineInstance = await workflowEngine.startWorkflow(
        definitionId,
        input || {},
        userId,
        metadata
      );

      // Save to database
      const dbInstance = new WorkflowInstance({
        definitionId: definition._id,
        definitionVersion: definition.version,
        status: engineInstance.status,
        currentStep: engineInstance.currentStep,
        context: engineInstance.context,
        history: engineInstance.history,
        startedBy: userId,
        startedAt: engineInstance.startedAt,
        metadata: engineInstance.metadata,
        company: req.user?.companyId
      });

      await dbInstance.save();

      res.status(201).json({
        success: true,
        data: {
          instanceId: engineInstance.id,
          ...dbInstance.toObject()
        }
      });
    } catch (error) {
      this.logger.error('Failed to start workflow:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'START_WORKFLOW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to start workflow'
        }
      });
    }
  }

  /**
   * Get workflow instances
   */
  async getWorkflowInstances(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const {
        definitionId,
        status,
        startedBy,
        entityType,
        entityId,
        limit = 50,
        offset = 0
      } = req.query;

      const query: any = {};
      if (req.user?.companyId) {
        query.company = req.user.companyId;
      }

      if (definitionId) query.definitionId = definitionId;
      if (status) query.status = status;
      if (startedBy) query.startedBy = startedBy;
      if (entityType) query['context.entity.type'] = entityType;
      if (entityId) query['context.entity.id'] = entityId;

      const [instances, total] = await Promise.all([
        WorkflowInstance.find(query)
          .populate('definitionId', 'name category')
          .populate('startedBy', 'firstName lastName')
          .sort({ startedAt: -1 })
          .limit(Number(limit))
          .skip(Number(offset)),
        WorkflowInstance.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          instances,
          total,
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error) {
      this.logger.error('Failed to get workflow instances:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_INSTANCES_FAILED',
          message: 'Failed to retrieve workflow instances'
        }
      });
    }
  }

  /**
   * Get single workflow instance
   */
  async getWorkflowInstance(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { instanceId } = req.params;

      // Try engine first for real-time data
      let instance = await workflowEngine.getWorkflowInstance(instanceId);

      if (!instance) {
        // Fallback to database
        const dbInstance = await WorkflowInstance.findOne({
          _id: instanceId
        })
          .populate('definitionId', 'name category steps')
          .populate('startedBy', 'firstName lastName');

        if (!dbInstance) {
          res.status(404).json({
            success: false,
            error: {
              code: 'INSTANCE_NOT_FOUND',
              message: 'Workflow instance not found'
            }
          });
          return;
        }

        instance = {
          id: dbInstance._id.toString(),
          definitionId: dbInstance.definitionId._id.toString(),
          definitionVersion: dbInstance.definitionVersion,
          status: dbInstance.status,
          currentStep: dbInstance.currentStep,
          context: dbInstance.context,
          history: dbInstance.history,
          startedAt: dbInstance.startedAt,
          completedAt: dbInstance.completedAt,
          startedBy: dbInstance.startedBy.toString(),
          error: dbInstance.error,
          metadata: dbInstance.metadata
        };
      }

      res.json({
        success: true,
        data: instance
      });
    } catch (error) {
      this.logger.error('Failed to get workflow instance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_INSTANCE_FAILED',
          message: 'Failed to retrieve workflow instance'
        }
      });
    }
  }

  /**
   * Submit approval decision
   */
  async submitApproval(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { instanceId, stepId } = req.params;
      const { action, comment, attachments, delegatedTo } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!['approved', 'rejected', 'delegated'].includes(action)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: 'Action must be approved, rejected, or delegated'
          }
        });
        return;
      }

      const decision = {
        approverId: userId,
        action,
        comment,
        attachments,
        delegatedTo,
        timestamp: new Date()
      };

      await workflowEngine.submitApproval(instanceId, stepId, decision);

      // Update database instance
      await WorkflowInstance.findByIdAndUpdate(instanceId, {
        $set: {
          [`context.approvals.${stepId}`]: decision
        },
        $push: {
          history: {
            timestamp: new Date(),
            stepId,
            action: 'completed',
            actor: userId,
            decision: action,
            comment
          }
        }
      });

      res.json({
        success: true,
        data: {
          message: 'Approval decision submitted successfully',
          decision
        }
      });
    } catch (error) {
      this.logger.error('Failed to submit approval:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'SUBMIT_APPROVAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to submit approval'
        }
      });
    }
  }

  /**
   * Cancel workflow instance
   */
  async cancelWorkflow(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { instanceId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!reason || reason.trim() === '') {
        res.status(400).json({
          success: false,
          error: {
            code: 'REASON_REQUIRED',
            message: 'Cancellation reason is required'
          }
        });
        return;
      }

      await workflowEngine.cancelWorkflow(instanceId, reason, userId);

      // Update database instance
      await WorkflowInstance.findByIdAndUpdate(instanceId, {
        status: 'cancelled',
        completedAt: new Date(),
        $push: {
          history: {
            timestamp: new Date(),
            stepId: '',
            action: 'cancelled',
            actor: userId,
            data: { reason }
          }
        }
      });

      res.json({
        success: true,
        data: {
          message: 'Workflow cancelled successfully'
        }
      });
    } catch (error) {
      this.logger.error('Failed to cancel workflow:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CANCEL_WORKFLOW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel workflow'
        }
      });
    }
  }

  /**
   * Get workflow templates
   */
  async getWorkflowTemplates(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { category, tags, isPublic = true } = req.query;

      const query: any = { isPublic: isPublic === 'true' };
      if (category) query.category = category;
      if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };

      const templates = await WorkflowTemplate.find(query)
        .sort({ popularity: -1 })
        .limit(50);

      res.json({
        success: true,
        data: templates
      });
    } catch (error) {
      this.logger.error('Failed to get workflow templates:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_TEMPLATES_FAILED',
          message: 'Failed to retrieve workflow templates'
        }
      });
    }
  }

  /**
   * Create workflow from template
   */
  async createFromTemplate(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { templateId } = req.params;
      const overrides = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const template = await WorkflowTemplate.findById(templateId);
      if (!template) {
        res.status(404).json({
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Workflow template not found'
          }
        });
        return;
      }

      const definition = new WorkflowDefinition({
        ...template.definition,
        ...overrides,
        createdBy: userId,
        company: req.user?.companyId,
        isActive: true
      });

      await definition.save();

      // Increment template popularity
      await WorkflowTemplate.findByIdAndUpdate(templateId, {
        $inc: { popularity: 1 }
      });

      res.status(201).json({
        success: true,
        data: definition
      });
    } catch (error) {
      this.logger.error('Failed to create from template:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_FROM_TEMPLATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create workflow from template'
        }
      });
    }
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const { definitionId, dateRange } = req.query;

      let startDate, endDate;
      if (dateRange) {
        const [start, end] = (dateRange as string).split(',');
        startDate = new Date(start);
        endDate = new Date(end);
      }

      const stats = await workflowEngine.getWorkflowStats(
        definitionId as string,
        startDate && endDate ? { start: startDate, end: endDate } : undefined
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.logger.error('Failed to get workflow stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATS_FAILED',
          message: 'Failed to retrieve workflow statistics'
        }
      });
    }
  }

  /**
   * Get user's approval requests
   */
  async getApprovalRequests(req: WorkflowRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const { status, priority, workflowType } = req.query;

      const approvals = await approvalService.getApprovalRequests(userId, {
        status: status as any,
        priority: priority as string,
        workflowType: workflowType as string
      });

      res.json({
        success: true,
        data: approvals
      });
    } catch (error) {
      this.logger.error('Failed to get approval requests:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_APPROVALS_FAILED',
          message: 'Failed to retrieve approval requests'
        }
      });
    }
  }

  /**
   * Private helper methods
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
}

export const workflowController = new WorkflowController();
