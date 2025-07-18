import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../config/redis';
import { Logger } from '../core/logging/logger';
import crypto from 'crypto';

const logger = new Logger('ResponseCache');

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  key?: (req: Request) => string; // Custom key generator
  condition?: (req: Request, res: Response) => boolean; // Condition to cache
  varyBy?: string[]; // Headers to vary cache by
}

/**
 * Generate cache key based on request
 */
const generateCacheKey = (req: Request, options: CacheOptions): string => {
  if (options.key) {
    return `response:${options.key(req)}`;
  }

  const parts = [
    req.method,
    req.originalUrl || req.url,
    req.tenantId || 'public'
  ];

  // Add vary by headers
  if (options.varyBy) {
    options.varyBy.forEach(header => {
      const value = req.headers[header.toLowerCase()];
      if (value) {
        parts.push(`${header}:${value}`);
      }
    });
  }

  // Create hash of the parts
  const hash = crypto.createHash('md5').update(parts.join('|')).digest('hex');
  return `response:${hash}`;
};

/**
 * Response caching middleware
 */
export const responseCache = (options: CacheOptions = {}) => {
  const { ttl = 300, condition } = options; // Default 5 minutes

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests by default
    if (req.method !== 'GET') {
      return next();
    }

    // Check if caching is enabled for this request
    if (condition && !condition(req, res)) {
      return next();
    }

    const cacheKey = generateCacheKey(req, options);

    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug(`Cache hit: ${cacheKey}`);
        
        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        // Parse and send cached response
        const { statusCode, headers, body } = cached as any;
        
        // Set headers
        Object.entries(headers).forEach(([key, value]) => {
          res.setHeader(key, value as string);
        });
        
        // Send response
        res.status(statusCode).send(body);
        return;
      }
    } catch (error) {
      logger.error('Cache read error:', error);
      // Continue without cache on error
    }

    // Cache miss
    logger.debug(`Cache miss: ${cacheKey}`);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', cacheKey);

    // Store original send method
    const originalSend = res.send;
    const originalJson = res.json;

    // Override send method to cache response
    res.send = function(data: any): Response {
      res.send = originalSend; // Restore original method
      
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const responseData = {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: data
        };
        
        // Cache asynchronously
        cacheService.set(cacheKey, responseData, ttl).catch(error => {
          logger.error('Cache write error:', error);
        });
      }
      
      return originalSend.call(this, data);
    };

    // Override json method to cache response
    res.json = function(data: any): Response {
      res.json = originalJson; // Restore original method
      
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const responseData = {
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: JSON.stringify(data)
        };
        
        // Cache asynchronously
        cacheService.set(cacheKey, responseData, ttl).catch(error => {
          logger.error('Cache write error:', error);
        });
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
};

/**
 * Clear cache for specific patterns
 */
export const clearCache = async (patterns: string[]): Promise<void> => {
  for (const pattern of patterns) {
    await cacheService.clearPattern(`response:${pattern}*`);
  }
  logger.info(`Cleared cache for patterns: ${patterns.join(', ')}`);
};

/**
 * Middleware to clear cache on mutations
 */
export const clearCacheOnMutation = (patterns: string[] | ((req: Request) => string[])) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only clear on mutation methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Store original send method
    const originalSend = res.send;
    const originalJson = res.json;

    // Override send method to clear cache after successful mutation
    res.send = function(data: any): Response {
      res.send = originalSend; // Restore original method
      
      // Only clear cache on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const patternsToC lear = typeof patterns === 'function' ? patterns(req) : patterns;
        
        // Clear cache asynchronously
        clearCache(patternsToC lear).catch(error => {
          logger.error('Cache clear error:', error);
        });
      }
      
      return originalSend.call(this, data);
    };

    // Override json method
    res.json = function(data: any): Response {
      res.json = originalJson; // Restore original method
      
      // Only clear cache on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const patternsToC lear = typeof patterns === 'function' ? patterns(req) : patterns;
        
        // Clear cache asynchronously
        clearCache(patternsToC lear).catch(error => {
          logger.error('Cache clear error:', error);
        });
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
};

// Pre-configured cache middlewares for common use cases

/**
 * Cache for public endpoints (longer TTL)
 */
export const publicCache = responseCache({
  ttl: 3600, // 1 hour
  varyBy: ['accept-language', 'accept']
});

/**
 * Cache for authenticated endpoints (shorter TTL)
 */
export const privateCache = responseCache({
  ttl: 300, // 5 minutes
  key: (req) => `${req.originalUrl}:${req.userId || 'anonymous'}`,
  varyBy: ['accept-language', 'accept']
});

/**
 * Cache for product listings
 */
export const productListCache = responseCache({
  ttl: 600, // 10 minutes
  key: (req) => `products:${req.tenantId}:${req.originalUrl}`,
  condition: (req) => !req.query.search // Don't cache search results
});

/**
 * Cache for static data
 */
export const staticCache = responseCache({
  ttl: 86400, // 24 hours
  varyBy: ['accept-language']
});

/**
 * No cache middleware (sets appropriate headers)
 */
export const noCache = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};