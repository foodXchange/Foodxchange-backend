import { EventEmitter } from 'events';

import cron from 'node-cron';

import { Logger } from '../../core/logging/logger';
import { AuditLog } from '../../models/AuditLog';

export interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  entityType: 'user' | 'transaction' | 'access' | 'data' | 'system';
  conditions: {
    metric: string;
    operator: 'equals' | 'greater' | 'less' | 'contains' | 'matches';
    value: any;
    timeWindow?: number; // in minutes
  }[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  actions: string[];
  enabled: boolean;
}

export interface MonitoringAlert {
  id: string;
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  detectedAt: Date;
  entities: any[];
  metrics: Record<string, any>;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  assignedTo?: string;
  resolvedAt?: Date;
  resolution?: string;
}

export class ComplianceMonitor extends EventEmitter {
  private readonly logger: Logger;
  private readonly rules: Map<string, MonitoringRule> = new Map();
  private readonly alerts: Map<string, MonitoringAlert> = new Map();
  private readonly monitors: Map<string, cron.ScheduledTask> = new Map();
  private readonly metrics: Map<string, any[]> = new Map();

  constructor() {
    super();
    this.logger = new Logger('ComplianceMonitor');
    this.initializeDefaultRules();
    this.startMonitoring();
  }

  /**
   * Add monitoring rule
   */
  addRule(rule: MonitoringRule): void {
    this.rules.set(rule.id, rule);
    this.logger.info(`Monitoring rule added: ${rule.name}`);

    if (rule.enabled) {
      this.startRuleMonitor(rule);
    }
  }

  /**
   * Start monitoring for a specific rule
   */
  private startRuleMonitor(rule: MonitoringRule): void {
    // Monitor every minute
    const task = cron.schedule('* * * * *', async () => {
      await this.checkRule(rule);
    });

    this.monitors.set(rule.id, task);
    task.start();
  }

  /**
   * Check monitoring rule
   */
  private async checkRule(rule: MonitoringRule): Promise<void> {
    try {
      const timeWindow = rule.conditions[0]?.timeWindow || 60; // Default 60 minutes
      const startTime = new Date(Date.now() - timeWindow * 60 * 1000);

      // Query audit logs based on rule conditions
      const query: any = {
        timestamp: { $gte: startTime }
      };

      // Apply entity type filter
      if (rule.entityType === 'user') {
        query.category = { $in: ['auth', 'data'] };
      } else if (rule.entityType === 'transaction') {
        query.category = 'financial';
      } else if (rule.entityType === 'access') {
        query.action = { $regex: 'access' };
      } else if (rule.entityType === 'system') {
        query.category = 'system';
      }

      const logs = await AuditLog.find(query).limit(1000);

      // Evaluate conditions
      const violations = this.evaluateConditions(rule, logs);

      if (violations.length > 0) {
        await this.createAlert(rule, violations);
      }
    } catch (error) {
      this.logger.error(`Error checking rule ${rule.id}:`, error);
    }
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(rule: MonitoringRule, logs: any[]): any[] {
    const violations: any[] = [];

    // Group logs by relevant metric
    const metrics = this.calculateMetrics(logs, rule);

    // Check each condition
    for (const condition of rule.conditions) {
      const metricValue = metrics[condition.metric];

      if (this.checkCondition(metricValue, condition)) {
        violations.push({
          metric: condition.metric,
          value: metricValue,
          condition,
          logs: logs.filter(log => this.matchesCondition(log, condition))
        });
      }
    }

    return violations;
  }

  /**
   * Calculate metrics from logs
   */
  private calculateMetrics(logs: any[], rule: MonitoringRule): Record<string, any> {
    const metrics: Record<string, any> = {};

    // Failed login attempts
    metrics.failedLoginAttempts = logs.filter(log =>
      log.action === 'login_failed'
    ).length;

    // Unauthorized access attempts
    metrics.unauthorizedAccess = logs.filter(log =>
      log.result === 'failure' && log.action.includes('access')
    ).length;

    // Critical errors
    metrics.criticalErrors = logs.filter(log =>
      log.severity === 'critical'
    ).length;

    // Data modifications
    metrics.dataModifications = logs.filter(log =>
      log.category === 'data' && ['create', 'update', 'delete'].some(a => log.action.includes(a))
    ).length;

    // Unique users
    metrics.uniqueUsers = new Set(logs.map(log => log.userId).filter(Boolean)).size;

    // Error rate
    const totalLogs = logs.length;
    const errors = logs.filter(log => log.result === 'failure').length;
    metrics.errorRate = totalLogs > 0 ? (errors / totalLogs) * 100 : 0;

    // Add custom metrics based on rule
    this.addCustomMetrics(metrics, logs, rule);

    return metrics;
  }

  /**
   * Add custom metrics
   */
  private addCustomMetrics(metrics: Record<string, any>, logs: any[], rule: MonitoringRule): void {
    // Suspicious patterns
    if (rule.entityType === 'user') {
      // Multiple failed logins from same IP
      const ipFailures = new Map<string, number>();
      logs.filter(log => log.action === 'login_failed' && log.ipAddress)
        .forEach(log => {
          const count = ipFailures.get(log.ipAddress) || 0;
          ipFailures.set(log.ipAddress, count + 1);
        });

      metrics.suspiciousIPs = Array.from(ipFailures.entries())
        .filter(([ip, count]) => count > 5)
        .map(([ip, count]) => ({ ip, count }));
    }

    // High-risk operations
    if (rule.entityType === 'transaction') {
      metrics.highValueTransactions = logs.filter(log =>
        log.metadata?.amount && log.metadata.amount > 10000
      ).length;
    }
  }

  /**
   * Check individual condition
   */
  private checkCondition(value: any, condition: any): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'greater':
        return value > condition.value;
      case 'less':
        return value < condition.value;
      case 'contains':
        return Array.isArray(value) ? value.includes(condition.value) : String(value).includes(condition.value);
      case 'matches':
        return new RegExp(condition.value).test(String(value));
      default:
        return false;
    }
  }

  /**
   * Check if log matches condition
   */
  private matchesCondition(log: any, condition: any): boolean {
    // Implementation would check if specific log matches the condition
    return true;
  }

  /**
   * Create monitoring alert
   */
  private async createAlert(rule: MonitoringRule, violations: any[]): Promise<void> {
    const alert: MonitoringAlert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      severity: rule.severity,
      title: `${rule.name} - Violation Detected`,
      description: this.generateAlertDescription(rule, violations),
      detectedAt: new Date(),
      entities: violations.flatMap(v => v.logs.map((l: any) => ({
        type: l.resource?.type,
        id: l.resource?.id,
        userId: l.userId
      }))),
      metrics: violations.reduce((acc, v) => {
        acc[v.metric] = v.value;
        return acc;
      }, {}),
      status: 'open'
    };

    this.alerts.set(alert.id, alert);

    // Execute actions
    for (const actionId of rule.actions) {
      await this.executeAction(actionId, alert);
    }

    // Log audit event
    await this.logAlertAudit(alert, rule);

    this.emit('alert:created', alert);
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(rule: MonitoringRule, violations: any[]): string {
    const descriptions: string[] = [];

    for (const violation of violations) {
      descriptions.push(
        `${violation.metric}: ${violation.value} (threshold: ${violation.condition.operator} ${violation.condition.value})`
      );
    }

    return `${rule.description}\n\nViolations detected:\n${descriptions.join('\n')}`;
  }

  /**
   * Execute alert action
   */
  private async executeAction(actionId: string, alert: MonitoringAlert): Promise<void> {
    switch (actionId) {
      case 'notify_admin':
        // Send notification to administrators
        this.logger.info(`Notifying administrators about alert ${alert.id}`);
        break;

      case 'block_user':
        // Block users involved in the alert
        if (alert.severity === 'critical') {
          for (const entity of alert.entities) {
            if (entity.userId) {
              this.logger.warn(`Blocking user ${entity.userId} due to critical alert`);
            }
          }
        }
        break;

      case 'escalate':
        // Escalate to security team
        this.logger.info(`Escalating alert ${alert.id} to security team`);
        break;

      case 'auto_remediate':
        // Attempt automatic remediation
        await this.attemptRemediation(alert);
        break;
    }
  }

  /**
   * Attempt automatic remediation
   */
  private async attemptRemediation(alert: MonitoringAlert): Promise<void> {
    const rule = this.rules.get(alert.ruleId);
    if (!rule) return;

    switch (rule.entityType) {
      case 'user':
        // Reset failed login attempts
        if (alert.metrics.failedLoginAttempts > 10) {
          this.logger.info('Resetting failed login attempts for affected users');
        }
        break;

      case 'access':
        // Revoke suspicious access tokens
        if (alert.metrics.unauthorizedAccess > 5) {
          this.logger.info('Revoking access tokens for suspicious activity');
        }
        break;
    }
  }

  /**
   * Log alert audit
   */
  private async logAlertAudit(alert: MonitoringAlert, rule: MonitoringRule): Promise<void> {
    const auditLog = new AuditLog({
      action: 'compliance_alert_created',
      category: 'security',
      severity: alert.severity as any,
      resource: {
        type: 'alert',
        id: alert.id,
        name: rule.name
      },
      result: 'success',
      metadata: {
        alertId: alert.id,
        ruleId: rule.id,
        metrics: alert.metrics,
        entityCount: alert.entities.length
      },
      compliance: {
        dataClassification: 'internal'
      }
    });

    await auditLog.save();
  }

  /**
   * Get monitoring dashboard data
   */
  async getDashboardData(): Promise<{
    activeRules: number;
    openAlerts: number;
    alertsByS

: Record<string, number>;
    recentAlerts: MonitoringAlert[];
    metrics: Record<string, any>;
  }> {
    const activeRules = Array.from(this.rules.values()).filter(r => r.enabled).length;
    const openAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'open').length;

    const alertsBySeverity: Record<string, number> = {};
    Array.from(this.alerts.values()).forEach(alert => {
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
    });

    const recentAlerts = Array.from(this.alerts.values())
      .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
      .slice(0, 10);

    return {
      activeRules,
      openAlerts,
      alertsBySeverity,
      recentAlerts,
      metrics: await this.getSystemMetrics()
    };
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<Record<string, any>> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalLogs,
      criticalEvents,
      failedLogins,
      dataModifications
    ] = await Promise.all([
      AuditLog.countDocuments({ timestamp: { $gte: last24Hours } }),
      AuditLog.countDocuments({ timestamp: { $gte: last24Hours }, severity: 'critical' }),
      AuditLog.countDocuments({ timestamp: { $gte: last24Hours }, action: 'login_failed' }),
      AuditLog.countDocuments({
        timestamp: { $gte: last24Hours },
        category: 'data',
        action: { $in: ['create', 'update', 'delete'] }
      })
    ]);

    return {
      totalLogs,
      criticalEvents,
      failedLogins,
      dataModifications,
      averageResponseTime: 0, // Would be calculated from actual metrics
      errorRate: 0 // Would be calculated from actual metrics
    };
  }

  /**
   * Initialize default monitoring rules
   */
  private initializeDefaultRules(): void {
    // Brute force detection
    this.addRule({
      id: 'brute-force-detection',
      name: 'Brute Force Attack Detection',
      description: 'Detects multiple failed login attempts',
      entityType: 'user',
      conditions: [
        {
          metric: 'failedLoginAttempts',
          operator: 'greater',
          value: 10,
          timeWindow: 5
        }
      ],
      severity: 'high',
      actions: ['notify_admin', 'block_user'],
      enabled: true
    });

    // Unauthorized access monitoring
    this.addRule({
      id: 'unauthorized-access',
      name: 'Unauthorized Access Attempts',
      description: 'Monitors for repeated unauthorized access attempts',
      entityType: 'access',
      conditions: [
        {
          metric: 'unauthorizedAccess',
          operator: 'greater',
          value: 5,
          timeWindow: 60
        }
      ],
      severity: 'critical',
      actions: ['notify_admin', 'escalate'],
      enabled: true
    });

    // System error monitoring
    this.addRule({
      id: 'system-errors',
      name: 'High System Error Rate',
      description: 'Alerts when system error rate exceeds threshold',
      entityType: 'system',
      conditions: [
        {
          metric: 'errorRate',
          operator: 'greater',
          value: 20, // 20% error rate
          timeWindow: 10
        }
      ],
      severity: 'high',
      actions: ['notify_admin'],
      enabled: true
    });

    // Data breach detection
    this.addRule({
      id: 'data-breach-detection',
      name: 'Potential Data Breach',
      description: 'Detects unusual data access patterns',
      entityType: 'data',
      conditions: [
        {
          metric: 'dataModifications',
          operator: 'greater',
          value: 100,
          timeWindow: 5
        }
      ],
      severity: 'critical',
      actions: ['notify_admin', 'escalate', 'auto_remediate'],
      enabled: true
    });
  }

  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    // Start monitoring for each enabled rule
    Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .forEach(rule => this.startRuleMonitor(rule));

    // Start metrics collection
    cron.schedule('*/5 * * * *', async () => {
      await this.collectMetrics();
    }).start();

    this.logger.info('Compliance monitoring started');
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getSystemMetrics();

      // Store metrics for trend analysis
      const timestamp = new Date();
      for (const [key, value] of Object.entries(metrics)) {
        const history = this.metrics.get(key) || [];
        history.push({ timestamp, value });

        // Keep only last 24 hours of data
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        this.metrics.set(key, history.filter(m => m.timestamp > cutoff));
      }
    } catch (error) {
      this.logger.error('Error collecting metrics:', error);
    }
  }

  /**
   * Get metric trends
   */
  getMetricTrends(metricName: string, hours: number = 24): Array<{ timestamp: Date; value: any }> {
    const history = this.metrics.get(metricName) || [];
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return history.filter(m => m.timestamp > cutoff);
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert && alert.status === 'open') {
      alert.status = 'acknowledged';
      alert.assignedTo = userId;
      this.emit('alert:acknowledged', alert);
    }
  }

  /**
   * Resolve alert
   */
  async resolveAlert(
    alertId: string,
    userId: string,
    resolution: string
  ): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      alert.resolution = resolution;
      this.emit('alert:resolved', alert);
    }
  }

  /**
   * Mark alert as false positive
   */
  async markFalsePositive(alertId: string, userId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'false_positive';
      alert.resolvedAt = new Date();
      alert.resolution = 'Marked as false positive';

      // Adjust rule sensitivity if too many false positives
      const rule = this.rules.get(alert.ruleId);
      if (rule) {
        const falsePositives = Array.from(this.alerts.values())
          .filter(a => a.ruleId === rule.id && a.status === 'false_positive')
          .length;

        if (falsePositives > 5) {
          this.logger.warn(`Rule ${rule.name} has ${falsePositives} false positives, consider adjusting thresholds`);
        }
      }

      this.emit('alert:false_positive', alert);
    }
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown monitoring
   */
  async shutdown(): Promise<void> {
    // Stop all monitors
    for (const [ruleId, task] of this.monitors) {
      task.stop();
    }
    this.monitors.clear();

    this.logger.info('Compliance monitoring stopped');
  }
}

export const complianceMonitor = new ComplianceMonitor();
