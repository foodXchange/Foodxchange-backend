import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss';
import crypto from 'crypto';
import { Logger } from '../core/logging/logger';
import { MetricsService } from '../core/metrics/MetricsService';

const logger = new Logger('SecurityMiddleware');
const metricsService = new MetricsService();

// CORS configuration
export const corsOptions = {
  origin: function (origin: string | undefined, callback: Function) {
    // Define allowed origins based on environment
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://foodxchange.com',
      'https://app.foodxchange.com',
      'https://admin.foodxchange.com'
    ];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from origin:', origin);
      metricsService.incrementCounter('cors_blocked_requests_total', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Forwarded-For'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Per-Page',
    'X-Request-ID'
  ],
  maxAge: 86400 // 24 hours
};

// Helmet configuration for security headers
export const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false, // May interfere with some services
  crossOriginOpenerPolicy: { policy: 'cross-origin' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true
};

// Input sanitization middleware
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
    
    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    next(error);
  }
};

// Recursive object sanitization
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return xss(obj, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  
  return obj;
}

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Custom security headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || generateRequestId());
  res.setHeader('X-Response-Time', Date.now().toString());
  
  // Remove potentially sensitive headers
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  next();
};

// Request ID generator
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// IP whitelist middleware (for admin endpoints)
export const ipWhitelist = (allowedIPs: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // Get IPs from environment or use default
    const whitelist = allowedIPs.length > 0 ? allowedIPs : 
                     (process.env.ADMIN_ALLOWED_IPS?.split(',') || []);
    
    if (whitelist.length === 0) {
      // No whitelist configured, allow all
      return next();
    }
    
    if (whitelist.includes(clientIP)) {
      logger.info('IP whitelist: Access granted', { ip: clientIP });
      return next();
    }
    
    logger.warn('IP whitelist: Access denied', { ip: clientIP });
    metricsService.incrementCounter('ip_whitelist_blocked_total', { ip: clientIP });
    
    res.status(403).json({
      success: false,
      error: {
        code: 'IP_NOT_ALLOWED',
        message: 'Access denied from this IP address',
        statusCode: 403
      }
    });
  };
};

// User agent validation middleware
export const validateUserAgent = (req: Request, res: Response, next: NextFunction): void => {
  const userAgent = req.get('User-Agent');
  
  if (!userAgent) {
    logger.warn('Request without User-Agent header', { ip: req.ip });
    metricsService.incrementCounter('requests_without_user_agent_total');
  }
  
  // Block known malicious user agents
  const blockedUserAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'curl', // Can be configured to allow curl if needed
    'wget'
  ];
  
  if (userAgent && blockedUserAgents.some(blocked => 
      userAgent.toLowerCase().includes(blocked))) {
    logger.warn('Blocked malicious user agent', { userAgent, ip: req.ip });
    metricsService.incrementCounter('malicious_user_agent_blocked_total', { userAgent });
    
    return res.status(403).json({
      success: false,
      error: {
        code: 'USER_AGENT_BLOCKED',
        message: 'Access denied',
        statusCode: 403
      }
    });
  }
  
  next();
};

// Request size limiter
export const requestSizeLimit = (maxSize: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('content-length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        logger.warn('Request size limit exceeded', { 
          size: sizeInBytes, 
          maxSize: maxSizeInBytes, 
          ip: req.ip 
        });
        
        metricsService.incrementCounter('request_size_limit_exceeded_total', {
          size: sizeInBytes.toString()
        });
        
        return res.status(413).json({
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: 'Request size exceeds maximum allowed size',
            statusCode: 413
          }
        });
      }
    }
    
    next();
  };
};

// Helper function to parse size strings
function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };
  
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/);
  if (!match) return 0;
  
  const value = parseFloat(match[1]);
  const unit = match[2];
  
  return value * units[unit];
}

// SQL injection prevention for raw queries
export const sqlInjectionPrevention = (req: Request, res: Response, next: NextFunction): void => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|#|\/\*|\*\/)/g,
    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
    /('\s*OR\s*')/gi
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  const checkObject = (obj: any): boolean => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (checkValue(obj[key])) return true;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (checkObject(obj[key])) return true;
        }
      }
    }
    return false;
  };

  if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
    logger.warn('SQL injection attempt detected', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    metricsService.incrementCounter('sql_injection_attempts_total');
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid characters detected in request'
      }
    });
  }

  next();
};

// API abuse detection middleware
export const apiAbuseDetection = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /%2e%2e%2f/gi, // Encoded directory traversal
    /\0/g, // Null byte injection
    /exec\s*\(/gi, // Command injection
    /eval\s*\(/gi, // Code injection
  ];

  const checkForAbuse = (value: string): boolean => {
    return suspiciousPatterns.some(pattern => pattern.test(value));
  };

  // Check URL path
  if (checkForAbuse(req.path) || checkForAbuse(req.originalUrl)) {
    logger.warn('API abuse detected in URL', {
      ip: req.ip,
      path: req.path,
      originalUrl: req.originalUrl
    });
    
    metricsService.incrementCounter('api_abuse_attempts_total');
    
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid request detected'
      }
    });
  }

  next();
};

// CSRF token generation and validation
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF for certain methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] as string || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    logger.warn('CSRF token validation failed', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });

    metricsService.incrementCounter('csrf_validation_failures_total');

    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'CSRF token validation failed'
      }
    });
  }

  next();
};

// File upload security middleware
export const fileUploadSecurity = (req: Request, res: Response, next: NextFunction): void => {
  if (req.files || req.file) {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];

    const maxFileSize = 10 * 1024 * 1024; // 10MB

    const files = req.files ? (Array.isArray(req.files) ? req.files : [req.files]) : [req.file];
    
    for (const file of files.filter(Boolean)) {
      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        logger.warn('Invalid file type upload attempt', {
          ip: req.ip,
          filename: file.originalname,
          mimetype: file.mimetype
        });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'File type not allowed',
            allowedTypes: allowedMimeTypes
          }
        });
      }

      // Check file size
      if (file.size > maxFileSize) {
        logger.warn('File size limit exceeded', {
          ip: req.ip,
          filename: file.originalname,
          size: file.size,
          maxSize: maxFileSize
        });
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds limit of ${maxFileSize / 1024 / 1024}MB`
          }
        });
      }

      // Sanitize filename
      file.originalname = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    }
  }

  next();
};

// Complete security middleware setup
export const setupSecurity = () => {
  return [
    helmet(helmetConfig),
    cors(corsOptions),
    mongoSanitize(),
    sanitizeInput,
    sqlInjectionPrevention,
    apiAbuseDetection,
    securityHeaders,
    validateUserAgent,
    requestSizeLimit()
  ];
};

// Export individual middleware for selective use
export {
  helmet,
  cors,
  mongoSanitize
};

export default {
  setupSecurity,
  corsOptions,
  helmetConfig,
  sanitizeInput,
  sqlInjectionPrevention,
  apiAbuseDetection,
  securityHeaders,
  ipWhitelist,
  validateUserAgent,
  requestSizeLimit,
  fileUploadSecurity,
  csrfProtection,
  generateCSRFToken
};