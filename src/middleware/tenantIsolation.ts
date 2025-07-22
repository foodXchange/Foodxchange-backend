import { Request, Response, NextFunction } from 'express';

import { AuthenticationError, AuthorizationError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { User } from '../models/User';

const logger = new Logger('TenantIsolationMiddleware');

// Extend Request interface to include tenant information
declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
      tenantId?: string;
      tenantContext?: {
        id: string;
        name: string;
        domain: string;
        subscriptionTier: 'basic' | 'standard' | 'premium' | 'enterprise';
        features: string[];
        limits: {
          maxUsers: number;
          maxProducts: number;
          maxOrders: number;
          apiCallsPerMinute: number;
          orderApprovalThreshold?: number;
        };
      };
    }
  }
}

/**
 * Middleware to extract and validate tenant information from the authenticated user
 */
export const extractTenantContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || !req.userId) {
      return next();
    }

    const user = await User.findById(req.userId).populate('company');

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Extract tenant information from user's company
    if (user.company) {
      const company = user.company as any;
      req.tenantId = company._id.toString();
      req.tenantContext = {
        id: company._id.toString(),
        name: company.name,
        domain: company.domain || '',
        subscriptionTier: company.subscriptionTier || 'basic',
        features: company.features || [],
        limits: {
          maxUsers: company.limits?.maxUsers || 10,
          maxProducts: company.limits?.maxProducts || 100,
          maxOrders: company.limits?.maxOrders || 50,
          apiCallsPerMinute: company.limits?.apiCallsPerMinute || 100,
          orderApprovalThreshold: company.limits?.orderApprovalThreshold || 10000
        }
      };

      logger.debug('Tenant context extracted', {
        userId: req.userId,
        tenantId: req.tenantId,
        tenantName: req.tenantContext.name,
        subscriptionTier: req.tenantContext.subscriptionTier
      });
    }

    next();
  } catch (error) {
    logger.error('Error extracting tenant context:', error);
    next(error);
  }
};

/**
 * Middleware to ensure tenant isolation for data access
 */
export const enforceTenantIsolation = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.tenantId) {
      throw new AuthorizationError('Tenant context required for this operation');
    }

    // Add tenant filter to query parameters
    if (req.query && typeof req.query === 'object') {
      (req.query as any).tenantId = req.tenantId;
    }

    // Add tenant context to request body for creation operations
    if (req.body && typeof req.body === 'object' && (req.method === 'POST' || req.method === 'PUT')) {
      req.body.tenantId = req.tenantId;
    }

    next();
  } catch (error) {
    logger.error('Error enforcing tenant isolation:', error);
    next(error);
  }
};

/**
 * Middleware to check if tenant has access to specific features
 */
export const requireTenantFeature = (feature: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.tenantContext) {
        throw new AuthorizationError('Tenant context required');
      }

      const hasFeature = req.tenantContext.features.includes(feature) ||
                        req.tenantContext.subscriptionTier === 'enterprise';

      if (!hasFeature) {
        logger.warn('Feature access denied', {
          tenantId: req.tenantId,
          feature,
          subscriptionTier: req.tenantContext.subscriptionTier,
          availableFeatures: req.tenantContext.features
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            message: `Feature '${feature}' is not available for your subscription tier`,
            requiredFeature: feature,
            currentTier: req.tenantContext.subscriptionTier,
            upgradeUrl: '/api/billing/upgrade'
          }
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error checking tenant feature:', error);
      next(error);
    }
  };
};

/**
 * Middleware to check tenant resource limits
 */
export const checkTenantLimits = (resource: 'users' | 'products' | 'orders') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantContext) {
        throw new AuthorizationError('Tenant context required');
      }

      const limit = req.tenantContext.limits[`max${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof req.tenantContext.limits];

      // Get current count for the resource
      let currentCount = 0;
      switch (resource) {
        case 'users':
          currentCount = await User.countDocuments({
            company: req.tenantId,
            accountStatus: 'active'
          });
          break;
        case 'products':
          // Import Product model dynamically to avoid circular dependency
          const Product = (await import('../models/Product')).default;
          currentCount = await Product.countDocuments({ tenantId: req.tenantId });
          break;
        case 'orders':
          // Import Order model dynamically to avoid circular dependency
          const Order = (await import('../models/Order')).default;
          currentCount = await Order.countDocuments({ tenantId: req.tenantId });
          break;
      }

      if (currentCount >= limit) {
        logger.warn('Tenant resource limit exceeded', {
          tenantId: req.tenantId,
          resource,
          currentCount,
          limit,
          subscriptionTier: req.tenantContext.subscriptionTier
        });

        res.status(429).json({
          success: false,
          error: {
            code: 'RESOURCE_LIMIT_EXCEEDED',
            message: `${resource} limit exceeded. Current: ${currentCount}, Limit: ${limit}`,
            resource,
            currentCount,
            limit,
            subscriptionTier: req.tenantContext.subscriptionTier,
            upgradeUrl: '/api/billing/upgrade'
          }
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error checking tenant limits:', error);
      next(error);
    }
  };
};

/**
 * Middleware to validate tenant domain for specific operations
 */
export const validateTenantDomain = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context required');
    }

    const requestDomain = req.headers.host?.split(':')[0] || '';
    const tenantDomain = req.tenantContext.domain;

    // Skip validation for localhost and IP addresses
    if (requestDomain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(requestDomain)) {
      return next();
    }

    if (tenantDomain && requestDomain !== tenantDomain) {
      logger.warn('Domain mismatch detected', {
        tenantId: req.tenantId,
        requestDomain,
        tenantDomain
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'DOMAIN_MISMATCH',
          message: 'Request domain does not match tenant domain',
          requestDomain,
          expectedDomain: tenantDomain
        }
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Error validating tenant domain:', error);
    next(error);
  }
};

/**
 * Available tenant features
 */
export const tenantFeatures = {
  // Core features
  BASIC_CATALOG: 'basic_catalog',
  ADVANCED_SEARCH: 'advanced_search',
  BULK_OPERATIONS: 'bulk_operations',

  // Commerce features
  RFQ_MANAGEMENT: 'rfq_management',
  ORDER_AUTOMATION: 'order_automation',
  PRICE_OPTIMIZATION: 'price_optimization',

  // Compliance features
  COMPLIANCE_TRACKING: 'compliance_tracking',
  AUDIT_TRAILS: 'audit_trails',
  CERTIFICATE_MANAGEMENT: 'certificate_management',

  // Analytics features
  BASIC_ANALYTICS: 'basic_analytics',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  CUSTOM_REPORTS: 'custom_reports',

  // Integration features
  API_ACCESS: 'api_access',
  WEBHOOK_SUPPORT: 'webhook_support',
  ERP_INTEGRATION: 'erp_integration',

  // AI features
  AI_RECOMMENDATIONS: 'ai_recommendations',
  PREDICTIVE_ANALYTICS: 'predictive_analytics',
  DOCUMENT_PROCESSING: 'document_processing',

  // Support features
  PRIORITY_SUPPORT: 'priority_support',
  DEDICATED_MANAGER: 'dedicated_manager',
  CUSTOM_TRAINING: 'custom_training'
};

/**
 * Subscription tier feature mapping
 */
export const subscriptionFeatures = {
  basic: [
    tenantFeatures.BASIC_CATALOG,
    tenantFeatures.BASIC_ANALYTICS,
    tenantFeatures.COMPLIANCE_TRACKING
  ],
  standard: [
    tenantFeatures.BASIC_CATALOG,
    tenantFeatures.ADVANCED_SEARCH,
    tenantFeatures.RFQ_MANAGEMENT,
    tenantFeatures.BASIC_ANALYTICS,
    tenantFeatures.COMPLIANCE_TRACKING,
    tenantFeatures.AUDIT_TRAILS,
    tenantFeatures.API_ACCESS
  ],
  premium: [
    tenantFeatures.BASIC_CATALOG,
    tenantFeatures.ADVANCED_SEARCH,
    tenantFeatures.BULK_OPERATIONS,
    tenantFeatures.RFQ_MANAGEMENT,
    tenantFeatures.ORDER_AUTOMATION,
    tenantFeatures.PRICE_OPTIMIZATION,
    tenantFeatures.BASIC_ANALYTICS,
    tenantFeatures.ADVANCED_ANALYTICS,
    tenantFeatures.COMPLIANCE_TRACKING,
    tenantFeatures.AUDIT_TRAILS,
    tenantFeatures.CERTIFICATE_MANAGEMENT,
    tenantFeatures.API_ACCESS,
    tenantFeatures.WEBHOOK_SUPPORT,
    tenantFeatures.AI_RECOMMENDATIONS,
    tenantFeatures.PRIORITY_SUPPORT
  ],
  enterprise: [
    // Enterprise includes all features
    ...Object.values(tenantFeatures)
  ]
};

/**
 * Helper function to get features for a subscription tier
 */
export const getFeaturesForTier = (tier: keyof typeof subscriptionFeatures): string[] => {
  return subscriptionFeatures[tier] || subscriptionFeatures.basic;
};

/**
 * Helper function to check if a tier has a specific feature
 */
export const tierHasFeature = (tier: keyof typeof subscriptionFeatures, feature: string): boolean => {
  return subscriptionFeatures[tier]?.includes(feature) || false;
};
