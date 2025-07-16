import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import compression from 'compression';
import { body, validationResult, param, query } from 'express-validator';
import { productionLogger } from '../utils/productionLogger';
import { config } from '../config';
import * as crypto from 'crypto';

// Request ID middleware
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = crypto.randomBytes(16).toString('hex');
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Set request ID in logger
  productionLogger.setRequestId(requestId);
  
  next();
};

// Enhanced rate limiting with different tiers
export const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/metrics';
    },
    handler: (req, res) => {
      productionLogger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      
      res.status(429).json({
        success: false,
        error: {
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000)
        }
      });
    }
  });
};

// Progressive rate limiting
export const rateLimiters = {
  // General API rate limiting
  general: createRateLimit(15 * 60 * 1000, 100, 'Too many requests from this IP'),
  
  // Authentication endpoints (stricter)
  auth: createRateLimit(15 * 60 * 1000, 10, 'Too many authentication attempts'),
  
  // Search endpoints (moderate)
  search: createRateLimit(60 * 1000, 30, 'Too many search requests'),
  
  // File upload endpoints (very strict)
  upload: createRateLimit(60 * 60 * 1000, 10, 'Too many file uploads'),
  
  // Password reset (extremely strict)
  passwordReset: createRateLimit(60 * 60 * 1000, 3, 'Too many password reset attempts')
};

// Speed limiting to slow down requests
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes, then...
  delayMs: 500, // begin adding 500ms of delay per request above 50
  maxDelayMs: 5000, // maximum delay of 5 seconds
  skip: (req) => req.path === '/health' || req.path === '/metrics'
});

// Enhanced helmet configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input sanitization and validation
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      // Remove potential XSS patterns
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  
  next();
};

// Advanced input validation
export const validateInput = (validations: any[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }));
      
      productionLogger.warn('Input validation failed', {
        path: req.path,
        method: req.method,
        errors: errorDetails,
        body: req.body
      });
      
      return res.status(400).json({
        success: false,
        error: {
          message: 'Input validation failed',
          code: 'VALIDATION_ERROR',
          details: errorDetails
        }
      });
    }
    
    next();
  };
};

// Common validation rules
export const validationRules = {
  // User registration
  userRegistration: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').isLength({ min: 1, max: 50 }).trim().withMessage('First name required'),
    body('lastName').isLength({ min: 1, max: 50 }).trim().withMessage('Last name required')
  ],
  
  // Expert profile
  expertProfile: [
    body('specializations').isArray().withMessage('Specializations must be an array'),
    body('hourlyRate').isFloat({ min: 0, max: 10000 }).withMessage('Invalid hourly rate'),
    body('bio').isLength({ max: 1000 }).withMessage('Bio too long')
  ],
  
  // Search queries
  searchQuery: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().isLength({ max: 50 }).withMessage('Category too long')
  ],
  
  // ID parameters
  mongoId: [
    param('id').isMongoId().withMessage('Invalid ID format')
  ]
};

// Request size limiting
export const requestSizeLimit = (maxSize: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('content-length');
    if (contentLength && parseInt(contentLength) > parseSize(maxSize)) {
      productionLogger.warn('Request size limit exceeded', {
        contentLength,
        maxSize,
        path: req.path,
        method: req.method
      });
      
      return res.status(413).json({
        success: false,
        error: {
          message: 'Request entity too large',
          code: 'REQUEST_TOO_LARGE',
          maxSize
        }
      });
    }
    next();
  };
};

// Parse size string to bytes
const parseSize = (size: string): number => {
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/);
  if (!match) return 0;
  return parseFloat(match[1]) * units[match[2] as keyof typeof units];
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.env === 'production' 
      ? [config.services.frontendUrl, config.services.mainBackendUrl]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3002'
        ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      productionLogger.warn('CORS origin rejected', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Compression middleware
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 1024,
  level: 6
});

// Security audit logging
export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log security-relevant events
  const securityEvents = [
    'POST /api/v1/auth/login',
    'POST /api/v1/auth/register',
    'POST /api/v1/auth/logout',
    'POST /api/v1/auth/forgot-password',
    'POST /api/v1/auth/reset-password',
    'PUT /api/v1/experts/profile',
    'DELETE /api/v1/experts/profile'
  ];
  
  const routeKey = `${req.method} ${req.path}`;
  
  if (securityEvents.includes(routeKey)) {
    productionLogger.audit('Security event', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log response details
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      productionLogger.warn('HTTP error response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
    
    // Log slow requests
    if (duration > 5000) {
      productionLogger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        duration,
        statusCode: res.statusCode
      });
    }
  });
  
  next();
};

// IP whitelist/blacklist
export const ipFilter = (req: Request, res: Response, next: NextFunction): void => {
  const clientIp = req.ip;
  
  // In production, implement proper IP filtering
  const blacklist = ['192.168.1.100']; // Example blacklisted IP
  
  if (blacklist.includes(clientIp)) {
    productionLogger.warn('Blocked request from blacklisted IP', {
      ip: clientIp,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      success: false,
      error: {
        message: 'Access denied',
        code: 'IP_BLOCKED'
      }
    });
  }
  
  next();
};

// Export all middleware for easy import
export const productionSecurityMiddleware = {
  requestId,
  rateLimiters,
  speedLimiter,
  securityHeaders,
  sanitizeInput,
  validateInput,
  validationRules,
  requestSizeLimit,
  corsOptions,
  compressionMiddleware,
  auditLogger,
  ipFilter
};