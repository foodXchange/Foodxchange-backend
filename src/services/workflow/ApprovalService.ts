import { EventEmitter } from 'events';

import { Logger } from '../../core/logging/logger';
import { User } from '../../models/User';
import { WorkflowInstance } from '../../models/Workflow';
import { sendEmail } from '../../utils/email';
import notificationService from '../notifications/NotificationService';

export interface ApprovalRequest {
  id: string;
  workflowInstanceId: string;
  stepId: string;
  title: string;
  description: string;
  requester: {
    id: string;
    name: string;
    email: string;
    department?: string;
  };
  approvers: Array<{
    id: string;
    type: 'user' | 'role' | 'group';
    name: string;
    email?: string;
    status: 'pending' | 'approved' | 'rejected' | 'delegated';
    decision?: {
      action: 'approved' | 'rejected' | 'delegated';
      comment?: string;
      timestamp: Date;
      delegatedTo?: string;
    };
    order?: number;
    required: boolean;
  }>;
  data: Record<string, any>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    size: number;
    mimeType: string;
  }>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  escalationPolicy?: {
    levels: Array<{
      duration: number; // in milliseconds
      action: 'notify' | 'escalate' | 'auto-approve' | 'auto-reject';
      target?: string; // user/role to escalate to
    }>;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalDecision {
  approverId: string;
  action: 'approved' | 'rejected' | 'delegated';
  comment?: string;
  attachments?: string[];
  delegatedTo?: string;
  metadata?: Record<string, any>;
}

export interface ApprovalDelegation {
  fromUserId: string;
  toUserId: string;
  reason?: string;
  startDate: Date;
  endDate?: Date;
  scope?: {
    types?: string[];
    workflows?: string[];
    maxAmount?: number;
  };
  isActive: boolean;
}

export interface ApprovalPolicy {
  id: string;
  name: string;
  description?: string;
  type: string; // e.g., 'purchase_order', 'expense_claim', 'vendor_approval'
  rules: Array<{
    condition: {
      field: string;
      operator: string;
      value: any;
    };
    approvers: Array<{
      type: 'user' | 'role' | 'group' | 'manager' | 'hierarchy';
      value: string;
      level?: number; // for hierarchy approvals
    }>;
    threshold?: {
      amount?: number;
      currency?: string;
    };
  }>;
  escalation?: {
    enabled: boolean;
    timeoutHours: number;
    escalateTo: string;
  };
  isActive: boolean;
}

export class ApprovalService extends EventEmitter {
  private readonly logger: Logger;
  private readonly approvalRequests: Map<string, ApprovalRequest> = new Map();
  private readonly delegations: Map<string, ApprovalDelegation[]> = new Map();
  private readonly policies: Map<string, ApprovalPolicy> = new Map();
  private readonly escalationTimers: Map<string, NodeJS.Timeout[]> = new Map();

  constructor() {
    super();
    this.logger = new Logger('ApprovalService');
    this.loadDefaultPolicies();
  }

  /**
   * Create approval request
   */
  async createApprovalRequest(
    workflowInstanceId: string,
    stepId: string,
    config: {
      title: string;
      description: string;
      approvers: Array<{ type: string; value: string; required?: boolean; order?: number }>;
      data: Record<string, any>;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      dueDate?: Date;
      attachments?: any[];
    }
  ): Promise<ApprovalRequest> {
    try {
      const approvalRequest: ApprovalRequest = {
        id: this.generateApprovalId(),
        workflowInstanceId,
        stepId,
        title: config.title,
        description: config.description,
        requester: await this.getRequesterInfo(workflowInstanceId),
        approvers: await this.resolveApprovers(config.approvers),
        data: config.data,
        attachments: config.attachments,
        priority: config.priority || 'medium',
        dueDate: config.dueDate,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Apply approval policies
      await this.applyApprovalPolicies(approvalRequest);

      // Store request
      this.approvalRequests.set(approvalRequest.id, approvalRequest);

      // Notify approvers
      await this.notifyApprovers(approvalRequest);

      // Set up escalation if needed
      if (approvalRequest.escalationPolicy) {
        this.setupEscalation(approvalRequest);
      }

      this.emit('approval:created', approvalRequest);

      return approvalRequest;
    } catch (error) {
      this.logger.error('Failed to create approval request:', error);
      throw error;
    }
  }

  /**
   * Submit approval decision
   */
  async submitDecision(
    approvalId: string,
    approverId: string,
    decision: ApprovalDecision
  ): Promise<ApprovalRequest> {
    try {
      const approvalRequest = this.approvalRequests.get(approvalId);
      if (!approvalRequest) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Check if approver is authorized
      const approver = approvalRequest.approvers.find(a => a.id === approverId);
      if (!approver) {
        // Check for delegation
        const delegatedApprover = await this.checkDelegation(approvalRequest, approverId);
        if (!delegatedApprover) {
          throw new Error('User is not authorized to approve this request');
        }
      }

      // Record decision
      if (approver) {
        approver.status = decision.action === 'delegated' ? 'delegated' : decision.action;
        approver.decision = {
          action: decision.action,
          comment: decision.comment,
          timestamp: new Date(),
          delegatedTo: decision.delegatedTo
        };
      }

      approvalRequest.updatedAt = new Date();

      // Handle delegation
      if (decision.action === 'delegated' && decision.delegatedTo) {
        await this.handleDelegation(approvalRequest, approverId, decision.delegatedTo);
      }

      // Check if approval is complete
      const isComplete = this.isApprovalComplete(approvalRequest);

      if (isComplete) {
        // Clear escalation timers
        this.clearEscalationTimers(approvalId);

        // Emit completion event
        const finalDecision = this.getFinalDecision(approvalRequest);
        this.emit('approval:completed', {
          approvalRequest,
          decision: finalDecision
        });
      }

      // Notify relevant parties
      await this.notifyDecisionMade(approvalRequest, approverId, decision);

      this.emit('approval:decision', {
        approvalRequest,
        approverId,
        decision
      });

      return approvalRequest;
    } catch (error) {
      this.logger.error('Failed to submit approval decision:', error);
      throw error;
    }
  }

  /**
   * Get approval requests for user
   */
  async getApprovalRequests(
    userId: string,
    filters?: {
      status?: 'pending' | 'completed';
      priority?: string;
      workflowType?: string;
      dateRange?: { start: Date; end: Date };
    }
  ): Promise<ApprovalRequest[]> {
    let requests = Array.from(this.approvalRequests.values());

    // Filter by user (direct or delegated)
    requests = requests.filter(req =>
      req.approvers.some(a => a.id === userId) ||
      this.hasDelegatedAccess(req, userId)
    );

    // Apply additional filters
    if (filters) {
      if (filters.status === 'pending') {
        requests = requests.filter(req =>
          req.approvers.some(a => a.id === userId && a.status === 'pending')
        );
      } else if (filters.status === 'completed') {
        requests = requests.filter(req =>
          req.approvers.some(a => a.id === userId && a.status !== 'pending')
        );
      }

      if (filters.priority) {
        requests = requests.filter(req => req.priority === filters.priority);
      }

      if (filters.dateRange) {
        requests = requests.filter(req =>
          req.createdAt >= filters.dateRange.start &&
          req.createdAt <= filters.dateRange.end
        );
      }
    }

    // Sort by priority and date
    requests.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return requests;
  }

  /**
   * Delegate approvals
   */
  async createDelegation(delegation: ApprovalDelegation): Promise<void> {
    try {
      // Validate delegation
      if (delegation.startDate > (delegation.endDate || new Date('2099-12-31'))) {
        throw new Error('Invalid delegation period');
      }

      // Store delegation
      const userDelegations = this.delegations.get(delegation.fromUserId) || [];
      userDelegations.push(delegation);
      this.delegations.set(delegation.fromUserId, userDelegations);

      // Reassign pending approvals if needed
      if (delegation.isActive) {
        await this.reassignPendingApprovals(delegation);
      }

      this.emit('delegation:created', delegation);
    } catch (error) {
      this.logger.error('Failed to create delegation:', error);
      throw error;
    }
  }

  /**
   * Get approval statistics
   */
  async getApprovalStats(
    userId?: string,
    dateRange?: { start: Date; end: Date }
  ): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    avgApprovalTime: number;
    byPriority: Record<string, number>;
    byWorkflowType: Record<string, number>;
    topApprovers: Array<{ userId: string; count: number; avgTime: number }>;
  }> {
    let requests = Array.from(this.approvalRequests.values());

    // Filter by user if specified
    if (userId) {
      requests = requests.filter(req =>
        req.approvers.some(a => a.id === userId)
      );
    }

    // Filter by date range
    if (dateRange) {
      requests = requests.filter(req =>
        req.createdAt >= dateRange.start &&
        req.createdAt <= dateRange.end
      );
    }

    const stats = {
      total: requests.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      avgApprovalTime: 0,
      byPriority: {} as Record<string, number>,
      byWorkflowType: {} as Record<string, number>,
      topApprovers: [] as Array<{ userId: string; count: number; avgTime: number }>
    };

    const approvalTimes: number[] = [];
    const approverStats = new Map<string, { count: number; totalTime: number }>();

    requests.forEach(req => {
      // Count by status
      const hasApproval = req.approvers.some(a => a.status === 'approved');
      const hasRejection = req.approvers.some(a => a.status === 'rejected');
      const hasPending = req.approvers.some(a => a.status === 'pending');

      if (hasPending) {
        stats.pending++;
      } else if (hasRejection) {
        stats.rejected++;
      } else if (hasApproval) {
        stats.approved++;
      }

      // Count by priority
      stats.byPriority[req.priority] = (stats.byPriority[req.priority] || 0) + 1;

      // Calculate approval times and approver stats
      req.approvers.forEach(approver => {
        if (approver.decision && approver.status !== 'pending') {
          const approvalTime = approver.decision.timestamp.getTime() - req.createdAt.getTime();
          approvalTimes.push(approvalTime);

          const approverStat = approverStats.get(approver.id) || { count: 0, totalTime: 0 };
          approverStat.count++;
          approverStat.totalTime += approvalTime;
          approverStats.set(approver.id, approverStat);
        }
      });
    });

    // Calculate average approval time
    if (approvalTimes.length > 0) {
      stats.avgApprovalTime = approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length;
    }

    // Get top approvers
    stats.topApprovers = Array.from(approverStats.entries())
      .map(([userId, stat]) => ({
        userId,
        count: stat.count,
        avgTime: stat.totalTime / stat.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return stats;
  }

  /**
   * Get approval history
   */
  async getApprovalHistory(
    entityType: string,
    entityId: string
  ): Promise<ApprovalRequest[]> {
    const requests = Array.from(this.approvalRequests.values())
      .filter(req =>
        req.data.entityType === entityType &&
        req.data.entityId === entityId
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return requests;
  }

  /**
   * Cancel approval request
   */
  async cancelApprovalRequest(
    approvalId: string,
    reason: string,
    cancelledBy: string
  ): Promise<void> {
    try {
      const approvalRequest = this.approvalRequests.get(approvalId);
      if (!approvalRequest) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      // Clear escalation timers
      this.clearEscalationTimers(approvalId);

      // Update status
      approvalRequest.metadata = {
        ...approvalRequest.metadata,
        cancelled: true,
        cancelledBy,
        cancelledAt: new Date(),
        reason
      };

      // Notify approvers
      await this.notifyCancellation(approvalRequest, reason, cancelledBy);

      this.emit('approval:cancelled', {
        approvalRequest,
        reason,
        cancelledBy
      });
    } catch (error) {
      this.logger.error('Failed to cancel approval request:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async getRequesterInfo(workflowInstanceId: string): Promise<any> {
    // In a real implementation, this would fetch from the workflow instance
    return {
      id: 'user123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      department: 'Procurement'
    };
  }

  private async resolveApprovers(
    approverConfigs: Array<{ type: string; value: string; required?: boolean; order?: number }>
  ): Promise<ApprovalRequest['approvers']> {
    const approvers: ApprovalRequest['approvers'] = [];

    for (const config of approverConfigs) {
      if (config.type === 'user') {
        // Fetch user details
        const user = await User.findById(config.value);
        if (user) {
          approvers.push({
            id: user._id.toString(),
            type: 'user',
            name: user.fullName,
            email: user.email,
            status: 'pending',
            required: config.required !== false,
            order: config.order
          });
        }
      } else if (config.type === 'role') {
        // Fetch users with role
        const users = await User.find({ role: config.value });
        users.forEach(user => {
          approvers.push({
            id: user._id.toString(),
            type: 'role',
            name: user.fullName,
            email: user.email,
            status: 'pending',
            required: config.required !== false,
            order: config.order
          });
        });
      }
      // Handle other types (group, etc.)
    }

    return approvers;
  }

  private async applyApprovalPolicies(approvalRequest: ApprovalRequest): Promise<void> {
    // Apply relevant policies based on request type and data
    const applicablePolicies = Array.from(this.policies.values())
      .filter(policy =>
        policy.isActive &&
        policy.type === approvalRequest.data.type
      );

    for (const policy of applicablePolicies) {
      // Evaluate policy rules and modify approvers if needed
      for (const rule of policy.rules) {
        if (this.evaluateCondition(rule.condition, approvalRequest.data)) {
          // Apply rule approvers
          // This would modify the approvalRequest.approvers array
        }
      }

      // Apply escalation policy
      if (policy.escalation?.enabled) {
        approvalRequest.escalationPolicy = {
          levels: [{
            duration: policy.escalation.timeoutHours * 60 * 60 * 1000,
            action: 'escalate',
            target: policy.escalation.escalateTo
          }]
        };
      }
    }
  }

  private evaluateCondition(
    condition: { field: string; operator: string; value: any },
    data: Record<string, any>
  ): boolean {
    const fieldValue = this.getNestedValue(data, condition.field);

    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'greater':
        return fieldValue > condition.value;
      case 'less':
        return fieldValue < condition.value;
      case 'contains':
        return Array.isArray(fieldValue) ?
          fieldValue.includes(condition.value) :
          String(fieldValue).includes(condition.value);
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, prop) => curr?.[prop], obj);
  }

  private async notifyApprovers(approvalRequest: ApprovalRequest): Promise<void> {
    for (const approver of approvalRequest.approvers) {
      if (approver.status === 'pending') {
        // Send notification
        await notificationService.notify({
          userId: approver.id,
          type: 'approval_request',
          title: `Approval Required: ${approvalRequest.title}`,
          message: approvalRequest.description,
          priority: approvalRequest.priority === 'urgent' ? 'high' : 'medium',
          data: {
            approvalId: approvalRequest.id,
            workflowInstanceId: approvalRequest.workflowInstanceId
          }
        });

        // Send email if available
        if (approver.email) {
          await sendEmail({
            to: approver.email,
            subject: `Approval Required: ${approvalRequest.title}`,
            template: 'approval-request',
            data: {
              approverName: approver.name,
              title: approvalRequest.title,
              description: approvalRequest.description,
              requester: approvalRequest.requester.name,
              priority: approvalRequest.priority,
              dueDate: approvalRequest.dueDate,
              approvalUrl: `${process.env.FRONTEND_URL}/approvals/${approvalRequest.id}`
            }
          });
        }
      }
    }
  }

  private setupEscalation(approvalRequest: ApprovalRequest): void {
    if (!approvalRequest.escalationPolicy) return;

    const timers: NodeJS.Timeout[] = [];

    approvalRequest.escalationPolicy.levels.forEach((level, index) => {
      const timer = setTimeout(async () => {
        await this.handleEscalation(approvalRequest, level, index);
      }, level.duration);

      timers.push(timer);
    });

    this.escalationTimers.set(approvalRequest.id, timers);
  }

  private async handleEscalation(
    approvalRequest: ApprovalRequest,
    level: any,
    levelIndex: number
  ): Promise<void> {
    this.logger.info(`Escalating approval ${approvalRequest.id} - Level ${levelIndex + 1}`);

    switch (level.action) {
      case 'notify':
        // Send escalation notification
        break;
      case 'escalate':
        // Add new approver or change approver
        if (level.target) {
          // Add escalation approver
        }
        break;
      case 'auto-approve':
        // Auto-approve the request
        await this.submitDecision(approvalRequest.id, 'system', {
          approverId: 'system',
          action: 'approved',
          comment: 'Auto-approved due to timeout'
        });
        break;
      case 'auto-reject':
        // Auto-reject the request
        await this.submitDecision(approvalRequest.id, 'system', {
          approverId: 'system',
          action: 'rejected',
          comment: 'Auto-rejected due to timeout'
        });
        break;
    }

    this.emit('approval:escalated', {
      approvalRequest,
      level: levelIndex + 1,
      action: level.action
    });
  }

  private clearEscalationTimers(approvalId: string): void {
    const timers = this.escalationTimers.get(approvalId);
    if (timers) {
      timers.forEach(timer => clearTimeout(timer));
      this.escalationTimers.delete(approvalId);
    }
  }

  private isApprovalComplete(approvalRequest: ApprovalRequest): boolean {
    const requiredApprovers = approvalRequest.approvers.filter(a => a.required);
    const allRequiredApproved = requiredApprovers.every(a =>
      a.status === 'approved' || a.status === 'delegated'
    );

    const hasRejection = approvalRequest.approvers.some(a => a.status === 'rejected');

    return hasRejection || allRequiredApproved;
  }

  private getFinalDecision(approvalRequest: ApprovalRequest): 'approved' | 'rejected' {
    const hasRejection = approvalRequest.approvers.some(a => a.status === 'rejected');
    return hasRejection ? 'rejected' : 'approved';
  }

  private async checkDelegation(
    approvalRequest: ApprovalRequest,
    userId: string
  ): Promise<boolean> {
    // Check if user has delegation from any of the approvers
    for (const approver of approvalRequest.approvers) {
      const delegations = this.delegations.get(approver.id) || [];
      const activeDelegation = delegations.find(d =>
        d.toUserId === userId &&
        d.isActive &&
        new Date() >= d.startDate &&
        (!d.endDate || new Date() <= d.endDate)
      );

      if (activeDelegation) {
        return true;
      }
    }

    return false;
  }

  private hasDelegatedAccess(approvalRequest: ApprovalRequest, userId: string): boolean {
    return this.checkDelegation(approvalRequest, userId) as unknown as boolean;
  }

  private async handleDelegation(
    approvalRequest: ApprovalRequest,
    fromUserId: string,
    toUserId: string
  ): Promise<void> {
    // Add new approver
    const delegatedUser = await User.findById(toUserId);
    if (delegatedUser) {
      approvalRequest.approvers.push({
        id: delegatedUser._id.toString(),
        type: 'user',
        name: delegatedUser.fullName,
        email: delegatedUser.email,
        status: 'pending',
        required: true
      });

      // Notify delegated approver
      await this.notifyApprovers(approvalRequest);
    }
  }

  private async reassignPendingApprovals(delegation: ApprovalDelegation): Promise<void> {
    const pendingApprovals = Array.from(this.approvalRequests.values())
      .filter(req =>
        req.approvers.some(a =>
          a.id === delegation.fromUserId &&
          a.status === 'pending'
        )
      );

    for (const approval of pendingApprovals) {
      await this.handleDelegation(approval, delegation.fromUserId, delegation.toUserId);
    }
  }

  private async notifyDecisionMade(
    approvalRequest: ApprovalRequest,
    approverId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    // Notify requester
    await notificationService.notify({
      userId: approvalRequest.requester.id,
      type: 'approval_decision',
      title: `Approval ${decision.action}: ${approvalRequest.title}`,
      message: decision.comment || `Your request has been ${decision.action}`,
      priority: 'high',
      data: {
        approvalId: approvalRequest.id,
        decision: decision.action,
        approverId
      }
    });

    // Notify other approvers if needed
    if (this.isApprovalComplete(approvalRequest)) {
      const finalDecision = this.getFinalDecision(approvalRequest);
      for (const approver of approvalRequest.approvers) {
        if (approver.id !== approverId && approver.status === 'pending') {
          await notificationService.notify({
            userId: approver.id,
            type: 'approval_completed',
            title: `Approval Completed: ${approvalRequest.title}`,
            message: `This approval request has been ${finalDecision}`,
            priority: 'medium',
            data: {
              approvalId: approvalRequest.id,
              finalDecision
            }
          });
        }
      }
    }
  }

  private async notifyCancellation(
    approvalRequest: ApprovalRequest,
    reason: string,
    cancelledBy: string
  ): Promise<void> {
    // Notify all pending approvers
    for (const approver of approvalRequest.approvers) {
      if (approver.status === 'pending') {
        await notificationService.notify({
          userId: approver.id,
          type: 'approval_cancelled',
          title: `Approval Cancelled: ${approvalRequest.title}`,
          message: reason,
          priority: 'high',
          data: {
            approvalId: approvalRequest.id,
            cancelledBy
          }
        });
      }
    }
  }

  private generateApprovalId(): string {
    return `apr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadDefaultPolicies(): void {
    // Load some default approval policies
    const purchaseOrderPolicy: ApprovalPolicy = {
      id: 'po-approval',
      name: 'Purchase Order Approval',
      type: 'purchase_order',
      rules: [
        {
          condition: { field: 'amount', operator: 'less', value: 1000 },
          approvers: [{ type: 'manager', value: 'direct' }]
        },
        {
          condition: { field: 'amount', operator: 'greater', value: 1000 },
          approvers: [
            { type: 'manager', value: 'direct' },
            { type: 'role', value: 'finance-manager' }
          ]
        }
      ],
      escalation: {
        enabled: true,
        timeoutHours: 48,
        escalateTo: 'director'
      },
      isActive: true
    };

    this.policies.set(purchaseOrderPolicy.id, purchaseOrderPolicy);
  }
}

export const approvalService = new ApprovalService();
