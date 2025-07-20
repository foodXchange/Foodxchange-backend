import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { MetricsService } from '../core/metrics/MetricsService';
import { AuditLog, IAuditLog } from '../models/AuditLog';
import { complianceMonitor } from '../services/compliance/ComplianceMonitor';

interface AuditRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyId: string;
  };
}

export class AuditController {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;

  constructor() {
    this.logger = new Logger('AuditController');
    this.metrics = new MetricsService();
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(req: AuditRequest, res: Response): Promise<void> {
    try {
      const {
        action,
        category,
        severity,
        userId,
        resourceType,
        resourceId,
        result,
        startDate,
        endDate,
        tags,
        page = 1,
        limit = 50,
        sort = '-timestamp'
      } = req.query;

      // Build query
      const query: any = {};

      // Check permissions
      if (req.user?.role !== 'admin') {
        // Non-admins can only see their company's logs
        query.companyId = req.user?.companyId;
      }

      // Apply filters
      if (action) query.action = new RegExp(action as string, 'i');
      if (category) query.category = category;
      if (severity) query.severity = severity;
      if (userId) query.userId = userId;
      if (resourceType) query['resource.type'] = resourceType;
      if (resourceId) query['resource.id'] = resourceId;
      if (result) query.result = result;
      if (tags) query.tags = { $in: Array.isArray(tags) ? tags : [tags] };

      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate as string);
        if (endDate) query.timestamp.$lte = new Date(endDate as string);
      }

      // Execute query with pagination
      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort(sort as string)
          .limit(Number(limit))
          .skip(skip)
          .populate('userId', 'firstName lastName email')
          .populate('companyId', 'name'),
        AuditLog.countDocuments(query)
      ]);

      this.metrics.incrementCounter('audit_logs_queried');

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to get audit logs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AUDIT_LOGS_FAILED',
          message: 'Failed to retrieve audit logs'
        }
      });
    }
  }

  /**
   * Get single audit log
   */
  async getAuditLog(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const log = await AuditLog.findById(id)
        .populate('userId', 'firstName lastName email')
        .populate('companyId', 'name');

      if (!log) {
        res.status(404).json({
          success: false,
          error: {
            code: 'AUDIT_LOG_NOT_FOUND',
            message: 'Audit log not found'
          }
        });
        return;
      }

      // Check permissions
      if (req.user?.role !== 'admin' && log.companyId?.toString() !== req.user?.companyId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Access to this audit log is denied'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: log
      });
    } catch (error) {
      this.logger.error('Failed to get audit log:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AUDIT_LOG_FAILED',
          message: 'Failed to retrieve audit log'
        }
      });
    }
  }

  /**
   * Create manual audit log entry
   */
  async createAuditLog(req: AuditRequest, res: Response): Promise<void> {
    try {
      const auditData = {
        ...req.body,
        userId: req.user?.id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        companyId: req.user?.companyId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date()
      };

      const auditLog = new AuditLog(auditData);
      await auditLog.save();

      this.logger.info('Manual audit log created', {
        id: auditLog._id,
        action: auditLog.action,
        userId: req.user?.id
      });

      res.status(201).json({
        success: true,
        data: auditLog
      });
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_AUDIT_LOG_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create audit log'
        }
      });
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      const dateRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      // Get statistics by category
      const categoryStats = await AuditLog.aggregate([
        ...(dateRange ? [{ $match: { timestamp: { $gte: dateRange.start, $lte: dateRange.end } } }] : []),
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]);

      // Get recent critical events
      const criticalEvents = await AuditLog.find({
        severity: { $in: ['critical', 'high'] },
        timestamp: { $gte: dateRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(10).sort({ timestamp: -1 });

      // Get security events
      const securityEvents = await AuditLog.find({
        category: { $in: ['authentication', 'authorization', 'security'] },
        timestamp: { $gte: dateRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(10).sort({ timestamp: -1 });

      // Calculate additional metrics
      const query: any = {};
      if (dateRange) {
        query.timestamp = { $gte: dateRange.start, $lte: dateRange.end };
      }

      const [
        totalLogs,
        failureCount,
        uniqueUsers,
        highRiskCount
      ] = await Promise.all([
        AuditLog.countDocuments(query),
        AuditLog.countDocuments({ ...query, result: 'failure' }),
        AuditLog.distinct('userId', query).then(users => users.length),
        AuditLog.countDocuments({ ...query, 'risk.level': { $in: ['high', 'critical'] } })
      ]);

      res.json({
        success: true,
        data: {
          categoryStats,
          summary: {
            totalLogs,
            failureCount,
            failureRate: totalLogs > 0 ? (failureCount / totalLogs) * 100 : 0,
            uniqueUsers,
            highRiskCount,
            criticalEventCount: criticalEvents.length,
            securityEventCount: securityEvents.length
          },
          recentCriticalEvents: criticalEvents.slice(0, 10),
          recentSecurityEvents: securityEvents.slice(0, 10)
        }
      });
    } catch (error) {
      this.logger.error('Failed to get audit stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_AUDIT_STATS_FAILED',
          message: 'Failed to retrieve audit statistics'
        }
      });
    }
  }

  /**
   * Search audit logs
   */
  async searchAuditLogs(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { q, page = 1, limit = 50 } = req.query;

      if (!q || (q as string).trim().length < 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SEARCH_QUERY',
            message: 'Search query must be at least 2 characters'
          }
        });
        return;
      }

      // Build text search query
      const query: any = {
        $text: { $search: q as string }
      };

      // Apply company filter for non-admins
      if (req.user?.role !== 'admin') {
        query.companyId = req.user?.companyId;
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([
        AuditLog.find(query, { score: { $meta: 'textScore' } })
          .sort({ score: { $meta: 'textScore' } })
          .limit(Number(limit))
          .skip(skip)
          .populate('userId', 'firstName lastName email'),
        AuditLog.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to search audit logs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_AUDIT_LOGS_FAILED',
          message: 'Failed to search audit logs'
        }
      });
    }
  }

  /**
   * Get compliance monitoring dashboard
   */
  async getComplianceDashboard(req: AuditRequest, res: Response): Promise<void> {
    try {
      // Check admin permissions
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'Only administrators can access compliance dashboard'
          }
        });
        return;
      }

      const dashboardData = await complianceMonitor.getDashboardData();

      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      this.logger.error('Failed to get compliance dashboard:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_COMPLIANCE_DASHBOARD_FAILED',
          message: 'Failed to retrieve compliance dashboard'
        }
      });
    }
  }

  /**
   * Get compliance alerts
   */
  async getComplianceAlerts(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { status, severity, ruleId, page = 1, limit = 50 } = req.query;

      // Get alerts from compliance monitor
      const alerts = await complianceMonitor.getDashboardData();
      let filteredAlerts = alerts.recentAlerts;

      // Apply filters
      if (status) {
        filteredAlerts = filteredAlerts.filter(alert => alert.status === status);
      }
      if (severity) {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
      }
      if (ruleId) {
        filteredAlerts = filteredAlerts.filter(alert => alert.ruleId === ruleId);
      }

      // Pagination
      const start = (Number(page) - 1) * Number(limit);
      const paginatedAlerts = filteredAlerts.slice(start, start + Number(limit));

      res.json({
        success: true,
        data: {
          alerts: paginatedAlerts,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: filteredAlerts.length,
            pages: Math.ceil(filteredAlerts.length / Number(limit))
          }
        }
      });
    } catch (error) {
      this.logger.error('Failed to get compliance alerts:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_COMPLIANCE_ALERTS_FAILED',
          message: 'Failed to retrieve compliance alerts'
        }
      });
    }
  }

  /**
   * Acknowledge compliance alert
   */
  async acknowledgeAlert(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;
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

      await complianceMonitor.acknowledgeAlert(alertId, userId);

      // Log the acknowledgment
      await new AuditLog({
        action: 'compliance_alert_acknowledged',
        category: 'compliance',
        severity: 'info',
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        companyId: req.user?.companyId,
        resource: {
          type: 'alert',
          id: alertId
        },
        result: 'success',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).save();

      res.json({
        success: true,
        data: {
          message: 'Alert acknowledged successfully'
        }
      });
    } catch (error) {
      this.logger.error('Failed to acknowledge alert:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'ACKNOWLEDGE_ALERT_FAILED',
          message: 'Failed to acknowledge alert'
        }
      });
    }
  }

  /**
   * Resolve compliance alert
   */
  async resolveAlert(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { alertId } = req.params;
      const { resolution } = req.body;
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

      if (!resolution) {
        res.status(400).json({
          success: false,
          error: {
            code: 'RESOLUTION_REQUIRED',
            message: 'Resolution description is required'
          }
        });
        return;
      }

      await complianceMonitor.resolveAlert(alertId, userId, resolution);

      // Log the resolution
      await new AuditLog({
        action: 'compliance_alert_resolved',
        category: 'compliance',
        severity: 'info',
        userId,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        companyId: req.user?.companyId,
        resource: {
          type: 'alert',
          id: alertId
        },
        result: 'success',
        metadata: { resolution },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).save();

      res.json({
        success: true,
        data: {
          message: 'Alert resolved successfully'
        }
      });
    } catch (error) {
      this.logger.error('Failed to resolve alert:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'RESOLVE_ALERT_FAILED',
          message: 'Failed to resolve alert'
        }
      });
    }
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { format = 'json', ...filters } = req.query;

      // Build query (similar to getAuditLogs)
      const query: any = {};
      if (req.user?.role !== 'admin') {
        query.companyId = req.user?.companyId;
      }

      // Apply filters
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate as string);
        if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate as string);
      }

      const logs = await AuditLog.find(query)
        .sort('-timestamp')
        .limit(10000) // Limit export size
        .lean();

      switch (format) {
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.json"');
          res.json(logs);
          break;

        case 'csv':
          const csv = this.convertToCSV(logs);
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
          res.send(csv);
          break;

        default:
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_FORMAT',
              message: 'Invalid export format. Use json or csv'
            }
          });
      }
    } catch (error) {
      this.logger.error('Failed to export audit logs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_AUDIT_LOGS_FAILED',
          message: 'Failed to export audit logs'
        }
      });
    }
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: any[]): string {
    if (logs.length === 0) return '';

    const headers = [
      'Timestamp',
      'Action',
      'Category',
      'Severity',
      'User Email',
      'Resource Type',
      'Resource ID',
      'Result',
      'IP Address',
      'Risk Level'
    ];

    const rows = logs.map(log => [
      log.timestamp,
      log.action,
      log.category,
      log.severity,
      log.userEmail || '',
      log.resource?.type || '',
      log.resource?.id || '',
      log.result,
      log.ipAddress || '',
      log.risk?.level || ''
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  /**
   * Get metric trends
   */
  async getMetricTrends(req: AuditRequest, res: Response): Promise<void> {
    try {
      const { metric, hours = 24 } = req.query;

      if (!metric) {
        res.status(400).json({
          success: false,
          error: {
            code: 'METRIC_REQUIRED',
            message: 'Metric name is required'
          }
        });
        return;
      }

      const trends = complianceMonitor.getMetricTrends(
        metric as string,
        Number(hours)
      );

      res.json({
        success: true,
        data: {
          metric,
          hours: Number(hours),
          trends
        }
      });
    } catch (error) {
      this.logger.error('Failed to get metric trends:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_METRIC_TRENDS_FAILED',
          message: 'Failed to retrieve metric trends'
        }
      });
    }
  }
}

export const auditController = new AuditController();
