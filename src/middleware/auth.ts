import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AuthenticationError, AuthorizationError } from '../core/errors';
import { Logger } from '../core/logging/logger';

const logger = new Logger('AuthMiddleware');

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;

      // Get user from the token
      const user = await User.findById(decoded.userId).select('-password -refreshToken');

      if (!user) {
        logger.warn('Authentication failed: User not found', {
          userId: decoded.userId,
          token: token.substring(0, 10) + '...'
        });
        throw new AuthenticationError('User not found');
      }

      // Check if account is active
      if (user.accountStatus !== 'active') {
        logger.warn('Authentication failed: Account not active', {
          userId: user._id.toString(),
          accountStatus: user.accountStatus
        });
        throw new AuthenticationError('Account is not active');
      }

      // Check if account is locked
      if (user.isAccountLocked()) {
        logger.warn('Authentication failed: Account locked', {
          userId: user._id.toString()
        });
        throw new AuthenticationError('Account is locked');
      }

      req.user = user;
      req.userId = user._id.toString();
      next();
    } catch (error: any) {
      logger.error('Authentication error:', error);
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      } else {
        throw new AuthenticationError('Not authorized');
      }
    }
  } else {
    throw new AuthenticationError('Not authorized, no token');
  }
};

// Admin middleware
export const admin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    throw new AuthorizationError('Not authorized as an admin');
  }
};

// Authorize specific roles
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('Not authorized, no user');
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Authorization failed: Insufficient role', {
        userId: req.user._id.toString(),
        userRole: req.user.role,
        requiredRoles: roles
      });
      throw new AuthorizationError(`User role ${req.user.role} is not authorized to access this route`);
    }

    next();
  };
};

// Optional authentication middleware (for routes that work with or without auth)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      const user = await User.findById(decoded.userId).select('-password -refreshToken');
      
      if (user && user.accountStatus === 'active' && !user.isAccountLocked()) {
        req.user = user;
        req.userId = user._id.toString();
      }
    } catch (error) {
      // Silently fail for optional auth
      logger.debug('Optional auth failed:', error);
    }
  }

  next();
};

// Email verification required middleware
export const requireEmailVerification = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AuthenticationError('Not authorized, no user');
  }

  if (!req.user.isEmailVerified) {
    throw new AuthorizationError('Email verification required');
  }

  next();
};

// Company verification required middleware
export const requireCompanyVerification = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AuthenticationError('Not authorized, no user');
  }

  if (!req.user.companyVerified) {
    throw new AuthorizationError('Company verification required');
  }

  next();
};
