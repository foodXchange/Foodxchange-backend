import { Request, Response, NextFunction } from 'express';

import { Logger } from '../core/logging/logger';
import { getApplicationCacheService } from '../services/performance/CacheService';
import { getDatabaseOptimizationService } from '../services/performance/DatabaseOptimizationService';

const logger = new Logger('PerformanceMiddleware');
const cacheService = getApplicationCacheService();
const dbOptimizationService = getDatabaseOptimizationService();

export interface PerformanceMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  memoryUsage: number;
  cacheHit: boolean;
  dbQueries: number;
  timestamp: Date;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetricsHistory = 1000;

  static getInstance(): PerformanceMonitor {
    if (!this.instance) {
      this.instance = new PerformanceMonitor();
    }
    return this.instance;
  }

  addMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);

    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  getAverageResponseTime(): number {
    if (this.metrics.length === 0) return 0;
    const sum = this.metrics.reduce((acc, metric) => acc + metric.responseTime, 0);
    return sum / this.metrics.length;
  }

  getSlowRequests(threshold: number = 1000): PerformanceMetrics[] {
    return this.metrics.filter(metric => metric.responseTime > threshold);
  }

  getCacheHitRate(): number {
    if (this.metrics.length === 0) return 0;
    const cacheHits = this.metrics.filter(metric => metric.cacheHit).length;
    return (cacheHits / this.metrics.length) * 100;
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Performance monitoring middleware
 */
export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage().heapUsed;
  const requestId = req.headers['x-request-id'] as string || Math.random().toString(36).substr(2, 9);

  // Track database queries
  const dbQueryCount = 0;
  const originalQuery = req.query;

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding?: any) {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const endMemory = process.memoryUsage().heapUsed;
    const memoryUsage = endMemory - startMemory;

    const metric: PerformanceMetrics = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      memoryUsage,
      cacheHit: res.locals.cacheHit || false,
      dbQueries: res.locals.dbQueries || 0,
      timestamp: new Date()
    };

    performanceMonitor.addMetric(metric);

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        memoryUsage: `${(memoryUsage / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // Call original end
    originalEnd.call(this, chunk, encoding);
  };

  // Add request metadata
  req.requestId = requestId;
  req.startTime = startTime;

  next();
};

/**
 * Cache middleware for GET requests
 */
export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = `${req.tenantId}:${req.path}:${JSON.stringify(req.query)}`;

    try {
      const cachedData = await cacheService.get(cacheKey);

      if (cachedData) {
        res.locals.cacheHit = true;
        logger.debug('Cache hit', { cacheKey });
        return res.json(cachedData);
      }

      res.locals.cacheHit = false;

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data: any) {
        if (res.statusCode === 200) {
          cacheService.set(cacheKey, data, { ttl }).catch(error => {
            logger.error('Cache set error', { cacheKey, error });
          });
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', { cacheKey, error });
      next();
    }
  };
};

/**
 * Database query optimization middleware
 */
export const dbOptimizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const queryCount = 0;

  // This would typically hook into your database driver
  // For now, it's a placeholder that tracks query count
  res.locals.dbQueries = queryCount;

  next();
};

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = (windowMs: number = 60000, maxRequests: number = 100) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [key, value] of requests.entries()) {
      if (value.resetTime < windowStart) {
        requests.delete(key);
      }
    }

    const clientRequests = requests.get(clientId) || { count: 0, resetTime: now + windowMs };

    if (clientRequests.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((clientRequests.resetTime - now) / 1000)
        }
      });
    }

    clientRequests.count++;
    requests.set(clientId, clientRequests);

    next();
  };
};

/**
 * Response compression middleware
 */
export const compressionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';

  if (acceptEncoding.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.locals.compression = 'gzip';
  } else if (acceptEncoding.includes('deflate')) {
    res.setHeader('Content-Encoding', 'deflate');
    res.locals.compression = 'deflate';
  }

  next();
};

/**
 * Memory monitoring middleware
 */
export const memoryMonitorMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const memoryUsage = process.memoryUsage();
  const memoryThreshold = 500 * 1024 * 1024; // 500MB

  if (memoryUsage.heapUsed > memoryThreshold) {
    logger.warn('High memory usage detected', {
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`,
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
    });
  }

  next();
};

/**
 * Performance health check endpoint
 */
export const performanceHealthCheck = async (req: Request, res: Response) => {
  try {
    const metrics = performanceMonitor.getMetrics();
    const averageResponseTime = performanceMonitor.getAverageResponseTime();
    const slowRequests = performanceMonitor.getSlowRequests();
    const cacheHitRate = performanceMonitor.getCacheHitRate();
    const cacheStats = await cacheService.getStats();
    const dbMetrics = await dbOptimizationService.getPerformanceMetrics();
    const memoryUsage = process.memoryUsage();

    res.json({
      success: true,
      data: {
        performance: {
          averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
          slowRequestsCount: slowRequests.length,
          totalRequests: metrics.length,
          cacheHitRate: `${cacheHitRate.toFixed(2)}%`
        },
        cache: cacheStats,
        database: dbMetrics,
        memory: {
          heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
          heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
          external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`,
          rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
        },
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Performance health check error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'PERFORMANCE_HEALTH_CHECK_ERROR'
      }
    });
  }
};

/**
 * Performance optimization recommendations
 */
export const performanceRecommendations = async (req: Request, res: Response) => {
  try {
    const suggestions = await dbOptimizationService.suggestOptimizations();
    const slowRequests = performanceMonitor.getSlowRequests();
    const cacheHitRate = performanceMonitor.getCacheHitRate();

    const recommendations: string[] = [...suggestions];

    if (slowRequests.length > 10) {
      recommendations.push('Consider implementing request throttling for high-traffic endpoints');
    }

    if (cacheHitRate < 50) {
      recommendations.push('Consider implementing more aggressive caching strategies');
    }

    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 400 * 1024 * 1024) {
      recommendations.push('Consider implementing memory optimization techniques');
    }

    res.json({
      success: true,
      data: {
        recommendations,
        metrics: {
          slowRequestsCount: slowRequests.length,
          cacheHitRate: `${cacheHitRate.toFixed(2)}%`,
          memoryUsage: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
        }
      }
    });
  } catch (error) {
    logger.error('Performance recommendations error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error',
        code: 'PERFORMANCE_RECOMMENDATIONS_ERROR'
      }
    });
  }
};

// Export the performance monitor instance
export { performanceMonitor };
