import mongoose from 'mongoose';

import { Logger } from '../core/logging/logger';
import { IndexManager } from '../services/database/IndexManager';
import { MigrationManager } from '../services/database/MigrationManager';
import { PerformanceMonitor } from '../services/database/PerformanceMonitor';
import { QueryOptimizer } from '../services/database/QueryOptimizer';

import {
  createDatabaseConnection,
  closeDatabaseConnection,
  getConnectionPoolStats,
  getConnectionHealth,
  runConnectionDiagnostics,
  getConnectionMetrics
} from './database-optimization';

const logger = new Logger('Database');

export class DatabaseManager {
  private static instance: DatabaseManager;
  private readonly indexManager: IndexManager;
  private readonly migrationManager: MigrationManager;
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly queryOptimizer: QueryOptimizer;
  private isConnected = false;
  private isInitialized = false;
  private connectionMonitorInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.indexManager = IndexManager.getInstance();
    this.migrationManager = MigrationManager.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    this.queryOptimizer = QueryOptimizer.getInstance();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Database already connected');
      return;
    }

    try {
      const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';

      await createDatabaseConnection({
        uri: connectionString
      });

      this.isConnected = true;
      logger.info('Database connected successfully');

      // Start connection monitoring
      this.startConnectionMonitoring();

      // Initialize database components
      await this.initialize();
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Database already initialized');
      return;
    }

    try {
      logger.info('Initializing database components...');

      // Run initial health check
      const health = await this.performHealthCheck();
      if (!health.isHealthy) {
        throw new Error('Database health check failed during initialization');
      }

      // Run migrations first
      await this.migrationManager.runMigrations();

      // Enable query profiling based on configuration
      const enableProfiling = process.env.DB_ENABLE_PROFILING === 'true' || process.env.NODE_ENV === 'development';
      if (enableProfiling) {
        const profileLevel = parseInt(process.env.DB_PROFILE_LEVEL || '100');
        await this.queryOptimizer.enableProfiling(profileLevel);
      }

      // Start performance monitoring
      const monitoringInterval = parseInt(process.env.DB_MONITORING_INTERVAL || '60000');
      this.performanceMonitor.startMonitoring(monitoringInterval);

      // Start health check monitoring
      this.startHealthCheckMonitoring();

      this.isInitialized = true;
      logger.info('Database initialization completed');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Database not connected');
      return;
    }

    try {
      // Stop monitoring intervals
      this.stopConnectionMonitoring();
      this.stopHealthCheckMonitoring();

      // Stop performance monitoring
      this.performanceMonitor.stopMonitoring();

      // Disable query profiling
      const enableProfiling = process.env.DB_ENABLE_PROFILING === 'true' || process.env.NODE_ENV === 'development';
      if (enableProfiling) {
        await this.queryOptimizer.disableProfiling();
      }

      // Close database connection
      await closeDatabaseConnection();

      this.isConnected = false;
      this.isInitialized = false;
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database:', error);
      throw error;
    }
  }

  public async runMigrations(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    await this.migrationManager.runMigrations();
  }

  public async rollbackMigration(migrationId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    await this.migrationManager.rollbackMigration(migrationId);
  }

  public async optimizeDatabase(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    logger.info('Starting database optimization...');

    try {
      // Analyze and optimize each collection
      const collections = ['users', 'companies', 'analyticsevents'];

      for (const collection of collections) {
        logger.info(`Optimizing collection: ${collection}`);
        const result = await this.queryOptimizer.optimizeCollection(collection);
        logger.info(`Collection optimization completed: ${collection}`, result);
      }

      // Analyze index usage
      const indexAnalysis = await this.indexManager.analyzeIndexUsage();
      logger.info('Index usage analysis completed', indexAnalysis);

      // Generate performance report
      const report = await this.performanceMonitor.generatePerformanceReport();
      logger.info('Performance report generated', report);

      logger.info('Database optimization completed');
    } catch (error) {
      logger.error('Database optimization failed:', error);
      throw error;
    }
  }

  public async getHealthStatus(): Promise<{
    connected: boolean;
    initialized: boolean;
    connectionPool: any;
    connectionHealth: any;
    connectionMetrics: any;
    collections: any[];
    migrations: any;
    performance: any;
    alerts: any[];
    diagnostics?: any;
  }> {
    const healthStatus = {
      connected: this.isConnected,
      initialized: this.isInitialized,
      connectionPool: this.isConnected ? getConnectionPoolStats() : null,
      connectionHealth: this.isConnected ? getConnectionHealth() : null,
      connectionMetrics: this.isConnected ? getConnectionMetrics() : null,
      collections: [],
      migrations: null,
      performance: null,
      alerts: [],
      diagnostics: undefined as any
    };

    if (this.isConnected) {
      try {
        // Get collection stats
        const collections = ['users', 'companies', 'analyticsevents', 'orders', 'rfqs', 'products'];
        for (const collection of collections) {
          try {
            const stats = await this.queryOptimizer.getQueryStats(collection);
            healthStatus.collections.push(stats);
          } catch (error) {
            logger.debug(`Failed to get stats for collection ${collection}:`, error);
          }
        }

        // Get migration status
        healthStatus.migrations = await this.migrationManager.getMigrationStatus();

        // Get performance metrics
        const performanceHistory = this.performanceMonitor.getPerformanceHistory(1);
        healthStatus.performance = performanceHistory[0] || null;

        // Get unresolved alerts
        healthStatus.alerts = this.performanceMonitor.getAlerts(false);

        // Run diagnostics if requested
        if (process.env.DB_ENABLE_DIAGNOSTICS === 'true') {
          healthStatus.diagnostics = await runConnectionDiagnostics();
        }
      } catch (error) {
        logger.error('Failed to get health status:', error);
      }
    }

    return healthStatus;
  }

  private startConnectionMonitoring(): void {
    const interval = parseInt(process.env.DB_CONNECTION_MONITOR_INTERVAL || '30000');

    this.connectionMonitorInterval = setInterval(async () => {
      try {
        const poolStats = getConnectionPoolStats();
        const health = getConnectionHealth();

        // Log connection metrics
        logger.debug('Connection pool status:', poolStats);

        // Alert on connection issues
        if (!health.isConnected) {
          logger.error('Database connection lost');
          this.performanceMonitor.createAlert({
            type: 'error',
            message: 'Database connection lost',
            metadata: {
              lastError: poolStats.lastError
            }
          });
        } else if (!health.isHeartbeatHealthy) {
          logger.warn('Database heartbeat unhealthy', {
            heartbeatAge: health.heartbeatAge
          });
          this.performanceMonitor.createAlert({
            type: 'warning',
            message: 'Database heartbeat unhealthy',
            metadata: {
              heartbeatAge: health.heartbeatAge
            }
          });
        }

        // Alert on connection pool exhaustion
        if (health.connectionPool.available === 0 && health.connectionPool.waitQueue > 0) {
          logger.warn('Connection pool exhausted', health.connectionPool);
          this.performanceMonitor.createAlert({
            type: 'warning',
            message: 'Connection pool exhausted',
            metadata: health.connectionPool
          });
        }
      } catch (error) {
        logger.error('Error in connection monitoring:', error);
      }
    }, interval);
  }

  private stopConnectionMonitoring(): void {
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
    }
  }

  private startHealthCheckMonitoring(): void {
    const interval = parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '60000');

    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        if (!health.isHealthy) {
          logger.error('Database health check failed:', health.issues);
          this.performanceMonitor.createAlert({
            type: 'error',
            message: 'Database health check failed',
            metadata: health
          });
        }
      } catch (error) {
        logger.error('Error in health check monitoring:', error);
      }
    }, interval);
  }

  private stopHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthCheck(): Promise<{
    isHealthy: boolean;
    timestamp: Date;
    checks: any[];
    issues: string[];
  }> {
    const health = {
      isHealthy: true,
      timestamp: new Date(),
      checks: [] as any[],
      issues: [] as string[]
    };

    // Check connection status
    const connectionHealth = getConnectionHealth();
    health.checks.push({
      name: 'connection',
      status: connectionHealth.isConnected ? 'pass' : 'fail',
      details: connectionHealth
    });

    if (!connectionHealth.isConnected) {
      health.isHealthy = false;
      health.issues.push('Database connection is down');
    }

    // Check heartbeat
    if (!connectionHealth.isHeartbeatHealthy) {
      health.isHealthy = false;
      health.issues.push('Database heartbeat is unhealthy');
    }

    // Check connection pool
    const poolUtilization = connectionHealth.connectionPool.total > 0 ?
      connectionHealth.connectionPool.inUse / connectionHealth.connectionPool.total : 0;

    health.checks.push({
      name: 'connection_pool',
      status: poolUtilization < 0.9 ? 'pass' : 'warn',
      utilization: poolUtilization,
      details: connectionHealth.connectionPool
    });

    if (poolUtilization > 0.9) {
      health.issues.push('Connection pool utilization is high');
    }

    // Check query performance
    try {
      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const pingTime = Date.now() - startTime;

      health.checks.push({
        name: 'ping',
        status: pingTime < 100 ? 'pass' : 'warn',
        responseTime: pingTime
      });

      if (pingTime > 100) {
        health.issues.push(`Database ping time is high: ${pingTime}ms`);
      }
    } catch (error) {
      health.isHealthy = false;
      health.checks.push({
        name: 'ping',
        status: 'fail',
        error: (error as Error).message
      });
      health.issues.push('Database ping failed');
    }

    return health;
  }

  public getIndexManager(): IndexManager {
    return this.indexManager;
  }

  public getMigrationManager(): MigrationManager {
    return this.migrationManager;
  }

  public getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  public getQueryOptimizer(): QueryOptimizer {
    return this.queryOptimizer;
  }

  public isConnectionActive(): boolean {
    return this.isConnected;
  }

  public isSystemInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const databaseManager = DatabaseManager.getInstance();

// Export connection helper for backward compatibility
export const connectDatabase = async (): Promise<void> => {
  await databaseManager.connect();
};

export const disconnectDatabase = async (): Promise<void> => {
  await databaseManager.disconnect();
};

// Legacy export for backward compatibility
const connectDB = async () => {
  await databaseManager.connect();
  return mongoose.connection;
};

export default connectDB;

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down database gracefully...');
  await databaseManager.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down database gracefully...');
  await databaseManager.disconnect();
  process.exit(0);
});
