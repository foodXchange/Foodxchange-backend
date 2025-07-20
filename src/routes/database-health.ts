import express from 'express';

import { databaseManager } from '../config/database';
import { databaseConfigManager } from '../config/database-config';
import {
  getConnectionPoolStats,
  getConnectionHealth,
  runConnectionDiagnostics,
  getConnectionMetrics
} from '../config/database-optimization';
import { Logger } from '../core/logging/logger';

const router = express.Router();
const logger = new Logger('DatabaseHealth');

/**
 * GET /api/database/health
 * Get comprehensive database health status
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await databaseManager.getHealthStatus();

    res.json({
      status: 'success',
      data: {
        ...healthStatus,
        timestamp: new Date(),
        uptime: process.uptime()
      }
    });
  } catch (error) {
    logger.error('Failed to get database health status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve database health status',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/health/simple
 * Get simple health check for load balancers
 */
router.get('/health/simple', async (req, res) => {
  try {
    const health = getConnectionHealth();

    if (health.isConnected && health.isHeartbeatHealthy) {
      res.status(200).json({ status: 'healthy' });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        issues: health.isConnected ? [] : ['not_connected'],
        lastHeartbeat: health.lastHeartbeat
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/database/pool
 * Get connection pool statistics
 */
router.get('/pool', async (req, res) => {
  try {
    const poolStats = getConnectionPoolStats();
    const connectionHealth = getConnectionHealth();
    const metrics = getConnectionMetrics();

    res.json({
      status: 'success',
      data: {
        pool: poolStats,
        health: connectionHealth,
        metrics,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error('Failed to get connection pool stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve connection pool statistics',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/diagnostics
 * Run comprehensive database diagnostics
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const diagnostics = await runConnectionDiagnostics();

    res.json({
      status: 'success',
      data: diagnostics
    });
  } catch (error) {
    logger.error('Failed to run database diagnostics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to run database diagnostics',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/config
 * Get current database configuration and validation
 */
router.get('/config', async (req, res) => {
  try {
    const summary = databaseConfigManager.getEnvironmentSummary();

    res.json({
      status: 'success',
      data: summary
    });
  } catch (error) {
    logger.error('Failed to get database configuration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve database configuration',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/database/optimize
 * Trigger database optimization
 */
router.post('/optimize', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    logger.info('Starting manual database optimization...');
    await databaseManager.optimizeDatabase();

    res.json({
      status: 'success',
      message: 'Database optimization completed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Database optimization failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database optimization failed',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/migrations
 * Get migration status
 */
router.get('/migrations', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    const migrationManager = databaseManager.getMigrationManager();
    const status = await migrationManager.getMigrationStatus();

    res.json({
      status: 'success',
      data: status
    });
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve migration status',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/database/migrations/run
 * Run pending migrations
 */
router.post('/migrations/run', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    logger.info('Running database migrations...');
    await databaseManager.runMigrations();

    res.json({
      status: 'success',
      message: 'Migrations completed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    logger.error('Migration failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Migration failed',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/performance
 * Get performance metrics and history
 */
router.get('/performance', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    const performanceMonitor = databaseManager.getPerformanceMonitor();
    const hours = parseInt(req.query.hours as string) || 1;

    const history = performanceMonitor.getPerformanceHistory(hours);
    const alerts = performanceMonitor.getAlerts();
    const report = await performanceMonitor.generatePerformanceReport();

    res.json({
      status: 'success',
      data: {
        history,
        alerts,
        report,
        timestamp: new Date()
      }
    });
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve performance metrics',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/indexes
 * Get index usage and optimization suggestions
 */
router.get('/indexes', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    const indexManager = databaseManager.getIndexManager();
    const analysis = await indexManager.analyzeIndexUsage();

    res.json({
      status: 'success',
      data: analysis
    });
  } catch (error) {
    logger.error('Failed to analyze indexes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to analyze indexes',
      error: (error as Error).message
    });
  }
});

/**
 * GET /api/database/queries
 * Get query performance statistics
 */
router.get('/queries', async (req, res) => {
  try {
    if (!databaseManager.isConnectionActive()) {
      return res.status(503).json({
        status: 'error',
        message: 'Database not connected'
      });
    }

    const queryOptimizer = databaseManager.getQueryOptimizer();
    const collection = req.query.collection as string;

    if (collection) {
      const stats = await queryOptimizer.getQueryStats(collection);
      res.json({
        status: 'success',
        data: { collection, stats }
      });
    } else {
      // Get stats for all major collections
      const collections = ['users', 'companies', 'orders', 'rfqs', 'products', 'analyticsevents'];
      const allStats = {};

      for (const col of collections) {
        try {
          allStats[col] = await queryOptimizer.getQueryStats(col);
        } catch (error) {
          logger.debug(`Failed to get stats for collection ${col}:`, error);
          allStats[col] = { error: (error as Error).message };
        }
      }

      res.json({
        status: 'success',
        data: allStats
      });
    }
  } catch (error) {
    logger.error('Failed to get query statistics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve query statistics',
      error: (error as Error).message
    });
  }
});

/**
 * POST /api/database/config/reload
 * Reload database configuration
 */
router.post('/config/reload', async (req, res) => {
  try {
    databaseConfigManager.resetConfiguration();
    const newSummary = databaseConfigManager.getEnvironmentSummary();

    logger.info('Database configuration reloaded');

    res.json({
      status: 'success',
      message: 'Database configuration reloaded successfully',
      data: newSummary
    });
  } catch (error) {
    logger.error('Failed to reload database configuration:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reload database configuration',
      error: (error as Error).message
    });
  }
});

export default router;
