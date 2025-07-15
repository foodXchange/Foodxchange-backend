import mongoose from 'mongoose';
import { Logger } from '../core/logging/logger';
import { createDatabaseConnection, closeDatabaseConnection } from './database-optimization';
import { IndexManager } from '../services/database/IndexManager';
import { MigrationManager } from '../services/database/MigrationManager';
import { PerformanceMonitor } from '../services/database/PerformanceMonitor';
import { QueryOptimizer } from '../services/database/QueryOptimizer';

const logger = new Logger('Database');

export class DatabaseManager {
  private static instance: DatabaseManager;
  private indexManager: IndexManager;
  private migrationManager: MigrationManager;
  private performanceMonitor: PerformanceMonitor;
  private queryOptimizer: QueryOptimizer;
  private isConnected = false;
  private isInitialized = false;

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

      // Run migrations first
      await this.migrationManager.runMigrations();

      // Enable query profiling in development
      if (process.env.NODE_ENV === 'development') {
        await this.queryOptimizer.enableProfiling(100);
      }

      // Start performance monitoring
      const monitoringInterval = parseInt(process.env.DB_MONITORING_INTERVAL || '60000');
      this.performanceMonitor.startMonitoring(monitoringInterval);

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
      // Stop performance monitoring
      this.performanceMonitor.stopMonitoring();

      // Disable query profiling
      if (process.env.NODE_ENV === 'development') {
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
    collections: any[];
    migrations: any;
    performance: any;
    alerts: any[];
  }> {
    const healthStatus = {
      connected: this.isConnected,
      initialized: this.isInitialized,
      connectionPool: this.isConnected ? this.getConnectionPoolStatus() : null,
      collections: [],
      migrations: null,
      performance: null,
      alerts: []
    };

    if (this.isConnected) {
      try {
        // Get collection stats
        const collections = ['users', 'companies', 'analyticsevents'];
        for (const collection of collections) {
          const stats = await this.queryOptimizer.getQueryStats(collection);
          healthStatus.collections.push(stats);
        }

        // Get migration status
        healthStatus.migrations = await this.migrationManager.getMigrationStatus();

        // Get performance metrics
        const performanceHistory = this.performanceMonitor.getPerformanceHistory(1);
        healthStatus.performance = performanceHistory[0] || null;

        // Get unresolved alerts
        healthStatus.alerts = this.performanceMonitor.getAlerts(false);
      } catch (error) {
        logger.error('Failed to get health status:', error);
      }
    }

    return healthStatus;
  }

  private getConnectionPoolStatus(): any {
    const connection = mongoose.connection;
    return {
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name,
      states: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }[connection.readyState]
    };
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