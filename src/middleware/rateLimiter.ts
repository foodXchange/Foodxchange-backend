import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response } from 'express';
import { redisClient } from '../config/redis';
import { Logger } from '../core/logging/logger';

const logger = new Logger('RateLimiter');

/**
 * Create a rate limiter with tenant-aware configuration
 */
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) => {
  const defaults = {
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        tenantId: req.tenantId,
        userId: req.userId
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || defaults.message,
          retryAfter: res.getHeader('Retry-After')
        }
      });
    },
    keyGenerator: (req: Request) => {
      // Use tenant-aware key generation
      if (req.tenantId) {
        return `${req.tenantId}:${req.ip}`;
      }
      return req.ip;
    }
  };

  return rateLimit({
    ...defaults,
    ...options,
    store: new RedisStore({
      client: redisClient as any,
      prefix: 'rl:',
      sendCommand: (...args: string[]) => (redisClient as any).call(...args)
    })
  });
};

/**
 * Tenant-aware dynamic rate limiter
 */
export const createDynamicRateLimiter = () => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      client: redisClient as any,
      prefix: 'drl:',
      sendCommand: (...args: string[]) => (redisClient as any).call(...args)
    }),
    max: (req: Request) => {
      // Dynamic limit based on subscription tier
      if (req.tenantContext) {
        return req.tenantContext.limits.apiCallsPerMinute;
      }
      // Default limit for unauthenticated requests
      return 30;
    },
    keyGenerator: (req: Request) => {
      // Use tenant ID for authenticated requests, IP for anonymous
      if (req.tenantId) {
        return `tenant:${req.tenantId}`;
      }
      return `ip:${req.ip}`;
    },
    handler: (req: Request, res: Response) => {
      const limit = req.tenantContext?.limits.apiCallsPerMinute || 30;
      
      logger.warn('Dynamic rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        tenantId: req.tenantId,
        userId: req.userId,
        limit,
        tier: req.tenantContext?.subscriptionTier
      });
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `API rate limit exceeded. Your tier allows ${limit} requests per minute.`,
          limit,
          tier: req.tenantContext?.subscriptionTier || 'anonymous',
          retryAfter: res.getHeader('Retry-After'),
          upgradeUrl: req.tenantContext ? '/api/tenant/subscription/upgrade' : '/api/auth/register'
        }
      });
    }
  });
};

// Pre-configured rate limiters for different endpoints

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Only count failed attempts
});

/**
 * Rate limiter for password reset endpoints
 */
export const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset requests, please try again later.'
});

/**
 * Rate limiter for file uploads
 */
export const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: 'Upload limit exceeded, please try again later.',
  keyGenerator: (req: Request) => {
    // Rate limit by user, not just IP
    if (req.userId) {
      return `upload:${req.userId}`;
    }
    return `upload:${req.ip}`;
  }
});

/**
 * Rate limiter for API endpoints (tenant-aware)
 */
export const apiRateLimiter = createDynamicRateLimiter();

/**
 * Rate limiter for search endpoints
 */
export const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests, please slow down.'
});

/**
 * Rate limiter for webhook endpoints
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Webhook rate limit exceeded.'
});

/**
 * IP-based rate limiter for public endpoints
 */
export const publicRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this IP address.'
});

/**
 * Aggressive rate limiter for suspicious activity
 */
export const suspiciousActivityLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 requests per day
  message: 'Suspicious activity detected. Access temporarily restricted.',
  keyGenerator: (req: Request) => {
    // Track by multiple factors
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip;
    const fingerprint = `${ip}:${userAgent}`;
    return `suspicious:${fingerprint}`;
  }
});

/**
 * Rate limiter for RFQ operations
 */
export const rfqRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 RFQ operations per hour
  message: 'Too many RFQ operations, please try again later.',
  keyGenerator: (req: Request) => {
    // Rate limit by user
    if (req.userId) {
      return `rfq:${req.userId}`;
    }
    return `rfq:${req.ip}`;
  }
});

/**
 * Create a custom rate limiter for specific use cases
 */
export const createCustomRateLimiter = (
  name: string,
  windowMinutes: number,
  maxRequests: number,
  options?: Partial<any>
) => {
  return createRateLimiter({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    keyGenerator: (req: Request) => {
      const key = req.userId || req.ip;
      return `${name}:${key}`;
    },
    ...options
  });
};

/**
 * Middleware to track API usage for billing
 */
export const trackApiUsage = async (req: Request, res: Response, next: Function) => {
  if (req.tenantId) {
    try {
      const key = `api_usage:${req.tenantId}:${new Date().toISOString().slice(0, 10)}`;
      await redisClient.incr(key);
      await redisClient.expire(key, 30 * 24 * 60 * 60); // Keep for 30 days
    } catch (error) {
      logger.error('Failed to track API usage:', error);
    }
  }
  next();
};

/**
 * Get current rate limit status for a request
 */
export const getRateLimitStatus = async (req: Request, limitName: string = 'api') => {
  try {
    const key = `rl:${limitName}:${req.tenantId || req.ip}`;
    const count = await redisClient.get(key);
    const ttl = await redisClient.ttl(key);
    
    const limit = req.tenantContext?.limits.apiCallsPerMinute || 30;
    const current = parseInt(count || '0');
    const remaining = Math.max(0, limit - current);
    
    return {
      limit,
      current,
      remaining,
      resetIn: ttl > 0 ? ttl : 0
    };
  } catch (error) {
    logger.error('Failed to get rate limit status:', error);
    return null;
  }
};

export default {
  createRateLimiter,
  createDynamicRateLimiter,
  authRateLimiter,
  passwordResetRateLimiter,
  uploadRateLimiter,
  apiRateLimiter,
  searchRateLimiter,
  webhookRateLimiter,
  publicRateLimiter,
  suspiciousActivityLimiter,
  rfqRateLimiter,
  createCustomRateLimiter,
  trackApiUsage,
  getRateLimitStatus
};