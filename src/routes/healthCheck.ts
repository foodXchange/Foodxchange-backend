import os from 'os';

import express from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import { redisClient } from '../config/redis';
import { Logger } from '../core/logging/logger';
import { MetricsService } from '../core/monitoring/metrics';

const metricsService = new MetricsService();

const router = express.Router();
const logger = new Logger('HealthCheck');

// Get package version
const version = process.env.npm_package_version || '1.0.0';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
}

interface ServiceHealth {
  [key: string]: HealthStatus;
}

/**
 * Basic health check - returns 200 if server is running
 */
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version
  });
}));

/**
 * Detailed health check - checks all services
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const checks: ServiceHealth = {};

  // Check MongoDB
  checks.mongodb = await checkMongoDB();

  // Check Redis
  checks.redis = await checkRedis();

  // Check external services if configured
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    checks.azureStorage = await checkAzureStorage();
  }

  if (process.env.SENDGRID_API_KEY || process.env.SMTP_HOST) {
    checks.email = await checkEmailService();
  }

  // Calculate overall status
  const statuses = Object.values(checks).map(check => check.status);
  const overallStatus = statuses.includes('unhealthy') ? 'unhealthy' :
    statuses.includes('degraded') ? 'degraded' : 'healthy';

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version,
    responseTime: Date.now() - startTime,
    checks,
    system: getSystemInfo()
  };

  // Set appropriate status code
  const statusCode = overallStatus === 'healthy' ? 200 :
    overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(response);
}));

/**
 * Readiness check - for container orchestration
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const checks = {
    mongodb: await checkMongoDB(),
    redis: await checkRedis()
  };

  const isReady = Object.values(checks).every(check => check.status !== 'unhealthy');

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      checks
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      checks
    });
  }
}));

/**
 * Liveness check - for container orchestration
 */
router.get('/live', (req, res) => {
  // Simple check that the process is responsive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Metrics endpoint - returns Prometheus metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  try {
    const metrics = await metricsService.getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    logger.error('Error getting metrics:', error);
    res.status(500).send('Error retrieving metrics');
  }
}));

/**
 * Database-specific health check
 */
router.get('/db', asyncHandler(async (req, res) => {
  const mongoHealth = await checkMongoDB();
  const dbStats = await getDatabaseStats();

  res.status(mongoHealth.status === 'healthy' ? 200 : 503).json({
    ...mongoHealth,
    stats: dbStats
  });
}));

/**
 * Cache-specific health check
 */
router.get('/cache', asyncHandler(async (req, res) => {
  const redisHealth = await checkRedis();
  const cacheStats = await getCacheStats();

  res.status(redisHealth.status === 'healthy' ? 200 : 503).json({
    ...redisHealth,
    stats: cacheStats
  });
}));

// Health check functions

async function checkMongoDB(): Promise<HealthStatus> {
  try {
    const start = Date.now();

    if (mongoose.connection.readyState !== 1) {
      return {
        status: 'unhealthy',
        message: 'MongoDB connection is not ready'
      };
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();

    const responseTime = Date.now() - start;

    return {
      status: responseTime > 1000 ? 'degraded' : 'healthy',
      message: 'MongoDB is responding',
      responseTime
    };
  } catch (error) {
    logger.error('MongoDB health check failed:', error);
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'MongoDB check failed'
    };
  }
}

async function checkRedis(): Promise<HealthStatus> {
  try {
    const start = Date.now();

    // Check if Redis client is ready
    if (redisClient.status !== 'ready') {
      return {
        status: 'unhealthy',
        message: `Redis status: ${redisClient.status}`
      };
    }

    // Ping Redis
    await redisClient.ping();

    const responseTime = Date.now() - start;

    return {
      status: responseTime > 100 ? 'degraded' : 'healthy',
      message: 'Redis is responding',
      responseTime
    };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Redis check failed'
    };
  }
}

async function checkAzureStorage(): Promise<HealthStatus> {
  try {
    // This would check Azure Blob Storage connectivity
    // For now, return healthy if configured
    return {
      status: 'healthy',
      message: 'Azure Storage is configured'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Azure Storage check failed'
    };
  }
}

async function checkEmailService(): Promise<HealthStatus> {
  try {
    // This would verify email service connectivity
    // For now, return healthy if configured
    return {
      status: 'healthy',
      message: 'Email service is configured'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'Email service check failed'
    };
  }
}

function getSystemInfo() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    memoryUsage: process.memoryUsage(),
    loadAverage: os.loadavg(),
    uptime: {
      process: process.uptime(),
      system: os.uptime()
    }
  };
}

async function getDatabaseStats() {
  try {
    if (mongoose.connection.readyState !== 1) {
      return null;
    }

    const admin = mongoose.connection.db.admin();
    const dbStats = await admin.command({ dbStats: 1 });

    return {
      collections: dbStats.collections,
      documents: dbStats.objects,
      dataSize: dbStats.dataSize,
      storageSize: dbStats.storageSize,
      indexes: dbStats.indexes,
      indexSize: dbStats.indexSize
    };
  } catch (error) {
    logger.error('Error getting database stats:', error);
    return null;
  }
}

async function getCacheStats() {
  try {
    if (redisClient.status !== 'ready') {
      return null;
    }

    const info = await redisClient.info();
    const stats: any = {};

    // Parse Redis INFO output
    info.split('\r\n').forEach(line => {
      if (line?.includes(':')) {
        const [key, value] = line.split(':');
        if (['used_memory_human', 'connected_clients', 'total_commands_processed', 'keyspace_hits', 'keyspace_misses'].includes(key)) {
          stats[key] = value;
        }
      }
    });

    // Calculate hit rate
    const hits = parseInt(stats.keyspace_hits || '0');
    const misses = parseInt(stats.keyspace_misses || '0');
    const total = hits + misses;

    stats.hit_rate = total > 0 ? `${((hits / total) * 100).toFixed(2)  }%` : 'N/A';

    return stats;
  } catch (error) {
    logger.error('Error getting cache stats:', error);
    return null;
  }
}

/**
 * Custom health check endpoint
 */
router.post('/check', asyncHandler(async (req, res) => {
  const { services = [] } = req.body;
  const results: ServiceHealth = {};

  for (const service of services) {
    switch (service) {
      case 'mongodb':
        results.mongodb = await checkMongoDB();
        break;
      case 'redis':
        results.redis = await checkRedis();
        break;
      case 'azure':
        results.azure = await checkAzureStorage();
        break;
      case 'email':
        results.email = await checkEmailService();
        break;
      default:
        results[service] = {
          status: 'unhealthy',
          message: 'Unknown service'
        };
    }
  }

  const overallHealthy = Object.values(results).every(r => r.status !== 'unhealthy');

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'unhealthy',
    services: results
  });
}));

export default router;
