// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\middleware\roleMiddleware.ts

import { Request, Response, NextFunction } from 'express';

// User roles enum for type safety
export enum UserRole {
  BUYER = 'buyer',
  SUPPLIER = 'supplier',
  ADMIN = 'admin'
}

// Permissions enum for granular access control
export enum Permission {
  // Product permissions
  CREATE_PRODUCT = 'create_product',
  UPDATE_PRODUCT = 'update_product',
  DELETE_PRODUCT = 'delete_product',
  VIEW_PRODUCT = 'view_product',

  // Sample request permissions
  CREATE_SAMPLE_REQUEST = 'create_sample_request',
  UPDATE_SAMPLE_REQUEST = 'update_sample_request',
  VIEW_SAMPLE_REQUEST = 'view_sample_request',
  APPROVE_SAMPLE_REQUEST = 'approve_sample_request',

  // Order permissions
  CREATE_ORDER = 'create_order',
  UPDATE_ORDER = 'update_order',
  VIEW_ORDER = 'view_order',
  CANCEL_ORDER = 'cancel_order',

  // RFQ permissions
  CREATE_RFQ = 'create_rfq',
  RESPOND_TO_RFQ = 'respond_to_rfq',
  VIEW_RFQ = 'view_rfq',

  // Analytics permissions
  VIEW_ANALYTICS = 'view_analytics',
  VIEW_ADVANCED_ANALYTICS = 'view_advanced_analytics',

  // Admin permissions
  MANAGE_USERS = 'manage_users',
  MANAGE_COMPANIES = 'manage_companies',
  SYSTEM_SETTINGS = 'system_settings',

  // Compliance permissions
  MANAGE_COMPLIANCE = 'manage_compliance',
  VIEW_COMPLIANCE = 'view_compliance'
}

// Extended request interface
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    email: string;
    role: UserRole | string;
    company: {
      _id: string;
      name: string;
      [key: string]: any;
    };
    permissions?: string[];
    isActive: boolean;
    [key: string]: any;
  };
}

// Role hierarchy and default permissions
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  [UserRole.BUYER]: [
    Permission.VIEW_PRODUCT,
    Permission.CREATE_SAMPLE_REQUEST,
    Permission.VIEW_SAMPLE_REQUEST,
    Permission.CREATE_ORDER,
    Permission.UPDATE_ORDER,
    Permission.VIEW_ORDER,
    Permission.CANCEL_ORDER,
    Permission.CREATE_RFQ,
    Permission.VIEW_RFQ,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_COMPLIANCE
  ],

  [UserRole.SUPPLIER]: [
    Permission.CREATE_PRODUCT,
    Permission.UPDATE_PRODUCT,
    Permission.DELETE_PRODUCT,
    Permission.VIEW_PRODUCT,
    Permission.UPDATE_SAMPLE_REQUEST,
    Permission.VIEW_SAMPLE_REQUEST,
    Permission.APPROVE_SAMPLE_REQUEST,
    Permission.RESPOND_TO_RFQ,
    Permission.VIEW_RFQ,
    Permission.VIEW_ORDER,
    Permission.UPDATE_ORDER,
    Permission.VIEW_ANALYTICS,
    Permission.VIEW_COMPLIANCE,
    Permission.MANAGE_COMPLIANCE
  ],

  [UserRole.ADMIN]: Object.values(Permission) // Admin has all permissions
};

/**
 * Role-based access control middleware
 * @param allowedRoles - Array of roles that are allowed to access the route
 * @returns Express middleware function
 */
const roleMiddleware = (allowedRoles: (UserRole | string)[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.',
          errors: ['Please login to access this resource']
        });
        return;
      }

      // Check if user is active
      if (!req.user.isActive) {
        res.status(403).json({
          success: false,
          message: 'Access denied. Account is inactive.',
          errors: ['Your account has been deactivated. Please contact support.']
        });
        return;
      }

      // Check if user's role is in the allowed roles
      const userRole = req.user.role;
      if (!allowedRoles.includes(userRole)) {
        res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
          errors: [`This action requires one of the following roles: ${allowedRoles.join(', ')}`]
        });
        return;
      }

      // Log access for audit (optional, for debugging)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔑 Role check passed: ${req.user.email} (${userRole}) accessing ${req.method} ${req.path}`);
      }

      next();

    } catch (error) {
      console.error('Role middleware error:', error);

      res.status(500).json({
        success: false,
        message: 'Authorization error',
        errors: ['An error occurred during authorization. Please try again.']
      });
    }
  };
};

/**
 * Permission-based access control middleware
 * @param requiredPermissions - Array of permissions required to access the route
 * @param requireAll - If true, user must have ALL permissions. If false, user needs ANY permission.
 * @returns Express middleware function
 */
export const permissionMiddleware = (
  requiredPermissions: (Permission | string)[],
  requireAll: boolean = false
) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.',
          errors: ['Please login to access this resource']
        });
        return;
      }

      // Get user permissions (from JWT or role-based defaults)
      const userPermissions = req.user.permissions || ROLE_PERMISSIONS[req.user.role] || [];

      // Convert to strings for comparison
      const userPermsStrings = userPermissions.map(p => p.toString());
      const requiredPermsStrings = requiredPermissions.map(p => p.toString());

      // Check permissions
      let hasAccess: boolean;

      if (requireAll) {
        // User must have ALL required permissions
        hasAccess = requiredPermsStrings.every(perm => userPermsStrings.includes(perm));
      } else {
        // User must have ANY of the required permissions
        hasAccess = requiredPermsStrings.some(perm => userPermsStrings.includes(perm));
      }

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient permissions.',
          errors: [
            requireAll
              ? `This action requires all of the following permissions: ${requiredPermsStrings.join(', ')}`
              : `This action requires one of the following permissions: ${requiredPermsStrings.join(', ')}`
          ]
        });
        return;
      }

      next();

    } catch (error) {
      console.error('Permission middleware error:', error);

      res.status(500).json({
        success: false,
        message: 'Authorization error',
        errors: ['An error occurred during permission check. Please try again.']
      });
    }
  };
};

/**
 * Company ownership middleware
 * Ensures user can only access resources belonging to their company
 * @param resourceCompanyPath - Path to company ID in request object (e.g., 'body.companyId', 'params.companyId')
 * @returns Express middleware function
 */
export const companyOwnershipMiddleware = (resourceCompanyPath: string = 'body.companyId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
        return;
      }

      // Skip check for admin users
      if (req.user.role === UserRole.ADMIN) {
        next();
        return;
      }

      // Get resource company ID from request
      const pathParts = resourceCompanyPath.split('.');
      let resourceCompanyId: string = req as any;

      for (const part of pathParts) {
        resourceCompanyId = resourceCompanyId[part];
        if (!resourceCompanyId) break;
      }

      if (!resourceCompanyId) {
        res.status(400).json({
          success: false,
          message: 'Company ID not found in request',
          errors: ['Resource must include company information']
        });
        return;
      }

      // Check if user's company matches resource company
      if (req.user.company._id.toString() !== resourceCompanyId.toString()) {
        res.status(403).json({
          success: false,
          message: 'Access denied. You can only access resources belonging to your company.',
          errors: ['Unauthorized access to company resources']
        });
        return;
      }

      next();

    } catch (error) {
      console.error('Company ownership middleware error:', error);

      res.status(500).json({
        success: false,
        message: 'Authorization error',
        errors: ['An error occurred during company ownership check.']
      });
    }
  };
};

/**
 * Multi-role middleware with complex logic
 * @param roleConfig - Configuration object for complex role-based access
 * @returns Express middleware function
 */
export const complexRoleMiddleware = (roleConfig: {
  allowedRoles?: (UserRole | string)[];
  requiredPermissions?: (Permission | string)[];
  requireAllPermissions?: boolean;
  checkCompanyOwnership?: boolean;
  companyPath?: string;
  customCheck?: (user: any, req: Request) => boolean;
}) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
        return;
      }

      // Check roles if specified
      if (roleConfig.allowedRoles && !roleConfig.allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          success: false,
          message: 'Access denied. Insufficient role permissions.'
        });
        return;
      }

      // Check permissions if specified
      if (roleConfig.requiredPermissions) {
        const userPermissions = req.user.permissions || ROLE_PERMISSIONS[req.user.role] || [];
        const userPermsStrings = userPermissions.map(p => p.toString());
        const requiredPermsStrings = roleConfig.requiredPermissions.map(p => p.toString());

        const hasPermissions = roleConfig.requireAllPermissions
          ? requiredPermsStrings.every(perm => userPermsStrings.includes(perm))
          : requiredPermsStrings.some(perm => userPermsStrings.includes(perm));

        if (!hasPermissions) {
          res.status(403).json({
            success: false,
            message: 'Access denied. Insufficient permissions.'
          });
          return;
        }
      }

      // Check company ownership if specified
      if (roleConfig.checkCompanyOwnership && req.user.role !== UserRole.ADMIN) {
        // Implementation would depend on specific use case
        // This is a placeholder for company ownership check
      }

      // Custom check if specified
      if (roleConfig.customCheck) {
        // Map the user object to match the expected structure
        const mappedUser = {
          id: req.user._id.toString(),
          email: req.user.email,
          role: req.user.role,
          company: req.user.company?._id?.toString()
        };
        if (!roleConfig.customCheck(mappedUser, req as Request)) {
          res.status(403).json({
            success: false,
            message: 'Access denied. Custom authorization check failed.'
          });
          return;
        }
      }

      next();

    } catch (error) {
      console.error('Complex role middleware error:', error);

      res.status(500).json({
        success: false,
        message: 'Authorization error'
      });
    }
  };
};

/**
 * Utility function to check if user has specific permission
 * @param user - User object
 * @param permission - Permission to check
 * @returns boolean
 */
export const hasPermission = (user: any, permission: Permission | string): boolean => {
  if (!user) return false;

  const userPermissions = user.permissions || ROLE_PERMISSIONS[user.role] || [];
  return userPermissions.includes(permission.toString());
};

/**
 * Utility function to check if user has any of the specified permissions
 * @param user - User object
 * @param permissions - Array of permissions to check
 * @returns boolean
 */
export const hasAnyPermission = (user: any, permissions: (Permission | string)[]): boolean => {
  return permissions.some(permission => hasPermission(user, permission));
};

/**
 * Utility function to check if user has all of the specified permissions
 * @param user - User object
 * @param permissions - Array of permissions to check
 * @returns boolean
 */
export const hasAllPermissions = (user: any, permissions: (Permission | string)[]): boolean => {
  return permissions.every(permission => hasPermission(user, permission));
};

// Export the main middleware as default
export default roleMiddleware;

// Export all types and enums
export type { AuthenticatedRequest };
export { UserRole, Permission, ROLE_PERMISSIONS };
