import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ExpertProfile } from '../models';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { AuthenticationError, AuthorizationError, ValidationError } from '../utils/errors';
import { JWTPayload, UserRole, ExpertPermission } from '../interfaces/auth.interface';
import { CacheService } from '../services/CacheService';

const logger = new Logger('AuthMiddleware');
const cacheService = new CacheService();

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        expertId?: string;
        role: UserRole;
        permissions: ExpertPermission[];
        verificationStatus: string;
        sessionId: string;
      };
    }
  }
}

/**
 * Verify JWT token and attach user info to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    // Check if token is blacklisted
    const isBlacklisted = await cacheService.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    // Check if session is still valid
    const sessionValid = await cacheService.get(`session:${decoded.sessionId}`);
    if (!sessionValid) {
      throw new AuthenticationError('Session expired');
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      expertId: decoded.expertId,
      role: decoded.role,
      permissions: decoded.permissions,
      verificationStatus: decoded.verificationStatus,
      sessionId: decoded.sessionId,
    };

    // Update session activity
    await cacheService.set(
      `session:${decoded.sessionId}`,
      { active: true, lastActivity: new Date() },
      { ttl: 24 * 60 * 60 } // 24 hours
    );

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AuthenticationError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AuthenticationError('Token expired'));
    } else {
      next(error);
    }
  }
};

/**
 * Require specific user role
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Requires one of: ${roles.join(', ')}`));
    }

    next();
  };
};

/**
 * Require specific permissions
 */
export const requirePermissions = (...permissions: ExpertPermission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const hasAllPermissions = permissions.every(permission =>
      req.user!.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      const missing = permissions.filter(p => !req.user!.permissions.includes(p));
      return next(new AuthorizationError(`Missing permissions: ${missing.join(', ')}`));
    }

    next();
  };
};

/**
 * Require expert verification
 */
export const requireVerifiedExpert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (req.user.role !== UserRole.EXPERT) {
      return next(new AuthorizationError('Expert role required'));
    }

    if (req.user.verificationStatus !== 'verified') {
      return next(new AuthorizationError('Expert verification required'));
    }

    // Double-check verification status from database
    const expert = await ExpertProfile.findById(req.user.expertId)
      .select('verificationStatus verificationExpiryDate');

    if (!expert) {
      return next(new AuthenticationError('Expert profile not found'));
    }

    if (expert.verificationStatus !== 'verified') {
      return next(new AuthorizationError('Expert verification expired or invalid'));
    }

    // Check if verification is still valid
    if (expert.verificationExpiryDate && expert.verificationExpiryDate <= new Date()) {
      return next(new AuthorizationError('Expert verification has expired'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user owns the resource
 */
export const requireResourceOwnership = (resourceIdParam: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AuthenticationError('Authentication required'));
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return next(new ValidationError('Resource ID required'));
      }

      // For expert resources, check expert ownership
      if (req.user.role === UserRole.EXPERT && req.user.expertId) {
        if (resourceId !== req.user.expertId) {
          return next(new AuthorizationError('Access denied: not resource owner'));
        }
      }
      // For client resources, check user ownership
      else if (req.user.role === UserRole.CLIENT) {
        if (resourceId !== req.user.userId) {
          return next(new AuthorizationError('Access denied: not resource owner'));
        }
      }
      // Admins can access any resource
      else if (req.user.role === UserRole.ADMIN) {
        // Allow access
      } else {
        return next(new AuthorizationError('Access denied'));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Rate limiting for sensitive operations
 */
export const rateLimitSensitive = (
  maxAttempts: number = 5,
  windowMinutes: number = 15
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `rate_limit:${req.ip}:${req.route?.path || req.path}`;
      const current = await cacheService.get<number>(key) || 0;

      if (current >= maxAttempts) {
        return next(new AuthorizationError('Too many attempts. Please try again later.'));
      }

      await cacheService.set(key, current + 1, { ttl: windowMinutes * 60 });
      next();
    } catch (error) {
      // If cache fails, allow the request but log the error
      logger.error('Rate limiting error:', error);
      next();
    }
  };
};

/**
 * Optional authentication - attach user if token is valid
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // No token, continue without auth
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;

    // Check if session is still valid
    const sessionValid = await cacheService.get(`session:${decoded.sessionId}`);
    if (!sessionValid) {
      return next(); // Invalid session, continue without auth
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      expertId: decoded.expertId,
      role: decoded.role,
      permissions: decoded.permissions,
      verificationStatus: decoded.verificationStatus,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    // If token verification fails, continue without auth
    next();
  }
};

/**
 * Check two-factor authentication
 */
export const requireTwoFactor = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    // Check if 2FA verification is cached for this session
    const twoFactorVerified = await cacheService.get(
      `2fa_verified:${req.user.sessionId}`
    );

    if (!twoFactorVerified) {
      return next(new AuthorizationError('Two-factor authentication required'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Device trust verification
 */
export const requireTrustedDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      return next(new AuthorizationError('Device identification required'));
    }

    // Check if device is trusted
    const trustedDevice = await cacheService.get(
      `trusted_device:${req.user.userId}:${deviceId}`
    );

    if (!trustedDevice) {
      return next(new AuthorizationError('Device not trusted'));
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if expert profile is complete
 */
export const requireCompleteProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !req.user.expertId) {
      return next(new AuthenticationError('Expert authentication required'));
    }

    const expert = await ExpertProfile.findById(req.user.expertId)
      .select('bio headline expertise hourlyRate availability');

    if (!expert) {
      return next(new AuthenticationError('Expert profile not found'));
    }

    // Check if profile is complete
    const isComplete = expert.bio && 
                      expert.headline && 
                      expert.expertise.length > 0 && 
                      expert.hourlyRate.min > 0 &&
                      expert.availability.length > 0;

    if (!isComplete) {
      return next(new AuthorizationError('Complete expert profile required'));
    }

    next();
  } catch (error) {
    next(error);
  }
};