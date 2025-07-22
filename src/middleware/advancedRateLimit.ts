import { Request, Response, NextFunction } from 'express';

import { Logger } from '../core/logging/logger';
import { advancedRateLimitingService } from '../services/security/AdvancedRateLimitingService';

const logger = new Logger('AdvancedRateLimitMiddleware');

interface RateLimitRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    tier?: string;
    companyId?: string;
    company?: string;
  };
  rateLimitContext?: {
    userId?: string;
    userRole?: string;
    userTier?: string;
    ipAddress: string;
    endpoint: string;
    method: string;
    userAgent?: string;
    apiKey?: string;
    companyId?: string;
    timestamp: Date;
  };
}

interface AdvancedRateLimitOptions {
  skipOnError?: boolean;
  keyGenerator?: (req: RateLimitRequest) => string;
  skip?: (req: RateLimitRequest) => boolean | Promise<boolean>;
  onLimitReached?: (req: RateLimitRequest, res: Response, result: any) => void;
  customHeaders?: boolean;
  includeHeaders?: boolean;
}

/**
 * Advanced rate limiting middleware using the AdvancedRateLimitingService
 */
export const advancedRateLimit = (options: AdvancedRateLimitOptions = {}) => {
  const {
    skipOnError = true,
    keyGenerator,
    skip,
    onLimitReached,
    customHeaders = true,
    includeHeaders = true
  } = options;

  return async (req: RateLimitRequest, res: Response, next: NextFunction) => {
    try {
      // Check if should skip
      if (skip && await skip(req)) {
        return next();
      }

      // Build rate limit context
      const context = await buildRateLimitContext(req, keyGenerator);
      req.rateLimitContext = context;

      // Check rate limit
      const result = await advancedRateLimitingService.checkRateLimit(context);

      // Set headers if enabled
      if (includeHeaders) {
        setRateLimitHeaders(res, result, customHeaders);
      }

      // Handle rate limit exceeded
      if (!result.allowed) {
        logger.warn(`Rate limit exceeded for ${context.ipAddress}`, {
          userId: context.userId,
          endpoint: context.endpoint,
          rule: result.rule?.name,
          reason: result.reason
        });

        // Call custom handler if provided
        if (onLimitReached) {
          onLimitReached(req, res, result);
          return;
        }

        // Default response
        return res.status(429).json({
          success: false,
          error: {
            code: result.blocked ? 'RATE_LIMIT_BLOCKED' : 'RATE_LIMIT_EXCEEDED',
            message: result.reason || 'Rate limit exceeded',
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
            retryAfter: result.retryAfter,
            queuePosition: result.queuePosition,
            estimatedWaitTime: result.estimatedWaitTime
          }
        });
      }

      // Handle throttling
      if (result.throttled && result.queuePosition) {
        logger.debug(`Request throttled for ${context.ipAddress}`, {
          queuePosition: result.queuePosition,
          estimatedWaitTime: result.estimatedWaitTime
        });

        // Add throttling headers
        if (includeHeaders) {
          res.setHeader('X-RateLimit-Throttled', 'true');
          res.setHeader('X-RateLimit-Queue-Position', result.queuePosition);
          if (result.estimatedWaitTime) {
            res.setHeader('X-RateLimit-Estimated-Wait', result.estimatedWaitTime);
          }
        }
      }

      // Add rate limit info to request for downstream middleware
      (req as any).rateLimit = {
        limit: result.limit,
        remaining: result.remaining,
        resetTime: result.resetTime,
        rule: result.rule
      };

      next();
    } catch (error) {
      logger.error('Advanced rate limiting error:', error);

      if (skipOnError) {
        // Fail open - allow request
        next();
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_ERROR',
            message: 'Rate limiting service error'
          }
        });
      }
    }
  };
};

/**
 * Middleware specifically for API endpoints
 */
export const apiRateLimit = advancedRateLimit({
  skipOnError: true,
  includeHeaders: true,
  customHeaders: true
});

/**
 * Middleware for authentication endpoints with stricter limits
 */
export const authRateLimit = advancedRateLimit({
  skipOnError: false,
  includeHeaders: true,
  customHeaders: true,
  onLimitReached: (req, res, result) => {
    logger.warn('Authentication rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: result.retryAfter
      }
    });
  }
});

/**
 * Middleware for admin operations with custom handling
 */
export const adminRateLimit = advancedRateLimit({
  skipOnError: false,
  includeHeaders: true,
  customHeaders: true,
  skip: async (req) => {
    // Skip for super admin users
    return req.user?.role === 'super_admin';
  },
  onLimitReached: (req, res, result) => {
    logger.warn('Admin rate limit exceeded', {
      userId: req.user?.id,
      userRole: req.user?.role,
      endpoint: req.path,
      rule: result.rule?.name
    });

    res.status(429).json({
      success: false,
      error: {
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
        message: 'Admin operation rate limit exceeded',
        limit: result.limit,
        resetTime: result.resetTime
      }
    });
  }
});

/**
 * Middleware for file upload endpoints
 */
export const uploadRateLimit = advancedRateLimit({
  skipOnError: true,
  includeHeaders: true,
  customHeaders: true,
  onLimitReached: (req, res, result) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
        message: 'Upload rate limit exceeded. Please wait before uploading again.',
        retryAfter: result.retryAfter,
        queuePosition: result.queuePosition
      }
    });
  }
});

/**
 * Middleware for search endpoints with throttling support
 */
export const searchRateLimit = advancedRateLimit({
  skipOnError: true,
  includeHeaders: true,
  customHeaders: true,
  onLimitReached: (req, res, result) => {
    if (result.throttled && result.queuePosition) {
      res.status(202).json({
        success: false,
        error: {
          code: 'SEARCH_THROTTLED',
          message: 'Search request queued due to high load',
          queuePosition: result.queuePosition,
          estimatedWaitTime: result.estimatedWaitTime
        }
      });
    } else {
      res.status(429).json({
        success: false,
        error: {
          code: 'SEARCH_RATE_LIMIT_EXCEEDED',
          message: 'Search rate limit exceeded',
          retryAfter: result.retryAfter
        }
      });
    }
  }
});

/**
 * Create a custom rate limit middleware with specific rules
 */
export const createCustomRateLimit = (ruleIds: string[], options: AdvancedRateLimitOptions = {}) => {
  return advancedRateLimit({
    ...options,
    keyGenerator: (req) => {
      // Custom key generation that includes rule IDs
      const baseKey = options.keyGenerator ? options.keyGenerator(req) : getDefaultKey(req);
      return `${baseKey}:${ruleIds.join(':')}`;
    }
  });
};

/**
 * Middleware to bypass rate limiting for whitelisted IPs
 */
export const whitelistBypass = async (req: RateLimitRequest, res: Response, next: NextFunction) => {
  try {
    const ipAddress = getClientIP(req);
    const isWhitelisted = await advancedRateLimitingService.isWhitelisted(ipAddress);

    if (isWhitelisted) {
      logger.debug(`Request from whitelisted IP: ${ipAddress}`);
      res.setHeader('X-RateLimit-Bypassed', 'whitelist');
      (req as any).rateLimitBypassed = true;
    }

    next();
  } catch (error) {
    logger.error('Whitelist check error:', error);
    next();
  }
};

/**
 * Middleware to block blacklisted IPs
 */
export const blacklistBlock = async (req: RateLimitRequest, res: Response, next: NextFunction) => {
  try {
    const ipAddress = getClientIP(req);
    const blacklistCheck = await advancedRateLimitingService.isBlacklisted(ipAddress);

    if (blacklistCheck.blocked) {
      logger.warn(`Request from blacklisted IP: ${ipAddress}`, {
        reason: blacklistCheck.reason
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'IP_BLACKLISTED',
          message: 'Access denied',
          reason: blacklistCheck.reason
        }
      });
    }

    next();
  } catch (error) {
    logger.error('Blacklist check error:', error);
    next();
  }
};

// Helper functions

async function buildRateLimitContext(req: RateLimitRequest, keyGenerator?: (req: RateLimitRequest) => string): Promise<any> {
  const {user} = req;
  const ipAddress = getClientIP(req);

  return {
    userId: user?.id,
    userRole: user?.role,
    userTier: user?.tier || 'basic',
    ipAddress,
    endpoint: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    apiKey: req.get('X-API-Key'),
    companyId: user?.companyId,
    timestamp: new Date(),
    customKey: keyGenerator ? keyGenerator(req) : undefined
  };
}

function setRateLimitHeaders(res: Response, result: any, customHeaders: boolean): void {
  // Standard rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetTime.toISOString());

  if (result.retryAfter) {
    res.setHeader('Retry-After', result.retryAfter);
  }

  // Custom advanced headers
  if (customHeaders) {
    if (result.rule) {
      res.setHeader('X-RateLimit-Rule', result.rule.name);
      res.setHeader('X-RateLimit-Rule-ID', result.rule.id);
    }

    if (result.throttled) {
      res.setHeader('X-RateLimit-Throttled', 'true');
    }

    if (result.blocked) {
      res.setHeader('X-RateLimit-Blocked', 'true');
    }

    if (result.queuePosition) {
      res.setHeader('X-RateLimit-Queue-Position', result.queuePosition);
    }

    if (result.estimatedWaitTime) {
      res.setHeader('X-RateLimit-Estimated-Wait', result.estimatedWaitTime);
    }
  }
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (forwarded as string).split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp as string;
  }

  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

function getDefaultKey(req: RateLimitRequest): string {
  const {user} = req;
  if (user?.id) {
    return `user:${user.id}`;
  }
  return `ip:${getClientIP(req)}`;
}

// Rate limit presets for common scenarios
export const rateLimitPresets = {
  // Very strict for sensitive operations
  strict: advancedRateLimit({
    skipOnError: false,
    includeHeaders: true,
    customHeaders: true
  }),

  // Standard API rate limiting
  standard: advancedRateLimit({
    skipOnError: true,
    includeHeaders: true,
    customHeaders: true
  }),

  // Relaxed for public endpoints
  relaxed: advancedRateLimit({
    skipOnError: true,
    includeHeaders: true,
    customHeaders: false
  }),

  // For high-volume endpoints with throttling
  throttled: advancedRateLimit({
    skipOnError: true,
    includeHeaders: true,
    customHeaders: true,
    onLimitReached: (req, res, result) => {
      if (result.throttled) {
        res.status(202).json({
          success: false,
          message: 'Request queued due to high load',
          queuePosition: result.queuePosition,
          estimatedWaitTime: result.estimatedWaitTime
        });
      } else {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded',
            retryAfter: result.retryAfter
          }
        });
      }
    }
  })
};
