import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { AuthenticationError, AuthorizationError } from '../core/errors';

export const protect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;

      // Get user from the token
      req.user = await User.findById(decoded._id || decoded.id).select('-password');

      if (!req.user) {
        throw new AuthenticationError('User not found');
      }

      next();
    } catch (error) {
      throw new AuthenticationError('Not authorized');
    }
  }

  if (!token) {
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
      throw new AuthorizationError(`User role ${req.user.role} is not authorized to access this route`);
    }

    next();
  };
};
