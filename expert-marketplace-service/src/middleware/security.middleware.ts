import { Request, Response, NextFunction } from 'express';
import { body, validationResult, query, param } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import { Logger } from '../utils/logger';
import { ValidationError, RateLimitError } from '../utils/errors';
import { CacheService } from '../services/CacheService';

const logger = new Logger('SecurityMiddleware');
const cacheService = new CacheService();

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    next();
  }
};

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return DOMPurify.sanitize(obj, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = DOMPurify.sanitize(key, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * SQL injection prevention
 */
export const preventSQLInjection = (req: Request, res: Response, next: NextFunction): void => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|#|\/\*|\*\/)/gi,
    /(\bOR\b.*=.*\bOR\b)/gi,
    /(\bAND\b.*=.*\bAND\b)/gi
  ];

  const checkForSQLInjection = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    if (Array.isArray(value)) {
      return value.some(checkForSQLInjection);
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some(checkForSQLInjection);
    }
    return false;
  };

  if (checkForSQLInjection(req.body) || checkForSQLInjection(req.query)) {
    logger.warn('Potential SQL injection attempt detected', {
      ip: req.ip,
      url: req.url,
      method: req.method,
      body: req.body,
      query: req.query
    });
    return next(new ValidationError('Invalid input detected'));
  }

  next();
};

/**
 * XSS prevention middleware
 */
export const preventXSS = (req: Request, res: Response, next: NextFunction): void => {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>.*?<\/embed>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi
  ];

  const checkForXSS = (value: any): boolean => {
    if (typeof value === 'string') {
      return xssPatterns.some(pattern => pattern.test(value));
    }
    if (Array.isArray(value)) {
      return value.some(checkForXSS);
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some(checkForXSS);
    }
    return false;
  };

  if (checkForXSS(req.body) || checkForXSS(req.query)) {
    logger.warn('Potential XSS attempt detected', {
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    return next(new ValidationError('Invalid content detected'));
  }

  next();
};

/**
 * Advanced rate limiting with different tiers
 */
export const advancedRateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = options.keyGenerator ? 
        options.keyGenerator(req) : 
        `rate_limit:${req.ip}:${req.route?.path || req.path}`;

      const currentCount = await cacheService.get<number>(key) || 0;

      if (currentCount >= options.maxRequests) {
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          url: req.url,
          count: currentCount,
          limit: options.maxRequests
        });
        
        return next(new RateLimitError('Rate limit exceeded'));
      }

      // Increment counter
      await cacheService.set(key, currentCount + 1, { 
        ttl: Math.floor(options.windowMs / 1000) 
      });

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.maxRequests - currentCount - 1));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + options.windowMs));

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      next(); // Continue if rate limiting fails
    }
  };
};

/**
 * CSRF protection for state-changing operations
 */
export const csrfProtection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] as string;
  const sessionId = (req as any).user?.sessionId;

  if (!token || !sessionId) {
    return next(new ValidationError('CSRF token required'));
  }

  // Verify CSRF token
  const validToken = await cacheService.get(`csrf:${sessionId}`);
  if (token !== validToken) {
    logger.warn('Invalid CSRF token', {
      ip: req.ip,
      sessionId,
      providedToken: token
    });
    return next(new ValidationError('Invalid CSRF token'));
  }

  next();
};

/**
 * File upload security
 */
export const secureFileUpload = (options: {
  allowedMimeTypes: string[];
  maxFileSize: number;
  maxFiles?: number;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }

    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();

    // Check number of files
    if (options.maxFiles && files.length > options.maxFiles) {
      return next(new ValidationError(`Maximum ${options.maxFiles} files allowed`));
    }

    // Check each file
    for (const file of files) {
      // Check file size
      if (file.size > options.maxFileSize) {
        return next(new ValidationError(`File size exceeds ${options.maxFileSize} bytes`));
      }

      // Check MIME type
      if (!options.allowedMimeTypes.includes(file.mimetype)) {
        return next(new ValidationError(`File type ${file.mimetype} not allowed`));
      }

      // Check for malicious file extensions
      const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      
      if (suspiciousExtensions.includes(fileExtension)) {
        return next(new ValidationError('Potentially dangerous file type'));
      }

      // Basic file header validation
      if (!validateFileHeader(file.data, file.mimetype)) {
        return next(new ValidationError('File content does not match declared type'));
      }
    }

    next();
  };
};

/**
 * Validate file header matches MIME type
 */
function validateFileHeader(buffer: Buffer, mimeType: string): boolean {
  const fileSignatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'application/msword': [[0xD0, 0xCF, 0x11, 0xE0]],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      [0x50, 0x4B, 0x03, 0x04]
    ]
  };

  const signatures = fileSignatures[mimeType];
  if (!signatures) return true; // Allow unknown types

  return signatures.some(signature => 
    signature.every((byte, index) => buffer[index] === byte)
  );
}

/**
 * Validation schemas for common operations
 */
export const validationSchemas = {
  expertRegistration: [
    body('firstName').trim().isLength({ min: 2, max: 50 }).escape(),
    body('lastName').trim().isLength({ min: 2, max: 50 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8, max: 128 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
    body('phone').optional().isMobilePhone('any'),
    body('headline').trim().isLength({ min: 10, max: 200 }).escape(),
    body('bio').trim().isLength({ min: 50, max: 2000 }).escape(),
    body('expertise').isArray({ min: 1, max: 5 }),
    body('expertise.*').isString().trim().escape(),
    body('languages').isArray({ min: 1, max: 10 }),
    body('languages.*').isString().trim().escape(),
    body('country').isString().trim().escape(),
    body('timezone').isString().trim(),
    body('hourlyRateMin').isFloat({ min: 10, max: 1000 }),
    body('hourlyRateMax').isFloat({ min: 10, max: 1000 }),
    body('currency').isISO4217(),
    body('termsAccepted').isBoolean().equals('true'),
    body('privacyAccepted').isBoolean().equals('true')
  ],

  expertLogin: [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 1, max: 128 }),
    body('rememberMe').optional().isBoolean(),
    body('twoFactorCode').optional().isLength({ min: 6, max: 6 }).isNumeric()
  ],

  expertProfileUpdate: [
    body('firstName').optional().trim().isLength({ min: 2, max: 50 }).escape(),
    body('lastName').optional().trim().isLength({ min: 2, max: 50 }).escape(),
    body('headline').optional().trim().isLength({ min: 10, max: 200 }).escape(),
    body('bio').optional().trim().isLength({ min: 50, max: 2000 }).escape(),
    body('hourlyRate.min').optional().isFloat({ min: 10, max: 1000 }),
    body('hourlyRate.max').optional().isFloat({ min: 10, max: 1000 }),
    body('languages').optional().isArray({ min: 1, max: 10 }),
    body('languages.*').isString().trim().escape()
  ],

  searchExperts: [
    query('q').optional().trim().isLength({ max: 200 }).escape(),
    query('category').optional().trim().escape(),
    query('location').optional().trim().escape(),
    query('minRate').optional().isFloat({ min: 0 }),
    query('maxRate').optional().isFloat({ min: 0 }),
    query('rating').optional().isFloat({ min: 0, max: 5 }),
    query('page').optional().isInt({ min: 1, max: 100 }),
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],

  createCollaboration: [
    body('title').trim().isLength({ min: 5, max: 200 }).escape(),
    body('description').trim().isLength({ min: 20, max: 5000 }).escape(),
    body('budget.amount').isFloat({ min: 0 }),
    body('budget.currency').isISO4217(),
    body('budget.type').isIn(['fixed', 'hourly']),
    body('startDate').isISO8601(),
    body('endDate').optional().isISO8601()
  ]
};

/**
 * Handle validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.type === 'field' ? error.path : error.type,
      message: error.msg
    }));

    logger.warn('Validation errors', {
      ip: req.ip,
      url: req.url,
      errors: errorMessages
    });

    return next(new ValidationError('Validation failed', errorMessages));
  }
  next();
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'none';"
  );

  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  next();
};

/**
 * IP whitelist middleware
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn('Access denied - IP not whitelisted', {
        ip: clientIP,
        url: req.url
      });
      return next(new ValidationError('Access denied'));
    }

    next();
  };
};