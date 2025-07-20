import { Logger } from '../core/logging/logger';
import { optimizedCache } from '../services/cache/OptimizedCacheService';
import { databaseOptimizationService } from '../services/database/DatabaseOptimizationService';
import { memoryOptimizationService } from '../services/optimization/MemoryOptimizationService';
import { scheduleRecurringJobs } from '../services/queue/jobHelpers';
import { jobProcessor } from '../services/queue/JobProcessor';

const logger = new Logger('StartupOptimizations');

/**
 * Apply all startup optimizations
 */
export async function applyStartupOptimizations(): Promise<void> {
  logger.info('Applying startup optimizations...');

  try {
    // 1. Memory optimizations
    await applyMemoryOptimizations();

    // 2. Database optimizations
    await applyDatabaseOptimizations();

    // 3. Cache warmup
    await warmupCache();

    // 4. Start background job processor
    await startJobProcessor();

    // 5. Configure process handlers
    configureProcessHandlers();

    logger.info('All startup optimizations applied successfully');
  } catch (error) {
    logger.error('Failed to apply startup optimizations', error);
    throw error;
  }
}

/**
 * Apply memory optimizations
 */
async function applyMemoryOptimizations(): Promise<void> {
  logger.info('Applying memory optimizations...');

  // Apply optimizations
  memoryOptimizationService.applyOptimizations();

  // Set memory thresholds based on environment
  if (process.env.NODE_ENV === 'production') {
    // More aggressive GC in production
    if (global.gc) {
      setInterval(() => {
        const metrics = memoryOptimizationService.getCurrentMetrics();
        if (metrics && metrics.heapUsedPercent > 70) {
          global.gc();
        }
      }, 60000); // Every minute
    }
  }

  // Monitor for memory leaks in development
  if (process.env.NODE_ENV === 'development') {
    setInterval(async () => {
      const leakDetection = await memoryOptimizationService.detectMemoryLeaks();
      if (leakDetection.possibleLeak) {
        logger.warn('Possible memory leak detected', leakDetection);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  logger.info('Memory optimizations applied');
}

/**
 * Apply database optimizations
 */
async function applyDatabaseOptimizations(): Promise<void> {
  logger.info('Applying database optimizations...');

  // Create indexes
  await databaseOptimizationService.createIndexes();

  // Optimize collections
  await databaseOptimizationService.optimizeCollections();

  // Enable profiling in development
  if (process.env.NODE_ENV === 'development') {
    await databaseOptimizationService.enableProfiling(1, 100);
  }

  // Schedule periodic optimization
  setInterval(async () => {
    try {
      await databaseOptimizationService.optimizeCollections();
    } catch (error) {
      logger.error('Periodic database optimization failed', error);
    }
  }, 24 * 60 * 60 * 1000); // Daily

  logger.info('Database optimizations applied');
}

/**
 * Warm up cache with frequently accessed data
 */
async function warmupCache(): Promise<void> {
  logger.info('Warming up cache...');

  const warmupFunctions = [
    // Add your cache warmup functions here
    async () => {
      // Example: Cache system configuration
      const config = { version: '1.0.0', features: {} };
      await optimizedCache.set('system:config', config, { ttl: 3600 });
    },

    async () => {
      // Example: Cache frequently accessed reference data
      // await optimizedCache.set('reference:categories', categories, { ttl: 3600 });
    }
  ];

  await optimizedCache.warmUp(warmupFunctions);

  logger.info('Cache warmup completed');
}

/**
 * Start background job processor
 */
async function startJobProcessor(): Promise<void> {
  logger.info('Starting job processor...');

  // Start the job processor
  await jobProcessor.start();

  // Schedule recurring jobs
  await scheduleRecurringJobs();

  // Monitor job health
  setInterval(async () => {
    try {
      const metrics = await jobProcessor.getQueueMetrics();

      // Log warning if queues are backing up
      Object.entries(metrics).forEach(([queue, stats]: [string, any]) => {
        if (stats.waiting > 1000) {
          logger.warn(`Queue ${queue} has ${stats.waiting} waiting jobs`);
        }
        if (stats.failed > 100) {
          logger.warn(`Queue ${queue} has ${stats.failed} failed jobs`);
        }
      });
    } catch (error) {
      logger.error('Failed to check job queue health', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  logger.info('Job processor started');
}

/**
 * Configure process-wide handlers
 */
function configureProcessHandlers(): void {
  // Handle memory pressure events
  process.on('memory-pressure', (level: string) => {
    logger.warn(`Memory pressure detected: ${level}`);

    if (level === 'critical') {
      // Take emergency actions
      optimizedCache.flush().catch(error => {
        logger.error('Failed to flush cache during memory pressure', error);
      });
    }
  });

  // Optimize unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });

    // In production, try to recover
    if (process.env.NODE_ENV === 'production') {
      // Log and continue
      logger.error('Attempting to continue after unhandled rejection');
    }
  });

  // Handle worker thread errors
  process.on('worker', (worker) => {
    worker.on('error', (error) => {
      logger.error('Worker error:', error);
    });
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`${signal} received, starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      process.emit('SIGTERM' as any);

      // Wait for ongoing requests to complete (max 30 seconds)
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Stop services
      await jobProcessor.stop();
      memoryOptimizationService.stop();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', async () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', async () => gracefulShutdown('SIGINT'));

  logger.info('Process handlers configured');
}

/**
 * Performance tuning based on environment
 */
export function tunePerformance(): void {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      // Production optimizations
      process.env.UV_THREADPOOL_SIZE = '128';
      process.env.NODE_OPTIONS = '--max-old-space-size=4096';
      break;

    case 'development':
      // Development settings
      process.env.UV_THREADPOOL_SIZE = '16';
      process.env.NODE_OPTIONS = '--max-old-space-size=2048';
      break;

    case 'test':
      // Test settings
      process.env.UV_THREADPOOL_SIZE = '4';
      process.env.NODE_OPTIONS = '--max-old-space-size=1024';
      break;
  }

  logger.info(`Performance tuned for ${env} environment`);
}

/**
 * Monitor application health
 */
export function startHealthMonitoring(): void {
  setInterval(async () => {
    const health = {
      memory: memoryOptimizationService.getCurrentMetrics(),
      cache: await optimizedCache.getStats(),
      jobs: await jobProcessor.getQueueMetrics(),
      timestamp: new Date()
    };

    // Check overall health
    const issues = [];

    if (health.memory && health.memory.heapUsedPercent > 80) {
      issues.push('High memory usage');
    }

    if (health.cache.hitRate < 0.5) {
      issues.push('Low cache hit rate');
    }

    if (issues.length > 0) {
      logger.warn('Health check issues detected', { issues, health });
    }
  }, 60000); // Every minute
}
