import { Request, Response, NextFunction } from 'express';
import { twoFactorAuthService } from '../services/auth/TwoFactorAuthService';
import { AuthenticationError } from '../core/errors';
import { Logger } from '../core/logging/logger';

const logger = new Logger('TwoFactorAuthMiddleware');

// Extend Request interface to include 2FA properties
declare global {
  namespace Express {
    interface Request {
      requiresTwoFactor?: boolean;
      twoFactorPassed?: boolean;
      sensitiveOperation?: string;
    }
  }
}

/**
 * Middleware to check if user has 2FA enabled and require it for sensitive operations
 */
export const requireTwoFactor = (operation: string = 'sensitive_operation') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.userId) {
        throw new AuthenticationError('User not authenticated');
      }

      const has2FA = await twoFactorAuthService.is2FAEnabled(req.userId);
      
      if (has2FA) {
        const twoFactorToken = req.headers['x-2fa-token'] as string;
        const challengeId = req.headers['x-2fa-challenge'] as string;
        
        if (!twoFactorToken || !challengeId) {
          logger.warn('2FA token or challenge ID missing for sensitive operation', {
            userId: req.userId,
            operation,
            hasToken: !!twoFactorToken,
            hasChallengeId: !!challengeId
          });
          
          return res.status(428).json({
            success: false,
            error: {
              code: 'TWO_FACTOR_REQUIRED',
              message: 'Two-factor authentication required for this operation',
              operation
            }
          });
        }

        const isValid = await twoFactorAuthService.verifyChallengeCode(challengeId, twoFactorToken);
        
        if (!isValid) {
          logger.warn('Invalid 2FA token provided', {
            userId: req.userId,
            operation,
            challengeId
          });
          
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_TWO_FACTOR_TOKEN',
              message: 'Invalid two-factor authentication token',
              operation
            }
          });
        }

        logger.info('2FA verification successful', {
          userId: req.userId,
          operation,
          challengeId
        });
      }

      // Mark that 2FA has been passed for this request
      req.twoFactorPassed = true;
      req.sensitiveOperation = operation;
      next();
    } catch (error) {
      logger.error('Two-factor authentication middleware error:', error);
      next(error);
    }
  };
};

/**
 * Middleware to check if 2FA is required but not enforce it
 */
export const checkTwoFactorRequired = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user || !req.userId) {
      return next();
    }

    const has2FA = await twoFactorAuthService.is2FAEnabled(req.userId);
    req.requiresTwoFactor = has2FA;
    
    next();
  } catch (error) {
    logger.error('Check 2FA required middleware error:', error);
    next(error);
  }
};

/**
 * Middleware for operations that should recommend 2FA if not enabled
 */
export const recommendTwoFactor = (operation: string = 'recommended_operation') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.userId) {
        return next();
      }

      const has2FA = await twoFactorAuthService.is2FAEnabled(req.userId);
      
      if (!has2FA) {
        logger.info('2FA recommended for operation', {
          userId: req.userId,
          operation
        });
        
        // Add header to recommend 2FA setup
        res.setHeader('X-2FA-Recommendation', 'true');
        res.setHeader('X-2FA-Setup-URL', '/api/auth/2fa/setup');
      }

      next();
    } catch (error) {
      logger.error('Recommend 2FA middleware error:', error);
      next(error);
    }
  };
};

/**
 * Operations that require 2FA
 */
export const twoFactorOperations = {
  // Financial operations
  PAYMENT_PROCESSING: 'payment_processing',
  REFUND_PROCESSING: 'refund_processing',
  BANK_ACCOUNT_CHANGE: 'bank_account_change',
  
  // Account security
  PASSWORD_CHANGE: 'password_change',
  EMAIL_CHANGE: 'email_change',
  PHONE_CHANGE: 'phone_change',
  TWO_FACTOR_DISABLE: 'two_factor_disable',
  
  // Business operations
  SUPPLIER_APPROVAL: 'supplier_approval',
  COMPLIANCE_OVERRIDE: 'compliance_override',
  LARGE_ORDER_APPROVAL: 'large_order_approval',
  CONTRACT_SIGNING: 'contract_signing',
  
  // Data operations
  DATA_EXPORT: 'data_export',
  BULK_DELETE: 'bulk_delete',
  USER_IMPERSONATION: 'user_impersonation',
  
  // Administrative
  ADMIN_SETTINGS: 'admin_settings',
  USER_SUSPENSION: 'user_suspension',
  ROLE_ASSIGNMENT: 'role_assignment'
};

/**
 * Helper function to create 2FA middleware for specific operations
 */
export const require2FAFor = {
  paymentProcessing: requireTwoFactor(twoFactorOperations.PAYMENT_PROCESSING),
  refundProcessing: requireTwoFactor(twoFactorOperations.REFUND_PROCESSING),
  bankAccountChange: requireTwoFactor(twoFactorOperations.BANK_ACCOUNT_CHANGE),
  passwordChange: requireTwoFactor(twoFactorOperations.PASSWORD_CHANGE),
  emailChange: requireTwoFactor(twoFactorOperations.EMAIL_CHANGE),
  phoneChange: requireTwoFactor(twoFactorOperations.PHONE_CHANGE),
  twoFactorDisable: requireTwoFactor(twoFactorOperations.TWO_FACTOR_DISABLE),
  supplierApproval: requireTwoFactor(twoFactorOperations.SUPPLIER_APPROVAL),
  complianceOverride: requireTwoFactor(twoFactorOperations.COMPLIANCE_OVERRIDE),
  largeOrderApproval: requireTwoFactor(twoFactorOperations.LARGE_ORDER_APPROVAL),
  contractSigning: requireTwoFactor(twoFactorOperations.CONTRACT_SIGNING),
  dataExport: requireTwoFactor(twoFactorOperations.DATA_EXPORT),
  bulkDelete: requireTwoFactor(twoFactorOperations.BULK_DELETE),
  userImpersonation: requireTwoFactor(twoFactorOperations.USER_IMPERSONATION),
  adminSettings: requireTwoFactor(twoFactorOperations.ADMIN_SETTINGS),
  userSuspension: requireTwoFactor(twoFactorOperations.USER_SUSPENSION),
  roleAssignment: requireTwoFactor(twoFactorOperations.ROLE_ASSIGNMENT)
};

/**
 * Helper function to create 2FA recommendation middleware for specific operations
 */
export const recommend2FAFor = {
  orderPlacement: recommendTwoFactor('order_placement'),
  profileUpdate: recommendTwoFactor('profile_update'),
  companySettings: recommendTwoFactor('company_settings'),
  apiKeyGeneration: recommendTwoFactor('api_key_generation')
};