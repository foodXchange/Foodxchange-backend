import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';

interface AuthenticatedRequest extends Request {
  user?: any;
  userId?: string;
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
    }
  }
}

export const protect = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Verify token
      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        console.error('JWT_SECRET is not defined');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // Get user from the token
      const user = await User.findById(decoded.userId).select('-password -refreshToken');

      if (!user) {
        console.warn('Authentication failed: User not found', {
          userId: decoded.userId
        });
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if account is active
      if (user.accountStatus !== 'active') {
        console.warn('Authentication failed: Account not active', {
          userId: user._id.toString(),
          accountStatus: user.accountStatus
        });
        return res.status(401).json({ error: 'Account is not active' });
      }

      // Check if account is locked (if method exists)
      if (user.isAccountLocked && user.isAccountLocked()) {
        console.warn('Authentication failed: Account locked', {
          userId: user._id.toString()
        });
        return res.status(401).json({ error: 'Account is locked' });
      }

      req.user = user;
      req.userId = user._id.toString();
      next();
    } else {
      return res.status(401).json({ error: 'Not authorized, no token' });
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    } else if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    } else {
      return res.status(401).json({ error: 'Not authorized' });
    }
  }
};

// Admin middleware
export const admin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Not authorized as an admin' });
  }
};

// Authorize specific roles
export const authorize = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authorized, no user' });
    }

    if (!roles.includes(req.user.role)) {
      console.warn('Authorization failed: Insufficient role', {
        userId: req.user._id.toString(),
        userRole: req.user.role,
        requiredRoles: roles
      });
      return res.status(403).json({ 
        error: `User role ${req.user.role} is not authorized to access this route` 
      });
    }

    next();
  };
};

// Optional authentication middleware (for routes that work with or without auth)
export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const JWT_SECRET = process.env.JWT_SECRET;
      if (JWT_SECRET) {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const user = await User.findById(decoded.userId).select('-password -refreshToken');
        
        if (user && user.accountStatus === 'active' && (!user.isAccountLocked || !user.isAccountLocked())) {
          req.user = user;
          req.userId = user._id.toString();
        }
      }
    } catch (error) {
      // Silently fail for optional auth
      console.debug('Optional auth failed:', error);
    }
  }

  next();
};

// Email verification required middleware
export const requireEmailVerification = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authorized, no user' });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({ error: 'Email verification required' });
  }

  next();
};

// Company verification required middleware
export const requireCompanyVerification = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authorized, no user' });
  }

  if (!req.user.companyVerified) {
    return res.status(403).json({ error: 'Company verification required' });
  }

  next();
};

// Alias for protect middleware
export const requireAuth = protect;
