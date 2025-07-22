/**
 * Role-Based Access Control (RBAC) Middleware
 * Provides authorization based on user roles and permissions
 */

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../core/errors';

// Extend Express Request type
interface RBACRequest extends Request {
  user?: any;
  userRoles?: string[];
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface RoleConfig {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

// Default role configurations
export const defaultRoles: Record<string, RoleConfig> = {
  admin: {
    name: 'admin',
    permissions: [
      { resource: '*', action: '*' } // Admin has all permissions
    ]
  },
  seller: {
    name: 'seller',
    permissions: [
      { resource: 'products', action: 'read' },
      { resource: 'products', action: 'create', conditions: { ownedBy: 'self' } },
      { resource: 'products', action: 'update', conditions: { ownedBy: 'self' } },
      { resource: 'products', action: 'delete', conditions: { ownedBy: 'self' } },
      { resource: 'orders', action: 'read', conditions: { sellerId: 'self' } },
      { resource: 'orders', action: 'update', conditions: { sellerId: 'self' } },
      { resource: 'rfqs', action: 'read' },
      { resource: 'rfqs', action: 'respond', conditions: { sellerId: 'self' } },
      { resource: 'analytics', action: 'read', conditions: { ownedBy: 'self' } }
    ]
  },
  buyer: {
    name: 'buyer',
    permissions: [
      { resource: 'products', action: 'read' },
      { resource: 'orders', action: 'read', conditions: { buyerId: 'self' } },
      { resource: 'orders', action: 'create' },
      { resource: 'orders', action: 'update', conditions: { buyerId: 'self' } },
      { resource: 'rfqs', action: 'read', conditions: { buyerId: 'self' } },
      { resource: 'rfqs', action: 'create' },
      { resource: 'rfqs', action: 'update', conditions: { buyerId: 'self' } },
      { resource: 'analytics', action: 'read', conditions: { ownedBy: 'self' } }
    ]
  },
  contractor: {
    name: 'contractor',
    permissions: [
      { resource: 'products', action: 'read' },
      { resource: 'orders', action: 'read', conditions: { contractorId: 'self' } },
      { resource: 'orders', action: 'update', conditions: { contractorId: 'self' } },
      { resource: 'logistics', action: 'read' },
      { resource: 'logistics', action: 'create' },
      { resource: 'logistics', action: 'update', conditions: { contractorId: 'self' } }
    ]
  },
  agent: {
    name: 'agent',
    permissions: [
      { resource: 'products', action: 'read' },
      { resource: 'orders', action: 'read' },
      { resource: 'rfqs', action: 'read' },
      { resource: 'support', action: 'read' },
      { resource: 'support', action: 'create' },
      { resource: 'support', action: 'update' }
    ]
  },
  guest: {
    name: 'guest',
    permissions: [
      { resource: 'products', action: 'read' },
      { resource: 'public', action: 'read' }
    ]
  }
};

/**
 * Check if a user has permission to access a resource
 */
export const hasPermission = (
  userRoles: string[],
  resource: string,
  action: string,
  context?: Record<string, any>
): boolean => {
  for (const roleName of userRoles) {
    const role = defaultRoles[roleName];
    if (!role) continue;

    for (const permission of role.permissions) {
      // Check if permission matches
      if (
        (permission.resource === '*' || permission.resource === resource) &&
        (permission.action === '*' || permission.action === action)
      ) {
        // Check conditions if they exist
        if (permission.conditions && context) {
          const conditionsMet = Object.entries(permission.conditions).every(([key, value]) => {
            if (value === 'self') {
              return context.userId && (context[key] === context.userId || context[`${key}Id`] === context.userId);
            }
            return context[key] === value;
          });

          if (!conditionsMet) continue;
        }

        return true;
      }
    }
  }

  return false;
};

/**
 * Middleware to check if user has required permission
 */
export const requirePermission = (resource: string, action: string) => {
  return (req: RBACRequest, res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.userId) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Get user roles (should be set by auth middleware)
    const userRoles = req.userRoles || ['guest'];

    // Create context for permission checking
    const context = {
      userId: req.userId,
      tenantId: req.tenantId,
      ...req.params,
      ...req.query
    };

    // Check permission
    if (!hasPermission(userRoles, resource, action, context)) {
      return next(new ForbiddenError(`Insufficient permissions for ${action} on ${resource}`));
    }

    next();
  };
};

/**
 * Middleware to check if user has any of the required roles
 */
export const requireRole = (...roles: string[]) => {
  return (req: RBACRequest, res: Response, next: NextFunction) => {
    // Check if user is authenticated
    if (!req.userId) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Get user roles
    const userRoles = req.userRoles || [];

    // Check if user has any of the required roles
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return next(new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`));
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user is seller
 */
export const requireSeller = requireRole('seller');

/**
 * Middleware to check if user is buyer
 */
export const requireBuyer = requireRole('buyer');

/**
 * Middleware to check if user is contractor
 */
export const requireContractor = requireRole('contractor');

/**
 * Middleware to check if user is agent
 */
export const requireAgent = requireRole('agent');

/**
 * Middleware to check if user owns the resource (for self-service endpoints)
 */
export const requireOwnership = (resourceIdParam: string = 'id', resourceUserField: string = 'userId') => {
  return (req: RBACRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const resourceId = req.params[resourceIdParam];
    const resourceUserId = req.body[resourceUserField] || req.query[resourceUserField];

    // Admins can access everything
    if (req.userRoles?.includes('admin')) {
      return next();
    }

    // Check ownership
    if (resourceUserId && resourceUserId !== req.userId) {
      return next(new ForbiddenError('Access denied. You can only access your own resources.'));
    }

    next();
  };
};

/**
 * Middleware to check tenant isolation
 */
export const requireTenant = (req: RBACRequest, res: Response, next: NextFunction) => {
  if (!req.tenantId) {
    return next(new UnauthorizedError('Tenant context required'));
  }

  // Add tenant filter to query if not already present
  if (req.method === 'GET' && !req.query.tenantId) {
    req.query.tenantId = req.tenantId;
  }

  // Add tenant to body for POST/PUT operations
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body.tenantId) {
    req.body.tenantId = req.tenantId;
  }

  next();
};

// Export default as requirePermission for backwards compatibility
export default requirePermission;