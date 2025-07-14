// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\middleware\auth.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Express Request interface to include user
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    email: string;
    role: 'buyer' | 'supplier' | 'admin';
    company: {
      _id: string;
      name: string;
      country?: string;
      verificationLevel?: 'bronze' | 'silver' | 'gold';
      rating?: number;
      totalReviews?: number;
      establishedYear?: number;
      certifications?: string[];
      specialties?: string[];
    };
    permissions?: string[];
    isActive: boolean;
    lastLogin?: Date;
    iat?: number;
    exp?: number;
  };
}

interface JWTPayload {
  _id: string;
  email: string;
  role: string;
  company: any;
  permissions?: string[];
  isActive: boolean;
  lastLogin?: Date;
  iat?: number;
  exp?: number;
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user information to request object
 */
const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Check if token exists
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        errors: ['Authentication token is required']
      });
      return;
    }

    // Verify token
    const secretKey = process.env.JWT_SECRET || 'your-fallback-secret-key';
    
    try {
      const decoded = jwt.verify(token, secretKey) as JWTPayload;
      
      // Check if user is active
      if (!decoded.isActive) {
        res.status(401).json({
          success: false,
          message: 'Account is inactive',
          errors: ['Your account has been deactivated. Please contact support.']
        });
        return;
      }

      // Check token expiration (additional check)
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        res.status(401).json({
          success: false,
          message: 'Token expired',
          errors: ['Your session has expired. Please login again.']
        });
        return;
      }

      // Attach user to request object
      req.user = {
        _id: decoded._id,
        email: decoded.email,
        role: decoded.role as 'buyer' | 'supplier' | 'admin',
        company: decoded.company,
        permissions: decoded.permissions || [],
        isActive: decoded.isActive,
        lastLogin: decoded.lastLogin,
        iat: decoded.iat,
        exp: decoded.exp
      };

      // Log successful authentication (optional, for debugging)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔐 Authenticated user: ${decoded.email} (${decoded.role})`);
      }

      next();

    } catch (jwtError) {
      // Handle specific JWT errors
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: 'Token expired',
          errors: ['Your session has expired. Please login again.']
        });
        return;
      }

      if (jwtError instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          message: 'Invalid token',
          errors: ['Authentication token is invalid.']
        });
        return;
      }

      if (jwtError instanceof jwt.NotBeforeError) {
        res.status(401).json({
          success: false,
          message: 'Token not active',
          errors: ['Authentication token is not yet active.']
        });
        return;
      }

      // Generic JWT error
      throw jwtError;
    }

  } catch (error) {
    console.error('Authentication middleware error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      errors: ['An error occurred during authentication. Please try again.']
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require authentication
 */
export const optionalAuthMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    // No token provided, continue without authentication
    next();
    return;
  }

  try {
    const secretKey = process.env.JWT_SECRET || 'your-fallback-secret-key';
    const decoded = jwt.verify(token, secretKey) as JWTPayload;
    
    if (decoded.isActive) {
      req.user = {
        _id: decoded._id,
        email: decoded.email,
        role: decoded.role as 'buyer' | 'supplier' | 'admin',
        company: decoded.company,
        permissions: decoded.permissions || [],
        isActive: decoded.isActive,
        lastLogin: decoded.lastLogin,
        iat: decoded.iat,
        exp: decoded.exp
      };
    }
  } catch (error) {
    // Invalid token, but continue without authentication
    console.log('Optional auth failed, continuing without user:', error instanceof Error ? error.message : 'Unknown error');
  }

  next();
};

/**
 * Generate JWT token for user
 */
export const generateToken = (user: {
  _id: string;
  email: string;
  role: string;
  company: any;
  permissions?: string[];
  isActive: boolean;
  lastLogin?: Date;
}): string => {
  const payload: JWTPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
    company: user.company,
    permissions: user.permissions,
    isActive: user.isActive,
    lastLogin: user.lastLogin
  };

  const secretKey = process.env.JWT_SECRET || 'your-fallback-secret-key';
  const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

  return jwt.sign(payload, secretKey, { 
    expiresIn,
    issuer: 'foodxchange-api',
    audience: 'foodxchange-client'
  });
};

/**
 * Verify token without middleware (utility function)
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const secretKey = process.env.JWT_SECRET || 'your-fallback-secret-key';
    return jwt.verify(token, secretKey) as JWTPayload;
  } catch (error) {
    return null;
  }
};

/**
 * Extract user ID from token (utility function)
 */
export const getUserIdFromToken = (token: string): string | null => {
  const payload = verifyToken(token);
  return payload?._id || null;
};

// Export the main middleware as default
export default authMiddleware;

// Export types for use in other files
export type { AuthenticatedRequest, JWTPayload };