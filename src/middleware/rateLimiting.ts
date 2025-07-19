import { Request, Response, NextFunction } from 'express';
import { rateLimitingService } from '../services/security/RateLimitingService';
import { Logger } from '../core/logging/logger';

const logger = new Logger('RateLimitingMiddleware');

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string | object;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean | Promise<boolean>;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
  onLimitReached?: (req: Request, res: Response) => void;
}

/**
 * Standard rate limiting middleware
 */
export const rateLimit = (options: RateLimitOptions = {}) => {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = defaultKeyGenerator,
    skip,
    handler,
    onLimitReached
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if should skip
      if (skip && await skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      
      // Check blacklist first
      const blacklistCheck = await rateLimitingService.isBlacklisted(key);
      if (blacklistCheck.blocked) {
        logger.warn(`Blocked blacklisted key: ${key}`, { reason: blacklistCheck.reason });
        return res.status(403).json({
          success: false,
          error: {
            code: 'BLACKLISTED',
            message: 'Access denied',
            reason: blacklistCheck.reason
          }
        });
      }

      // Check whitelist
      if (await rateLimitingService.isWhitelisted(key)) {
        return next();
      }

      // Check rate limit
      const result = await rateLimitingService.checkRateLimit(key, {
        windowMs,
        maxRequests: max,
        skipSuccessfulRequests,
        skipFailedRequests
      });

      // Set headers
      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', result.info.limit);
        res.setHeader('RateLimit-Remaining', result.info.remaining);
        res.setHeader('RateLimit-Reset', result.info.resetTime.toISOString());
        res.setHeader('RateLimit-Policy', `${max};w=${windowMs / 1000}`);
      }

      if (legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', result.info.limit);
        res.setHeader('X-RateLimit-Remaining', result.info.remaining);
        res.setHeader('X-RateLimit-Reset', result.info.resetTime.getTime());
      }

      if (!result.allowed) {
        logger.warn(`Rate limit exceeded for key: ${key}`);
        
        if (result.info.retryAfter) {
          res.setHeader('Retry-After', result.info.retryAfter);
        }

        if (onLimitReached) {
          onLimitReached(req, res);
        }

        if (handler) {
          return handler(req, res, next);
        }

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: typeof message === 'string' ? message : message,
            limit: result.info.limit,
            remaining: result.info.remaining,
            resetTime: result.info.resetTime,
            retryAfter: result.info.retryAfter
          }
        });
      }

      // Track response status for conditional limiting
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(data) {
          if (skipSuccessfulRequests && res.statusCode < 400) {
            // Refund the request
            rateLimitingService.resetLimit(`${key}:latest`);
          }
          if (skipFailedRequests && res.statusCode >= 400) {
            // Refund the request
            rateLimitingService.resetLimit(`${key}:latest`);
          }
          return originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
};

/**
 * Tier-based rate limiting for users
 */
export const tierRateLimit = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id || 'anonymous';
      const userTier = (req as any).user?.tier || 'free';

      const result = await rateLimitingService.checkTierLimit(userId, userTier);

      // Set tier-specific headers
      res.setHeader('X-RateLimit-Tier', result.info.tier);
      res.setHeader('X-RateLimit-Limit', JSON.stringify(result.info.limits));
      
      if (result.info.remaining !== undefined) {
        res.setHeader('X-RateLimit-Remaining', result.info.remaining);
      }

      if (!result.allowed) {
        logger.warn(`Tier rate limit exceeded for user: ${userId} (${userTier})`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'TIER_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded for your subscription tier',
            tier: result.info.tier,
            limits: result.info.limits,
            upgradeUrl: '/api/v1/subscription/upgrade'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Tier rate limiting error:', error);
      next();
    }
  };
};

/**
 * IP-based rate limiting
 */
export const ipRateLimit = (options?: { windowMs?: number; max?: number }) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = getClientIP(req);
      
      const result = await rateLimitingService.checkIPLimit(ip, {
        windowMs: options?.windowMs,
        maxRequests: options?.max
      });

      if (!result.allowed) {
        logger.warn(`IP rate limit exceeded: ${ip}`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'IP_RATE_LIMIT_EXCEEDED',
            message: 'Too many requests from this IP address'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('IP rate limiting error:', error);
      next();
    }
  };
};

/**
 * API key rate limiting
 */
export const apiKeyRateLimit = (options?: { windowMs?: number; max?: number }) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        return next();
      }

      const result = await rateLimitingService.checkAPIKeyLimit(apiKey, {
        windowMs: options?.windowMs,
        maxRequests: options?.max
      });

      // Set API key specific headers
      res.setHeader('X-RateLimit-Limit', result.info.limit);
      res.setHeader('X-RateLimit-Remaining', result.info.remaining);
      res.setHeader('X-RateLimit-Reset', result.info.resetTime.toISOString());

      if (!result.allowed) {
        logger.warn(`API key rate limit exceeded: ${apiKey.substring(0, 8)}...`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'API_KEY_RATE_LIMIT_EXCEEDED',
            message: 'API key rate limit exceeded',
            limit: result.info.limit,
            resetTime: result.info.resetTime
          }
        });
      }

      next();
    } catch (error) {
      logger.error('API key rate limiting error:', error);
      next();
    }
  };
};

/**
 * Endpoint-specific rate limiting
 */
export const endpointRateLimit = (
  endpoint?: string,
  options?: { windowMs?: number; max?: number }
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actualEndpoint = endpoint || req.route?.path || req.path;
      const key = defaultKeyGenerator(req);
      
      const result = await rateLimitingService.checkEndpointLimit(
        actualEndpoint,
        key,
        {
          windowMs: options?.windowMs,
          maxRequests: options?.max
        }
      );

      if (!result.allowed) {
        logger.warn(`Endpoint rate limit exceeded: ${actualEndpoint} for ${key}`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'ENDPOINT_RATE_LIMIT_EXCEEDED',
            message: `Too many requests to ${actualEndpoint}`,
            endpoint: actualEndpoint
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Endpoint rate limiting error:', error);
      next();
    }
  };
};

/**
 * Adaptive rate limiting based on system load
 */
export const adaptiveRateLimit = (baseLimit: number = 100) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = defaultKeyGenerator(req);
      const systemLoad = await getSystemLoad();
      
      const result = await rateLimitingService.checkAdaptiveLimit(
        key,
        baseLimit,
        60000, // 1 minute window
        systemLoad
      );

      res.setHeader('X-RateLimit-Adaptive', 'true');
      res.setHeader('X-RateLimit-Load', systemLoad.toFixed(2));
      res.setHeader('X-RateLimit-Adjusted-Limit', result.adjustedLimit);

      if (!result.allowed) {
        logger.warn(`Adaptive rate limit exceeded for ${key} (load: ${systemLoad})`);
        
        return res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_OVERLOADED',
            message: 'Service temporarily overloaded, please try again later',
            systemLoad,
            adjustedLimit: result.adjustedLimit
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Adaptive rate limiting error:', error);
      next();
    }
  };
};

/**
 * Distributed rate limiting for multiple servers
 */
export const distributedRateLimit = (
  limit: number = 1000,
  window: number = 60
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = defaultKeyGenerator(req);
      
      const result = await rateLimitingService.checkDistributedLimit(
        key,
        limit,
        window
      );

      if (!result.allowed) {
        logger.warn(`Distributed rate limit exceeded for ${key}`);
        
        return res.status(429).json({
          success: false,
          error: {
            code: 'DISTRIBUTED_RATE_LIMIT_EXCEEDED',
            message: 'Global rate limit exceeded'
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Distributed rate limiting error:', error);
      next();
    }
  };
};

// Helper functions

function defaultKeyGenerator(req: Request): string {
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  return `ip:${getClientIP(req)}`;
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function getSystemLoad(): Promise<number> {
  // Simple load calculation based on memory usage
  const usage = process.memoryUsage();
  const totalMemory = require('os').totalmem();
  const memoryLoad = usage.heapUsed / totalMemory;
  
  // Could also factor in CPU usage, active connections, etc.
  return Math.min(memoryLoad * 2, 1); // Scale to 0-1
}

// Rate limit presets
export const rateLimitPresets = {
  strict: rateLimit({ windowMs: 60000, max: 10 }),
  standard: rateLimit({ windowMs: 60000, max: 100 }),
  relaxed: rateLimit({ windowMs: 60000, max: 1000 }),
  
  auth: {
    login: rateLimit({ 
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5,
      skipSuccessfulRequests: true
    }),
    register: rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3
    }),
    passwordReset: rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3
    })
  },
  
  api: {
    read: rateLimit({ windowMs: 60000, max: 1000 }),
    write: rateLimit({ windowMs: 60000, max: 100 }),
    upload: rateLimit({ windowMs: 60000, max: 10 }),
    export: rateLimit({ windowMs: 300000, max: 5 })
  }
};