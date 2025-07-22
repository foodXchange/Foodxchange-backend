import { Router } from 'express';
import { Request, Response } from 'express';

import { databaseManager } from '../../../config/database';
import { Logger } from '../../../core/logging/logger';
import { MetricsService } from '../../../core/monitoring/metrics';
import { protect } from '../../../middleware/auth';
import { authorize } from '../../../middleware/auth';

const router = Router();
const logger = new Logger('MonitoringRoutes');
const metricsService = new MetricsService();

// Middleware to ensure admin access for monitoring endpoints
const requireAdmin = [protect, authorize('admin')];

// GET /api/v1/monitoring/health - Database health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthStatus = await databaseManager.getHealthStatus();

    const response = {
      status: healthStatus.connected && healthStatus.initialized ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: healthStatus.connected,
        initialized: healthStatus.initialized,
        connectionPool: healthStatus.connectionPool
      },
      collections: healthStatus.collections.map(col => ({
        name: col.collection,
        documents: col.documentCount,
        indexes: col.indexCount,
        size: col.totalSize
      })),
      migrations: {
        total: healthStatus.migrations?.total || 0,
        applied: healthStatus.migrations?.applied || 0,
        pending: healthStatus.migrations?.pending || 0
      },
      alerts: {
        total: healthStatus.alerts?.length || 0,
        unresolved: healthStatus.alerts?.filter((alert: any) => !alert.resolved).length || 0
      }
    };

    res.json(response);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/metrics - Prometheus metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await metricsService.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/performance - Performance metrics (Admin only)
router.get('/performance', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const performanceMonitor = databaseManager.getPerformanceMonitor();
    const performanceHistory = performanceMonitor.getPerformanceHistory(limit);

    res.json({
      success: true,
      data: performanceHistory,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/alerts - Database alerts (Admin only)
router.get('/alerts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
    const performanceMonitor = databaseManager.getPerformanceMonitor();
    const alerts = performanceMonitor.getAlerts(resolved);

    res.json({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alerts',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/monitoring/alerts/:id/resolve - Resolve alert (Admin only)
router.post('/alerts/:id/resolve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const performanceMonitor = databaseManager.getPerformanceMonitor();
    const resolved = performanceMonitor.resolveAlert(id);

    if (resolved) {
      res.json({
        success: true,
        message: 'Alert resolved successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Failed to resolve alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/migrations - Migration status (Admin only)
router.get('/migrations', requireAdmin, async (req: Request, res: Response) => {
  try {
    const migrationManager = databaseManager.getMigrationManager();
    const migrationStatus = await migrationManager.getMigrationStatus();

    res.json({
      success: true,
      data: migrationStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve migration status',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/monitoring/migrations/run - Run pending migrations (Admin only)
router.post('/migrations/run', requireAdmin, async (req: Request, res: Response) => {
  try {
    await databaseManager.runMigrations();

    res.json({
      success: true,
      message: 'Migrations completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Migration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/monitoring/migrations/:id/rollback - Rollback migration (Admin only)
router.post('/migrations/:id/rollback', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await databaseManager.rollbackMigration(id);

    res.json({
      success: true,
      message: `Migration ${id} rolled back successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Migration rollback failed:', error);
    res.status(500).json({
      success: false,
      error: 'Migration rollback failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/indexes - Index analysis (Admin only)
router.get('/indexes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const indexManager = databaseManager.getIndexManager();
    const indexAnalysis = await indexManager.analyzeIndexUsage();

    res.json({
      success: true,
      data: indexAnalysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to analyze indexes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze indexes',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/monitoring/indexes/create - Create all indexes (Admin only)
router.post('/indexes/create', requireAdmin, async (req: Request, res: Response) => {
  try {
    const indexManager = databaseManager.getIndexManager();
    await indexManager.createAllIndexes();

    res.json({
      success: true,
      message: 'All indexes created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to create indexes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create indexes',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/queries/slow - Slow query analysis (Admin only)
router.get('/queries/slow', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const queryOptimizer = databaseManager.getQueryOptimizer();
    const slowQueries = await queryOptimizer.getSlowQueries(limit);

    res.json({
      success: true,
      data: slowQueries,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get slow queries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve slow queries',
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/v1/monitoring/optimize - Run database optimization (Admin only)
router.post('/optimize', requireAdmin, async (req: Request, res: Response) => {
  try {
    await databaseManager.optimizeDatabase();

    res.json({
      success: true,
      message: 'Database optimization completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Database optimization failed:', error);
    res.status(500).json({
      success: false,
      error: 'Database optimization failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/v1/monitoring/report - Generate performance report (Admin only)
router.get('/report', requireAdmin, async (req: Request, res: Response) => {
  try {
    const performanceMonitor = databaseManager.getPerformanceMonitor();
    const report = await performanceMonitor.generatePerformanceReport();

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to generate performance report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate performance report',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
