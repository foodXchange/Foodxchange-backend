import { EventEmitter } from 'events';

import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/monitoring/metrics';
import { CacheService } from '../../infrastructure/cache/CacheService';

const logger = new Logger('AuditService');
const metrics = metricsService;

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: 'rfq' | 'product' | 'compliance' | 'user' | 'order' | 'proposal' | 'certification';
  entityId: string;
  changes?: any;
  details?: any;
  timestamp: Date;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'business' | 'security' | 'compliance' | 'system';
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  severity?: string;
  category?: string;
  correlationId?: string;
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  query: AuditQuery;
  results: AuditLog[];
  generatedAt: Date;
  generatedBy: string;
  format: 'json' | 'csv' | 'pdf';
}

export class AuditService extends EventEmitter {
  private static instance: AuditService;
  private readonly cache: CacheService;

  private constructor() {
    super();
    this.cache = cacheService;
  }

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  async log(auditData: Omit<AuditLog, 'id' | 'severity' | 'category'>): Promise<void> {
    try {
      const auditLog: AuditLog = {
        id: new mongoose.Types.ObjectId().toString(),
        ...auditData,
        severity: this.determineSeverity(auditData.action),
        category: this.determineCategory(auditData.action)
      };

      // Save to database
      await this.saveAuditLog(auditLog);

      // Emit event
      this.emit('audit:logged', auditLog);

      metrics.increment('audit_logs_created');

      logger.debug('Audit log created', {
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType
      });
    } catch (error) {
      logger.error('Failed to create audit log', { auditData, error });
    }
  }

  private determineSeverity(action: string): 'info' | 'warning' | 'error' | 'critical' {
    const criticalActions = ['user_deleted', 'compliance_failed', 'security_breach'];
    const errorActions = ['login_failed', 'validation_failed', 'payment_failed'];
    const warningActions = ['proposal_rejected', 'compliance_warning'];

    if (criticalActions.includes(action)) return 'critical';
    if (errorActions.includes(action)) return 'error';
    if (warningActions.includes(action)) return 'warning';
    return 'info';
  }

  private determineCategory(action: string): 'business' | 'security' | 'compliance' | 'system' {
    const securityActions = ['login_failed', 'password_changed', 'account_locked'];
    const complianceActions = ['compliance_check', 'certification_uploaded'];
    const systemActions = ['system_started', 'backup_created'];

    if (securityActions.includes(action)) return 'security';
    if (complianceActions.includes(action)) return 'compliance';
    if (systemActions.includes(action)) return 'system';
    return 'business';
  }

  private async saveAuditLog(auditLog: AuditLog): Promise<void> {
    // Save to database implementation
  }

  async query(query: AuditQuery, pagination?: { page: number; limit: number }): Promise<{
    logs: AuditLog[];
    total: number;
    page?: number;
    pages?: number;
  }> {
    // Query audit logs implementation
    return {
      logs: [],
      total: 0,
      page: pagination?.page,
      pages: pagination ? Math.ceil(0 / pagination.limit) : undefined
    };
  }
}

export default AuditService.getInstance();
