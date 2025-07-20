import compression from 'compression';
import { Request, Response, NextFunction } from 'express';

import { Logger } from '../core/logging/logger';
import { MetricsService } from '../core/metrics/MetricsService';

const logger = new Logger('HTTPOptimization');
const metricsService = new MetricsService();

// Response compression middleware
export const compressionMiddleware = compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req: Request, res: Response) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }

    // Don't compress if already compressed
    if (res.getHeader('content-encoding')) {
      return false;
    }

    // Don't compress images, videos, or audio
    const contentType = res.getHeader('content-type') as string;
    if (contentType) {
      if (contentType.startsWith('image/') ||
          contentType.startsWith('video/') ||
          contentType.startsWith('audio/') ||
          contentType.includes('application/pdf') ||
          contentType.includes('application/zip') ||
          contentType.includes('application/octet-stream')) {
        return false;
      }
    }

    // Use the default filter for everything else
    return compression.filter(req, res);
  }
});

// Response caching middleware
export const cacheControlMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // API responses should not be cached by default
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Override for specific routes
  if (req.path.includes('/public/') || req.path.includes('/static/')) {
    // Cache static assets for 1 hour
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  if (req.path.includes('/health') || req.path.includes('/metrics')) {
    // Cache health/metrics for 30 seconds
    res.setHeader('Cache-Control', 'public, max-age=30');
  }

  next();
};

// Request timeout middleware
export const timeoutMiddleware = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          url: req.url,
          method: req.method,
          ip: req.ip,
          timeout: timeoutMs
        });

        metricsService.incrementCounter('api_timeouts_total', {
          method: req.method,
          path: req.route?.path || req.path
        });

        res.status(408).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'Request timeout',
            timestamp: new Date().toISOString(),
            statusCode: 408
          }
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Request size limit middleware
export const requestSizeLimitMiddleware = (limitBytes: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];

    if (contentLength && parseInt(contentLength) > limitBytes) {
      logger.warn('Request size limit exceeded', {
        url: req.url,
        method: req.method,
        contentLength: parseInt(contentLength),
        limit: limitBytes
      });

      metricsService.incrementCounter('request_size_limit_exceeded_total', {
        method: req.method,
        path: req.route?.path || req.path,
        size: contentLength
      });

      return res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: `Request size exceeds limit of ${limitBytes} bytes`,
          timestamp: new Date().toISOString(),
          statusCode: 413
        }
      });
    }

    next();
  };
};

// Response time tracking middleware
export const responseTimeMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;

    // Record response time metrics
    metricsService.recordTimer('api_response_time_seconds', responseTime / 1000, {
      method: req.method,
      path: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });

    // Log slow responses
    if (responseTime > 1000) {
      logger.warn('Slow response detected', {
        url: req.url,
        method: req.method,
        responseTime,
        statusCode: res.statusCode
      });
    }
  });

  next();
};

// Content Security Policy middleware
export const cspMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspPolicy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
};

// Request ID middleware for correlation
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.headers['x-request-id'] as string ||
                   req.headers['x-correlation-id'] as string ||
                   generateRequestId();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
};

// Generate unique request ID
const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ETag support for conditional requests
export const etagMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;

  res.send = function(data: any) {
    if (req.method === 'GET' && res.statusCode === 200) {
      // Generate simple ETag based on content
      const etag = generateETag(data);
      res.setHeader('ETag', etag);

      // Check if client has cached version
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === etag) {
        res.statusCode = 304;
        return res.end();
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

// Generate ETag from response data
const generateETag = (data: any): string => {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `"${Math.abs(hash).toString(16)}"`;
};

// Preflight OPTIONS handler
export const preflightMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    res.status(200).end();
    return;
  }

  next();
};

// Health check optimization
export const healthCheckMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/health' || req.path === '/healthcheck') {
    // Bypass heavy middleware for health checks
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
    return;
  }

  next();
};

// Combined optimization middleware
export const httpOptimizationMiddleware = [
  requestIdMiddleware,
  healthCheckMiddleware,
  preflightMiddleware,
  compressionMiddleware,
  cacheControlMiddleware,
  cspMiddleware,
  responseTimeMiddleware,
  timeoutMiddleware(30000),
  requestSizeLimitMiddleware(10 * 1024 * 1024),
  etagMiddleware
];

// API-specific optimization middleware
export const apiOptimizationMiddleware = [
  requestIdMiddleware,
  responseTimeMiddleware,
  timeoutMiddleware(60000), // Longer timeout for API calls
  requestSizeLimitMiddleware(50 * 1024 * 1024), // Larger limit for API uploads
  compressionMiddleware
];

// Static file optimization middleware
export const staticOptimizationMiddleware = [
  (req: Request, res: Response, next: NextFunction) => {
    // Cache static files for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Expires', new Date(Date.now() + 31536000000).toUTCString());
    next();
  },
  compressionMiddleware,
  etagMiddleware
];

export default httpOptimizationMiddleware;
