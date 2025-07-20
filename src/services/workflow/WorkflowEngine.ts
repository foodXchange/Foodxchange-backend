import { EventEmitter } from 'events';

import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'action' | 'condition' | 'notification' | 'parallel' | 'wait';
  description?: string;
  assignee?: {
    type: 'user' | 'role' | 'group' | 'dynamic';
    value: string | string[] | ((context: WorkflowContext) => string | string[]);
  };
  approvers?: Array<{
    id: string;
    type: 'user' | 'role' | 'group';
    required?: boolean;
    order?: number;
  }>;
  conditions?: {
    type: 'all' | 'any' | 'custom';
    rules: Array<{
      field: string;
      operator: 'equals' | 'notEquals' | 'greater' | 'less' | 'contains' | 'in' | 'notIn';
      value: any;
    }>;
    customFunction?: (context: WorkflowContext) => boolean;
  };
  actions?: Array<{
    type: 'webhook' | 'email' | 'function' | 'update' | 'create';
    config: Record<string, any>;
  }>;
  timeout?: {
    duration: number; // in milliseconds
    action: 'escalate' | 'auto-approve' | 'auto-reject' | 'notify';
    target?: string;
  };
  nextSteps?: {
    approved?: string;
    rejected?: string;
    default?: string;
    conditional?: Array<{
      condition: (context: WorkflowContext) => boolean;
      stepId: string;
    }>;
  };
  metadata?: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  category: string;
  trigger: {
    type: 'manual' | 'event' | 'schedule' | 'webhook';
    config: Record<string, any>;
  };
  steps: WorkflowStep[];
  variables?: Record<string, any>;
  permissions?: {
    view: string[];
    edit: string[];
    execute: string[];
  };
  settings?: {
    allowParallelExecution?: boolean;
    maxExecutionTime?: number;
    retryPolicy?: {
      maxRetries: number;
      retryDelay: number;
      retryOn: string[];
    };
    notifications?: {
      onStart?: boolean;
      onComplete?: boolean;
      onError?: boolean;
      channels: string[];
    };
  };
  createdBy: string;
  updatedBy?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  definitionVersion: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'suspended';
  currentStep?: string;
  context: WorkflowContext;
  history: WorkflowHistory[];
  startedAt: Date;
  completedAt?: Date;
  startedBy: string;
  error?: {
    message: string;
    stack?: string;
    stepId?: string;
    timestamp: Date;
  };
  metadata?: Record<string, any>;
}

export interface WorkflowContext {
  instanceId: string;
  definitionId: string;
  variables: Record<string, any>;
  input: Record<string, any>;
  output: Record<string, any>;
  currentUser: {
    id: string;
    role: string;
    permissions: string[];
  };
  entity: {
    type: string;
    id: string;
    data: Record<string, any>;
  };
  approvals: Record<string, ApprovalDecision>;
  metadata?: Record<string, any>;
}

export interface WorkflowHistory {
  timestamp: Date;
  stepId: string;
  action: 'started' | 'completed' | 'failed' | 'skipped' | 'timeout';
  actor?: string;
  decision?: 'approved' | 'rejected' | 'escalated';
  comment?: string;
  data?: Record<string, any>;
  duration?: number;
}

export interface ApprovalDecision {
  stepId: string;
  approverId: string;
  decision: 'approved' | 'rejected' | 'escalated';
  comment?: string;
  timestamp: Date;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  definition: Partial<WorkflowDefinition>;
  tags: string[];
  industry?: string;
  previewImage?: string;
  popularity: number;
  isPublic: boolean;
}

export class WorkflowEngine extends EventEmitter {
  private readonly logger: Logger;
  private readonly definitions: Map<string, WorkflowDefinition> = new Map();
  private readonly instances: Map<string, WorkflowInstance> = new Map();
  private readonly executors: Map<string, WorkflowExecutor> = new Map();
  private readonly actionHandlers: Map<string, ActionHandler> = new Map();
  private readonly conditionEvaluators: Map<string, ConditionEvaluator> = new Map();

  constructor() {
    super();
    this.logger = new Logger('WorkflowEngine');
    this.registerDefaultHandlers();
  }

  /**
   * Register a workflow definition
   */
  async registerWorkflow(definition: WorkflowDefinition): Promise<void> {
    try {
      // Validate workflow definition
      this.validateWorkflowDefinition(definition);

      // Store definition
      this.definitions.set(definition.id, definition);

      this.logger.info(`Workflow registered: ${definition.name} (v${definition.version})`);
      this.emit('workflow:registered', definition);
    } catch (error) {
      this.logger.error('Failed to register workflow:', error);
      throw error;
    }
  }

  /**
   * Start a new workflow instance
   */
  async startWorkflow(
    definitionId: string,
    input: Record<string, any>,
    startedBy: string,
    metadata?: Record<string, any>
  ): Promise<WorkflowInstance> {
    try {
      const definition = this.definitions.get(definitionId);
      if (!definition) {
        throw new Error(`Workflow definition not found: ${definitionId}`);
      }

      if (!definition.isActive) {
        throw new Error(`Workflow is not active: ${definition.name}`);
      }

      // Create workflow instance
      const instance: WorkflowInstance = {
        id: this.generateInstanceId(),
        definitionId: definition.id,
        definitionVersion: definition.version,
        status: 'pending',
        context: {
          instanceId: '',
          definitionId: definition.id,
          variables: { ...definition.variables },
          input,
          output: {},
          currentUser: {
            id: startedBy,
            role: '', // Will be populated from user service
            permissions: []
          },
          entity: {
            type: '',
            id: '',
            data: {}
          },
          approvals: {}
        },
        history: [],
        startedAt: new Date(),
        startedBy,
        metadata
      };

      instance.context.instanceId = instance.id;

      // Store instance
      this.instances.set(instance.id, instance);

      // Create executor
      const executor = new WorkflowExecutor(this, instance, definition);
      this.executors.set(instance.id, executor);

      // Start execution
      instance.status = 'running';
      this.emit('workflow:started', instance);

      // Execute first step
      await executor.start();

      return instance;
    } catch (error) {
      this.logger.error('Failed to start workflow:', error);
      throw error;
    }
  }

  /**
   * Submit approval decision
   */
  async submitApproval(
    instanceId: string,
    stepId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Workflow instance not found: ${instanceId}`);
      }

      const executor = this.executors.get(instanceId);
      if (!executor) {
        throw new Error(`Workflow executor not found: ${instanceId}`);
      }

      // Record approval
      instance.context.approvals[stepId] = decision;

      // Add to history
      instance.history.push({
        timestamp: new Date(),
        stepId,
        action: 'completed',
        actor: decision.approverId,
        decision: decision.decision,
        comment: decision.comment
      });

      this.emit('workflow:approval', { instance, decision });

      // Continue execution
      await executor.handleApproval(stepId, decision);
    } catch (error) {
      this.logger.error('Failed to submit approval:', error);
      throw error;
    }
  }

  /**
   * Cancel workflow instance
   */
  async cancelWorkflow(
    instanceId: string,
    reason: string,
    cancelledBy: string
  ): Promise<void> {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw new Error(`Workflow instance not found: ${instanceId}`);
      }

      const executor = this.executors.get(instanceId);
      if (executor) {
        await executor.cancel(reason);
      }

      instance.status = 'cancelled';
      instance.completedAt = new Date();

      instance.history.push({
        timestamp: new Date(),
        stepId: instance.currentStep || '',
        action: 'completed',
        actor: cancelledBy,
        data: { reason }
      });

      this.emit('workflow:cancelled', instance);
    } catch (error) {
      this.logger.error('Failed to cancel workflow:', error);
      throw error;
    }
  }

  /**
   * Get workflow instance
   */
  async getWorkflowInstance(instanceId: string): Promise<WorkflowInstance | null> {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get workflow instances by criteria
   */
  async getWorkflowInstances(criteria: {
    definitionId?: string;
    status?: string;
    startedBy?: string;
    dateRange?: { start: Date; end: Date };
    limit?: number;
    offset?: number;
  }): Promise<{ instances: WorkflowInstance[]; total: number }> {
    let instances = Array.from(this.instances.values());

    // Apply filters
    if (criteria.definitionId) {
      instances = instances.filter(i => i.definitionId === criteria.definitionId);
    }
    if (criteria.status) {
      instances = instances.filter(i => i.status === criteria.status);
    }
    if (criteria.startedBy) {
      instances = instances.filter(i => i.startedBy === criteria.startedBy);
    }
    if (criteria.dateRange) {
      instances = instances.filter(i =>
        i.startedAt >= criteria.dateRange.start &&
        i.startedAt <= criteria.dateRange.end
      );
    }

    // Sort by start date (newest first)
    instances.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply pagination
    const total = instances.length;
    const offset = criteria.offset || 0;
    const limit = criteria.limit || 50;
    instances = instances.slice(offset, offset + limit);

    return { instances, total };
  }

  /**
   * Register action handler
   */
  registerActionHandler(type: string, handler: ActionHandler): void {
    this.actionHandlers.set(type, handler);
    this.logger.info(`Action handler registered: ${type}`);
  }

  /**
   * Register condition evaluator
   */
  registerConditionEvaluator(type: string, evaluator: ConditionEvaluator): void {
    this.conditionEvaluators.set(type, evaluator);
    this.logger.info(`Condition evaluator registered: ${type}`);
  }

  /**
   * Get workflow templates
   */
  async getWorkflowTemplates(
    category?: string,
    tags?: string[]
  ): Promise<WorkflowTemplate[]> {
    // This would typically fetch from a database
    // For now, return sample templates
    const templates: WorkflowTemplate[] = [
      {
        id: 'purchase-approval',
        name: 'Purchase Order Approval',
        description: 'Standard purchase order approval workflow',
        category: 'procurement',
        definition: {
          name: 'Purchase Order Approval',
          category: 'procurement',
          steps: [
            {
              id: 'manager-approval',
              name: 'Manager Approval',
              type: 'approval',
              assignee: { type: 'role', value: 'manager' },
              timeout: {
                duration: 48 * 60 * 60 * 1000, // 48 hours
                action: 'escalate',
                target: 'director'
              }
            }
          ]
        },
        tags: ['purchase', 'approval', 'finance'],
        popularity: 95,
        isPublic: true
      },
      {
        id: 'vendor-onboarding',
        name: 'Vendor Onboarding',
        description: 'Complete vendor onboarding workflow',
        category: 'vendor-management',
        definition: {
          name: 'Vendor Onboarding',
          category: 'vendor-management',
          steps: [
            {
              id: 'document-collection',
              name: 'Document Collection',
              type: 'action',
              actions: [{
                type: 'function',
                config: { function: 'collectVendorDocuments' }
              }]
            },
            {
              id: 'compliance-review',
              name: 'Compliance Review',
              type: 'approval',
              assignee: { type: 'role', value: 'compliance-officer' }
            }
          ]
        },
        tags: ['vendor', 'onboarding', 'compliance'],
        popularity: 87,
        isPublic: true
      }
    ];

    // Filter by category
    let filtered = templates;
    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      filtered = filtered.filter(t =>
        tags.some(tag => t.tags.includes(tag))
      );
    }

    // Sort by popularity
    filtered.sort((a, b) => b.popularity - a.popularity);

    return filtered;
  }

  /**
   * Clone workflow from template
   */
  async cloneFromTemplate(
    templateId: string,
    overrides: Partial<WorkflowDefinition>
  ): Promise<WorkflowDefinition> {
    const templates = await this.getWorkflowTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const definition: WorkflowDefinition = {
      id: this.generateDefinitionId(),
      name: overrides.name || `${template.name} (Copy)`,
      description: overrides.description || template.definition.description,
      version: '1.0.0',
      category: overrides.category || template.definition.category || 'custom',
      trigger: overrides.trigger || template.definition.trigger || {
        type: 'manual',
        config: {}
      },
      steps: overrides.steps || template.definition.steps || [],
      variables: overrides.variables || template.definition.variables,
      permissions: overrides.permissions,
      settings: overrides.settings || template.definition.settings,
      createdBy: overrides.createdBy || 'system',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.registerWorkflow(definition);
    return definition;
  }

  /**
   * Export workflow definition
   */
  async exportWorkflow(definitionId: string): Promise<string> {
    const definition = this.definitions.get(definitionId);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${definitionId}`);
    }

    return JSON.stringify(definition, null, 2);
  }

  /**
   * Import workflow definition
   */
  async importWorkflow(
    jsonData: string,
    overrides?: Partial<WorkflowDefinition>
  ): Promise<WorkflowDefinition> {
    try {
      const parsed = JSON.parse(jsonData);
      const definition: WorkflowDefinition = {
        ...parsed,
        ...overrides,
        id: overrides?.id || this.generateDefinitionId(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.registerWorkflow(definition);
      return definition;
    } catch (error) {
      this.logger.error('Failed to import workflow:', error);
      throw new Error('Invalid workflow definition format');
    }
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(definitionId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    avgDuration: number;
    successRate: number;
    topApprovers: Array<{ userId: string; count: number }>;
  }> {
    let instances = Array.from(this.instances.values());

    if (definitionId) {
      instances = instances.filter(i => i.definitionId === definitionId);
    }

    const stats = {
      total: instances.length,
      byStatus: {} as Record<string, number>,
      avgDuration: 0,
      successRate: 0,
      topApprovers: [] as Array<{ userId: string; count: number }>
    };

    // Count by status
    instances.forEach(instance => {
      stats.byStatus[instance.status] = (stats.byStatus[instance.status] || 0) + 1;
    });

    // Calculate average duration (completed workflows only)
    const completed = instances.filter(i => i.status === 'completed' && i.completedAt);
    if (completed.length > 0) {
      const totalDuration = completed.reduce((sum, i) =>
        sum + (i.completedAt.getTime() - i.startedAt.getTime()), 0
      );
      stats.avgDuration = totalDuration / completed.length;
    }

    // Calculate success rate
    const finished = instances.filter(i => ['completed', 'failed'].includes(i.status));
    if (finished.length > 0) {
      stats.successRate = (completed.length / finished.length) * 100;
    }

    // Get top approvers
    const approverCounts = new Map<string, number>();
    instances.forEach(instance => {
      instance.history
        .filter(h => h.actor && h.decision)
        .forEach(h => {
          const count = approverCounts.get(h.actor) || 0;
          approverCounts.set(h.actor, count + 1);
        });
    });

    stats.topApprovers = Array.from(approverCounts.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Private helper methods
   */
  private validateWorkflowDefinition(definition: WorkflowDefinition): void {
    if (!definition.id || !definition.name || !definition.version) {
      throw new Error('Workflow definition must have id, name, and version');
    }

    if (!definition.steps || definition.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }

    // Validate step references
    const stepIds = new Set(definition.steps.map(s => s.id));
    definition.steps.forEach(step => {
      if (step.nextSteps) {
        const nextStepIds = [
          step.nextSteps.approved,
          step.nextSteps.rejected,
          step.nextSteps.default,
          ...(step.nextSteps.conditional?.map(c => c.stepId) || [])
        ].filter(Boolean);

        nextStepIds.forEach(nextId => {
          if (nextId && !stepIds.has(nextId)) {
            throw new Error(`Invalid next step reference: ${nextId}`);
          }
        });
      }
    });
  }

  private generateInstanceId(): string {
    return `wfi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateDefinitionId(): string {
    return `wfd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private registerDefaultHandlers(): void {
    // Register default action handlers
    this.registerActionHandler('webhook', new WebhookActionHandler());
    this.registerActionHandler('email', new EmailActionHandler());
    this.registerActionHandler('update', new UpdateActionHandler());

    // Register default condition evaluators
    this.registerConditionEvaluator('standard', new StandardConditionEvaluator());
  }
}

// Helper classes
class WorkflowExecutor {
  constructor(
    private readonly engine: WorkflowEngine,
    private readonly instance: WorkflowInstance,
    private readonly definition: WorkflowDefinition
  ) {}

  async start(): Promise<void> {
    const firstStep = this.definition.steps[0];
    await this.executeStep(firstStep);
  }

  async executeStep(step: WorkflowStep): Promise<void> {
    this.instance.currentStep = step.id;
    this.instance.history.push({
      timestamp: new Date(),
      stepId: step.id,
      action: 'started'
    });

    try {
      switch (step.type) {
        case 'approval':
          await this.handleApprovalStep(step);
          break;
        case 'action':
          await this.handleActionStep(step);
          break;
        case 'condition':
          await this.handleConditionStep(step);
          break;
        case 'notification':
          await this.handleNotificationStep(step);
          break;
        case 'parallel':
          await this.handleParallelStep(step);
          break;
        case 'wait':
          await this.handleWaitStep(step);
          break;
      }
    } catch (error) {
      await this.handleStepError(step, error);
    }
  }

  async handleApproval(stepId: string, decision: ApprovalDecision): Promise<void> {
    const step = this.definition.steps.find(s => s.id === stepId);
    if (!step) return;

    const nextStepId = decision.decision === 'approved'
      ? step.nextSteps?.approved
      : step.nextSteps?.rejected;

    if (nextStepId) {
      const nextStep = this.definition.steps.find(s => s.id === nextStepId);
      if (nextStep) {
        await this.executeStep(nextStep);
      }
    } else {
      await this.completeWorkflow();
    }
  }

  async cancel(reason: string): Promise<void> {
    // Cleanup resources
  }

  private async handleApprovalStep(step: WorkflowStep): Promise<void> {
    // Implementation for approval steps
    this.engine.emit('workflow:awaiting-approval', {
      instance: this.instance,
      step
    });
  }

  private async handleActionStep(step: WorkflowStep): Promise<void> {
    // Implementation for action steps
    if (step.actions) {
      for (const action of step.actions) {
        const handler = (this.engine as any).actionHandlers.get(action.type);
        if (handler) {
          await handler.execute(action.config, this.instance.context);
        }
      }
    }

    // Move to next step
    const nextStepId = step.nextSteps?.default;
    if (nextStepId) {
      const nextStep = this.definition.steps.find(s => s.id === nextStepId);
      if (nextStep) {
        await this.executeStep(nextStep);
      }
    } else {
      await this.completeWorkflow();
    }
  }

  private async handleConditionStep(step: WorkflowStep): Promise<void> {
    // Evaluate conditions and determine next step
    let nextStepId: string | undefined;

    if (step.conditions) {
      const evaluator = (this.engine as any).conditionEvaluators.get('standard');
      if (evaluator) {
        const result = await evaluator.evaluate(step.conditions, this.instance.context);
        nextStepId = result ? step.nextSteps?.approved : step.nextSteps?.rejected;
      }
    }

    if (!nextStepId && step.nextSteps?.default) {
      nextStepId = step.nextSteps.default;
    }

    if (nextStepId) {
      const nextStep = this.definition.steps.find(s => s.id === nextStepId);
      if (nextStep) {
        await this.executeStep(nextStep);
      }
    } else {
      await this.completeWorkflow();
    }
  }

  private async handleNotificationStep(step: WorkflowStep): Promise<void> {
    // Send notifications
    this.engine.emit('workflow:notification', {
      instance: this.instance,
      step
    });

    // Move to next step
    const nextStepId = step.nextSteps?.default;
    if (nextStepId) {
      const nextStep = this.definition.steps.find(s => s.id === nextStepId);
      if (nextStep) {
        await this.executeStep(nextStep);
      }
    } else {
      await this.completeWorkflow();
    }
  }

  private async handleParallelStep(step: WorkflowStep): Promise<void> {
    // Execute parallel steps
    // Implementation would handle parallel execution
  }

  private async handleWaitStep(step: WorkflowStep): Promise<void> {
    // Wait for specified duration or condition
    if (step.timeout) {
      setTimeout(() => {
        // Continue to next step after timeout
        const nextStepId = step.nextSteps?.default;
        if (nextStepId) {
          const nextStep = this.definition.steps.find(s => s.id === nextStepId);
          if (nextStep) {
            this.executeStep(nextStep);
          }
        } else {
          this.completeWorkflow();
        }
      }, step.timeout.duration);
    }
  }

  private async handleStepError(step: WorkflowStep, error: any): Promise<void> {
    this.instance.status = 'failed';
    this.instance.error = {
      message: error.message,
      stack: error.stack,
      stepId: step.id,
      timestamp: new Date()
    };

    this.instance.history.push({
      timestamp: new Date(),
      stepId: step.id,
      action: 'failed',
      data: { error: error.message }
    });

    this.engine.emit('workflow:failed', this.instance);
  }

  private async completeWorkflow(): Promise<void> {
    this.instance.status = 'completed';
    this.instance.completedAt = new Date();

    this.instance.history.push({
      timestamp: new Date(),
      stepId: this.instance.currentStep || '',
      action: 'completed'
    });

    this.engine.emit('workflow:completed', this.instance);
  }
}

// Action handler interfaces
interface ActionHandler {
  execute(config: Record<string, any>, context: WorkflowContext): Promise<void>;
}

class WebhookActionHandler implements ActionHandler {
  async execute(config: Record<string, any>, context: WorkflowContext): Promise<void> {
    // Implement webhook execution
  }
}

class EmailActionHandler implements ActionHandler {
  async execute(config: Record<string, any>, context: WorkflowContext): Promise<void> {
    // Implement email sending
  }
}

class UpdateActionHandler implements ActionHandler {
  async execute(config: Record<string, any>, context: WorkflowContext): Promise<void> {
    // Implement data update
  }
}

// Condition evaluator interfaces
interface ConditionEvaluator {
  evaluate(conditions: any, context: WorkflowContext): Promise<boolean>;
}

class StandardConditionEvaluator implements ConditionEvaluator {
  async evaluate(conditions: any, context: WorkflowContext): Promise<boolean> {
    // Implement condition evaluation logic
    return true;
  }
}

export const workflowEngine = new WorkflowEngine();
