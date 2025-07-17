import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  PerformanceMonitor, 
  performanceMiddleware, 
  cacheMiddleware, 
  rateLimitMiddleware,
  performanceHealthCheck,
  performanceRecommendations
} from '../../middleware/performance';
import { CacheService } from '../../services/performance/CacheService';
import { DatabaseOptimizationService } from '../../services/performance/DatabaseOptimizationService';
import { createMockRequest, createMockResponse, createMockNext } from '../utils/testHelpers';

// Mock dependencies
jest.mock('../../services/performance/CacheService');
jest.mock('../../services/performance/DatabaseOptimizationService');
jest.mock('../../core/logging/logger');

describe('Performance Middleware Tests', () => {
  let mockCacheService: jest.Mocked<CacheService>;
  let mockDbOptimizationService: jest.Mocked<DatabaseOptimizationService>;
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    // Reset performance monitor
    performanceMonitor = PerformanceMonitor.getInstance();
    performanceMonitor.clearMetrics();

    // Mock cache service
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      getStats: jest.fn(),
      warmUpCache: jest.fn()
    } as any;

    // Mock database optimization service
    mockDbOptimizationService = {
      getPerformanceMetrics: jest.fn(),
      suggestOptimizations: jest.fn(),
      initializeIndexes: jest.fn(),
      optimizeDatabaseConfiguration: jest.fn()
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PerformanceMonitor', () => {
    it('should add and retrieve metrics', () => {
      const metric = {
        requestId: 'test-123',
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTime: 150,
        memoryUsage: 1024,
        cacheHit: false,
        dbQueries: 1,
        timestamp: new Date()
      };

      performanceMonitor.addMetric(metric);
      const metrics = performanceMonitor.getMetrics();

      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual(metric);
    });

    it('should calculate average response time', () => {
      const metrics = [
        { responseTime: 100 },
        { responseTime: 200 },
        { responseTime: 300 }
      ];

      metrics.forEach(metric => {
        performanceMonitor.addMetric(metric as any);
      });

      const avgResponseTime = performanceMonitor.getAverageResponseTime();
      expect(avgResponseTime).toBe(200);
    });

    it('should identify slow requests', () => {
      const fastRequest = { responseTime: 50 } as any;
      const slowRequest = { responseTime: 1500 } as any;

      performanceMonitor.addMetric(fastRequest);
      performanceMonitor.addMetric(slowRequest);

      const slowRequests = performanceMonitor.getSlowRequests(1000);
      expect(slowRequests).toHaveLength(1);
      expect(slowRequests[0].responseTime).toBe(1500);
    });

    it('should calculate cache hit rate', () => {
      const metrics = [
        { cacheHit: true },
        { cacheHit: false },
        { cacheHit: true },
        { cacheHit: true }
      ];

      metrics.forEach(metric => {
        performanceMonitor.addMetric(metric as any);
      });

      const cacheHitRate = performanceMonitor.getCacheHitRate();
      expect(cacheHitRate).toBe(75);
    });

    it('should limit metrics history', () => {
      const monitor = new (PerformanceMonitor as any)();
      monitor.maxMetricsHistory = 2;

      // Add 3 metrics
      for (let i = 0; i < 3; i++) {
        monitor.addMetric({ requestId: `test-${i}` } as any);
      }

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].requestId).toBe('test-1');
      expect(metrics[1].requestId).toBe('test-2');
    });
  });

  describe('performanceMiddleware', () => {
    it('should track request performance', (done) => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      // Mock res.end to simulate request completion
      const originalEnd = res.end;
      res.end = jest.fn().mockImplementation(function(chunk, encoding) {
        // Simulate some processing time
        setTimeout(() => {
          originalEnd.call(this, chunk, encoding);
          
          // Check if metric was added
          const metrics = performanceMonitor.getMetrics();
          expect(metrics).toHaveLength(1);
          expect(metrics[0].method).toBe('GET');
          expect(metrics[0].path).toBe('/test');
          expect(metrics[0].responseTime).toBeGreaterThan(0);
          
          done();
        }, 10);
      });

      req.method = 'GET';
      req.path = '/test';
      res.statusCode = 200;

      performanceMiddleware(req, res, next);
      
      // Simulate request completion
      setTimeout(() => {
        res.end();
      }, 5);
    });

    it('should add request metadata', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      performanceMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(req.startTime).toBeDefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('cacheMiddleware', () => {
    it('should return cached data if available', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/test',
        query: { limit: 10 },
        tenantId: 'test-tenant'
      });
      const res = createMockResponse();
      const next = createMockNext();

      const cachedData = { message: 'cached response' };
      mockCacheService.get.mockResolvedValue(cachedData);

      const middleware = cacheMiddleware(300);
      await middleware(req, res, next);

      expect(mockCacheService.get).toHaveBeenCalledWith('test-tenant:/api/test:{"limit":10}');
      expect(res.json).toHaveBeenCalledWith(cachedData);
      expect(res.locals.cacheHit).toBe(true);
      expect(next).not.toHaveBeenCalled();
    });

    it('should proceed to next middleware if cache miss', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/test',
        query: {},
        tenantId: 'test-tenant'
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockCacheService.get.mockResolvedValue(null);

      const middleware = cacheMiddleware(300);
      await middleware(req, res, next);

      expect(mockCacheService.get).toHaveBeenCalled();
      expect(res.locals.cacheHit).toBe(false);
      expect(next).toHaveBeenCalled();
    });

    it('should skip caching for non-GET requests', async () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/test'
      });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = cacheMiddleware(300);
      await middleware(req, res, next);

      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/test',
        tenantId: 'test-tenant'
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockCacheService.get.mockRejectedValue(new Error('Cache error'));

      const middleware = cacheMiddleware(300);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests within rate limit', () => {
      const req = createMockRequest({ ip: '127.0.0.1' });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = rateLimitMiddleware(60000, 5);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', () => {
      const req = createMockRequest({ ip: '127.0.0.1' });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = rateLimitMiddleware(60000, 2);
      
      // First request - should pass
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      
      // Second request - should pass
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      
      // Third request - should be blocked
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: expect.any(Number)
        }
      });
    });

    it('should handle different IP addresses separately', () => {
      const req1 = createMockRequest({ ip: '127.0.0.1' });
      const req2 = createMockRequest({ ip: '192.168.1.1' });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = rateLimitMiddleware(60000, 1);
      
      // First IP - should pass
      middleware(req1, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      
      // Second IP - should also pass
      middleware(req2, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      
      // First IP again - should be blocked
      middleware(req1, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('performanceHealthCheck', () => {
    it('should return comprehensive health check data', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockCacheStats = {
        hits: 100,
        misses: 50,
        hitRate: 66.67,
        totalKeys: 200,
        memoryUsage: 1024000
      };

      const mockDbMetrics = {
        averageQueryTime: 25.5,
        slowQueries: 2,
        indexUsage: { 'user_email': 10, 'product_name': 5 },
        connectionPoolSize: 10,
        activeConnections: 3
      };

      mockCacheService.getStats.mockResolvedValue(mockCacheStats);
      mockDbOptimizationService.getPerformanceMetrics.mockResolvedValue(mockDbMetrics);

      await performanceHealthCheck(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          performance: expect.objectContaining({
            averageResponseTime: expect.any(String),
            slowRequestsCount: expect.any(Number),
            totalRequests: expect.any(Number),
            cacheHitRate: expect.any(String)
          }),
          cache: mockCacheStats,
          database: mockDbMetrics,
          memory: expect.objectContaining({
            heapUsed: expect.any(String),
            heapTotal: expect.any(String),
            external: expect.any(String),
            rss: expect.any(String)
          }),
          uptime: expect.any(Number),
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          timestamp: expect.any(String)
        }
      });
    });

    it('should handle errors gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockCacheService.getStats.mockRejectedValue(new Error('Cache error'));

      await performanceHealthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'PERFORMANCE_HEALTH_CHECK_ERROR'
        }
      });
    });
  });

  describe('performanceRecommendations', () => {
    it('should return optimization recommendations', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const mockSuggestions = [
        'Add index on user.email field',
        'Optimize slow query in product search'
      ];

      mockDbOptimizationService.suggestOptimizations.mockResolvedValue(mockSuggestions);

      // Add some test metrics
      performanceMonitor.addMetric({
        requestId: 'slow-1',
        method: 'GET',
        path: '/api/slow',
        statusCode: 200,
        responseTime: 1500,
        memoryUsage: 1024,
        cacheHit: false,
        dbQueries: 1,
        timestamp: new Date()
      });

      await performanceRecommendations(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recommendations: expect.arrayContaining(mockSuggestions),
          metrics: {
            slowRequestsCount: 1,
            cacheHitRate: '0.00%',
            memoryUsage: expect.any(String)
          }
        }
      });
    });

    it('should add cache-related recommendations', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockDbOptimizationService.suggestOptimizations.mockResolvedValue([]);

      // Add metrics with low cache hit rate
      performanceMonitor.addMetric({
        requestId: 'miss-1',
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        responseTime: 100,
        memoryUsage: 1024,
        cacheHit: false,
        dbQueries: 1,
        timestamp: new Date()
      });

      await performanceRecommendations(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          recommendations: expect.arrayContaining([
            'Consider implementing more aggressive caching strategies'
          ]),
          metrics: expect.any(Object)
        }
      });
    });

    it('should handle errors gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      mockDbOptimizationService.suggestOptimizations.mockRejectedValue(new Error('DB error'));

      await performanceRecommendations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'PERFORMANCE_RECOMMENDATIONS_ERROR'
        }
      });
    });
  });

  describe('Performance Integration', () => {
    it('should track end-to-end performance', (done) => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/users',
        tenantId: 'test-tenant'
      });
      const res = createMockResponse();
      const next = createMockNext();

      // Simulate cache miss
      mockCacheService.get.mockResolvedValue(null);

      const cacheHandler = cacheMiddleware(300);
      const perfHandler = performanceMiddleware;

      // Apply performance middleware
      perfHandler(req, res, next);

      // Apply cache middleware
      cacheHandler(req, res, () => {
        // Simulate response
        res.statusCode = 200;
        res.json({ users: [] });
        
        setTimeout(() => {
          const metrics = performanceMonitor.getMetrics();
          expect(metrics).toHaveLength(1);
          expect(metrics[0].method).toBe('GET');
          expect(metrics[0].path).toBe('/api/users');
          expect(metrics[0].cacheHit).toBe(false);
          
          done();
        }, 10);
      });
    });

    it('should handle concurrent requests efficiently', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const req = createMockRequest({
          method: 'GET',
          path: `/api/test/${i}`,
          tenantId: 'test-tenant'
        });
        const res = createMockResponse();
        const next = createMockNext();

        const promise = new Promise((resolve) => {
          performanceMiddleware(req, res, next);
          
          // Simulate async response
          setTimeout(() => {
            res.statusCode = 200;
            res.end();
            resolve(true);
          }, Math.random() * 100);
        });

        promises.push(promise);
      }

      await Promise.all(promises);

      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(10);
      
      // All requests should have been processed
      metrics.forEach((metric, index) => {
        expect(metric.path).toBe(`/api/test/${index}`);
        expect(metric.responseTime).toBeGreaterThan(0);
      });
    });
  });

  describe('Memory Management', () => {
    it('should limit metrics history to prevent memory leaks', () => {
      const monitor = new (PerformanceMonitor as any)();
      monitor.maxMetricsHistory = 3;

      // Add more metrics than the limit
      for (let i = 0; i < 5; i++) {
        monitor.addMetric({
          requestId: `test-${i}`,
          method: 'GET',
          path: `/api/test/${i}`,
          statusCode: 200,
          responseTime: 100,
          memoryUsage: 1024,
          cacheHit: false,
          dbQueries: 1,
          timestamp: new Date()
        });
      }

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics[0].requestId).toBe('test-2');
      expect(metrics[2].requestId).toBe('test-4');
    });

    it('should clean up old rate limiting entries', () => {
      const middleware = rateLimitMiddleware(100, 5); // 100ms window
      
      const req1 = createMockRequest({ ip: '127.0.0.1' });
      const req2 = createMockRequest({ ip: '192.168.1.1' });
      const res = createMockResponse();
      const next = createMockNext();

      // Make requests
      middleware(req1, res, next);
      middleware(req2, res, next);

      // Wait for window to expire
      setTimeout(() => {
        // These should be treated as new requests
        middleware(req1, res, next);
        middleware(req2, res, next);
        
        expect(next).toHaveBeenCalledTimes(4);
      }, 150);
    });
  });
});