import express from 'express';

import { Logger } from '../core/logging/logger';
import { authenticate } from '../middleware/auth';
import { performanceHealthCheck, performanceRecommendations } from '../middleware/performance';
import { authorize } from '../middleware/rbac';
import { getApplicationCacheService } from '../services/performance/CacheService';
import { getDatabaseOptimizationService } from '../services/performance/DatabaseOptimizationService';

const router = express.Router();
const logger = new Logger('PerformanceRoutes');
const dbOptimizationService = getDatabaseOptimizationService();
const cacheService = getApplicationCacheService();

/**
 * GET /api/v1/performance/health
 * Get performance health check
 */
router.get('/health', authenticate, authorize(['admin', 'manager']), performanceHealthCheck);

/**
 * GET /api/v1/performance/recommendations
 * Get performance optimization recommendations
 */
router.get('/recommendations', authenticate, authorize(['admin', 'manager']), performanceRecommendations);

/**
 * POST /api/v1/performance/optimize/database
 * Initialize database optimization
 */
router.post('/optimize/database', authenticate, authorize(['admin']), async (req, res) => {
  try {
    logger.info('Starting database optimization', { userId: req.userId, tenantId: req.tenantId });

    await dbOptimizationService.initializeIndexes();
    await dbOptimizationService.optimizeDatabaseConfiguration();

    res.json({
      success: true,
      message: 'Database optimization completed successfully'
    });
  } catch (error) {
    logger.error('Database optimization error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Database optimization failed',
        code: 'DATABASE_OPTIMIZATION_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/database/metrics
 * Get database performance metrics
 */
router.get('/database/metrics', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const metrics = await dbOptimizationService.getPerformanceMetrics();

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Database metrics error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get database metrics',
        code: 'DATABASE_METRICS_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/database/indexes
 * Get database index usage statistics
 */
router.get('/database/indexes', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const indexStats = await dbOptimizationService.getIndexUsageStats();

    res.json({
      success: true,
      data: indexStats
    });
  } catch (error) {
    logger.error('Index stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get index statistics',
        code: 'INDEX_STATS_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const stats = await cacheService.getStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Cache stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get cache statistics',
        code: 'CACHE_STATS_ERROR'
      }
    });
  }
});

/**
 * POST /api/v1/performance/cache/clear
 * Clear cache
 */
router.post('/cache/clear', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { namespace } = req.body;

    await cacheService.clear(namespace);

    res.json({
      success: true,
      message: namespace ? `Cache cleared for namespace: ${namespace}` : 'All cache cleared'
    });
  } catch (error) {
    logger.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to clear cache',
        code: 'CACHE_CLEAR_ERROR'
      }
    });
  }
});

/**
 * POST /api/v1/performance/cache/warm-up
 * Warm up cache
 */
router.post('/cache/warm-up', authenticate, authorize(['admin']), async (req, res) => {
  try {
    await cacheService.warmUpCache();

    res.json({
      success: true,
      message: 'Cache warm-up completed'
    });
  } catch (error) {
    logger.error('Cache warm-up error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to warm up cache',
        code: 'CACHE_WARMUP_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/memory
 * Get memory usage information
 */
router.get('/memory', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();

    res.json({
      success: true,
      data: {
        heapUsed: {
          bytes: memoryUsage.heapUsed,
          mb: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
        },
        heapTotal: {
          bytes: memoryUsage.heapTotal,
          mb: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`
        },
        external: {
          bytes: memoryUsage.external,
          mb: `${(memoryUsage.external / 1024 / 1024).toFixed(2)}MB`
        },
        rss: {
          bytes: memoryUsage.rss,
          mb: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
        },
        uptime: process.uptime(),
        nodeVersion: process.version
      }
    });
  } catch (error) {
    logger.error('Memory stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get memory statistics',
        code: 'MEMORY_STATS_ERROR'
      }
    });
  }
});

/**
 * POST /api/v1/performance/gc
 * Trigger garbage collection (if exposed)
 */
router.post('/gc', authenticate, authorize(['admin']), async (req, res) => {
  try {
    if (global.gc) {
      global.gc();
      res.json({
        success: true,
        message: 'Garbage collection triggered'
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          message: 'Garbage collection not exposed. Start with --expose-gc flag',
          code: 'GC_NOT_EXPOSED'
        }
      });
    }
  } catch (error) {
    logger.error('GC trigger error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to trigger garbage collection',
        code: 'GC_TRIGGER_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/queries/slow
 * Get slow queries information
 */
router.get('/queries/slow', authenticate, authorize(['admin', 'manager']), async (req, res) => {
  try {
    const suggestions = await dbOptimizationService.suggestOptimizations();

    res.json({
      success: true,
      data: {
        suggestions,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Slow queries error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get slow queries information',
        code: 'SLOW_QUERIES_ERROR'
      }
    });
  }
});

/**
 * POST /api/v1/performance/queries/analyze
 * Analyze a specific query
 */
router.post('/queries/analyze', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { model, query, options } = req.body;

    if (!model || !query) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Model and query are required',
          code: 'INVALID_REQUEST'
        }
      });
    }

    // This would need to be implemented with actual model references
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Query analysis functionality would be implemented here',
      data: {
        model,
        query,
        options,
        note: 'This endpoint requires actual model implementation'
      }
    });
  } catch (error) {
    logger.error('Query analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to analyze query',
        code: 'QUERY_ANALYSIS_ERROR'
      }
    });
  }
});

/**
 * GET /api/v1/performance/system
 * Get system performance information
 */
router.get('/system', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      success: true,
      data: {
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external,
          rss: memoryUsage.rss
        },
        uptime: {
          seconds: uptime,
          human: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
        },
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('System performance error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get system performance information',
        code: 'SYSTEM_PERFORMANCE_ERROR'
      }
    });
  }
});

export default router;
