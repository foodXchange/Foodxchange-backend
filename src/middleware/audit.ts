import { Request, Response, NextFunction } from 'express';

import { Logger } from '../core/logging/logger';
import { AuditLog } from '../models/AuditLog';

interface AuditRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    companyId: string;
  };
  auditLog?: any;
}

export interface AuditOptions {
  action: string;
  category: 'auth' | 'data' | 'system' | 'security' | 'compliance' | 'financial' | 'api';
  resourceType: string;
  skipOnError?: boolean;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  sensitiveFields?: string[];
}

const logger = new Logger('AuditMiddleware');

/**
 * Sanitize sensitive data from objects
 */
function sanitizeData(data: any, sensitiveFields: string[] = []): any {
  if (!data) return data;

  const defaultSensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'creditCard',
    'ssn',
    'bankAccount'
  ];

  const allSensitiveFields = [...defaultSensitiveFields, ...sensitiveFields];

  const sanitize = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};

      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();

        if (allSensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitize(value);
        }
      }

      return sanitized;
    }

    return obj;
  };

  return sanitize(data);
}

/**
 * Main audit middleware
 */
export function audit(options: AuditOptions) {
  return async (req: AuditRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;

    // Capture response data
    let responseData: any;
    let statusCode: number;

    // Override response methods
    res.send = function(data: any) {
      responseData = data;
      statusCode = res.statusCode;
      return originalSend.call(this, data);
    };

    res.json = function(data: any) {
      responseData = data;
      statusCode = res.statusCode;
      return originalJson.call(this, data);
    };

    // Continue with request processing
    res.on('finish', async () => {
      try {
        const duration = Date.now() - startTime;
        const result = statusCode >= 200 && statusCode < 400 ? 'success' : 'failure';

        // Skip audit logging for certain conditions
        if (options.skipOnError && result === 'failure') {
          return;
        }

        // Extract resource ID from params or body
        const resourceId = req.params.id ||
                          req.params[`${options.resourceType}Id`] ||
                          req.body?.id ||
                          responseData?.data?.id;

        // Prepare audit log data
        const auditData: any = {
          action: options.action,
          category: options.category,
          severity: result === 'failure' ? 'error' : 'info',
          userId: req.user?.id,
          userEmail: req.user?.email,
          userRole: req.user?.role,
          companyId: req.user?.companyId,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          resource: {
            type: options.resourceType,
            id: resourceId,
            collection: `${options.resourceType}s`
          },
          result,
          duration,
          metadata: {
            method: req.method,
            path: req.path,
            query: sanitizeData(req.query),
            responseStatus: statusCode,
            responseTime: duration
          }
        };

        // Include request body if specified
        if (options.includeRequestBody && req.body) {
          auditData.metadata.body = sanitizeData(req.body, options.sensitiveFields);
        }

        // Include response body if specified
        if (options.includeResponseBody && responseData) {
          auditData.metadata.response = sanitizeData(responseData, options.sensitiveFields);
        }

        // Add error details if failed
        if (result === 'failure' && responseData?.error) {
          auditData.errorDetails = {
            code: responseData.error.code,
            message: responseData.error.message
          };
        }

        // Create audit log
        const auditLog = new AuditLog(auditData);
        await auditLog.save();

        // Attach to request for reference
        req.auditLog = auditLog;

      } catch (error) {
        logger.error('Failed to create audit log:', error);
        // Don't fail the request due to audit logging failure
      }
    });

    next();
  };
}

/**
 * Audit middleware for authentication events
 */
export function auditAuth(action: string) {
  return audit({
    action,
    category: 'auth',
    resourceType: 'user',
    includeRequestBody: false,
    includeResponseBody: false
  });
}

/**
 * Audit middleware for data operations
 */
export function auditData(action: string, resourceType: string, includeBody = true) {
  return audit({
    action,
    category: 'data',
    resourceType,
    includeRequestBody: includeBody,
    includeResponseBody: false
  });
}

/**
 * Audit middleware for financial transactions
 */
export function auditFinancial(action: string, resourceType: string) {
  return audit({
    action,
    category: 'financial',
    resourceType,
    includeRequestBody: true,
    includeResponseBody: true,
    sensitiveFields: ['cardNumber', 'cvv', 'accountNumber']
  });
}

/**
 * Audit middleware for compliance operations
 */
export function auditCompliance(action: string, resourceType: string) {
  return audit({
    action,
    category: 'compliance',
    resourceType,
    includeRequestBody: true,
    includeResponseBody: true
  });
}

/**
 * Audit middleware for API access
 */
export function auditAPI(action: string, resourceType: string) {
  return audit({
    action,
    category: 'api',
    resourceType,
    includeRequestBody: false,
    includeResponseBody: false
  });
}

/**
 * Log manual audit entry
 */
export async function logAudit(
  req: AuditRequest,
  action: string,
  category: 'auth' | 'data' | 'system' | 'security' | 'compliance' | 'financial' | 'api',
  resource: { type: string; id?: string; name?: string },
  result: 'success' | 'failure' | 'partial',
  metadata?: any
): Promise<void> {
  try {
    const auditLog = new AuditLog({
      action,
      category,
      severity: result === 'failure' ? 'error' : 'info',
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      companyId: req.user?.companyId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      resource,
      result,
      metadata: sanitizeData(metadata),
      timestamp: new Date()
    });

    await auditLog.save();
  } catch (error) {
    logger.error('Failed to log audit:', error);
  }
}
