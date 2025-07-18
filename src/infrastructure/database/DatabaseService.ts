/**
 * Enterprise-grade Database Service
 * Provides connection management, monitoring, and utilities for MongoDB
 */

import mongoose, { Connection, ConnectOptions, ClientSession } from 'mongoose';
import { config } from '../../core/config';
import { Logger } from '../../core/logging/logger';
import { SystemError } from '../../core/errors';
import { MetricsService } from '../monitoring/MetricsService';

const logger = new Logger('DatabaseService');
const metrics = metricsService;

export interface DatabaseConfig {
  uri: string;
  options?: ConnectOptions;
  debug?: boolean;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private connection: Connection | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectInterval = 5000; // 5 seconds
  private healthCheckInterval: NodeJS.Timer | null = null;

  private constructor() {
    this.setupEventHandlers();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Connection management
  public async connect(customConfig?: DatabaseConfig): Promise<void> {
    if (this.isConnected) {
      logger.warn('Database already connected');
      return;
    }

    const dbConfig = customConfig || {
      uri: config.database.uri,
      options: {
        ...config.database.options,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      } as ConnectOptions,
    };

    try {
      logger.info('Connecting to MongoDB', { uri: this.sanitizeUri(dbConfig.uri) });
      
      // Enable debug mode if configured
      if (dbConfig.debug || config.env === 'development') {
        mongoose.set('debug', (collectionName: string, method: string, ...args: any[]) => {
          logger.debug('MongoDB query', {
            collection: collectionName,
            method,
            args: args.length > 0 ? args : undefined,
          });
        });
      }

      // Set up query monitoring
      this.setupQueryMonitoring();

      // Connect to MongoDB
      await mongoose.connect(dbConfig.uri, dbConfig.options);
      
      this.connection = mongoose.connection;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('MongoDB connected successfully', {
        host: this.connection.host,
        port: this.connection.port,
        name: this.connection.name,
      });

      // Start health check
      this.startHealthCheck();
      
      // Record successful connection
      metrics.recordBusinessEvent('database.connected');
    } catch (error) {
      logger.error('MongoDB connection failed', error);
      metrics.recordBusinessEvent('database.connection_failed');
      throw new SystemError('Database connection failed', undefined, { error: error.message });
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;
      this.stopHealthCheck();
      logger.info('MongoDB disconnected');
      metrics.recordBusinessEvent('database.disconnected');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', error);
      throw new SystemError('Database disconnection failed', undefined, { error: error.message });
    }
  }

  // Transaction support
  public async withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
    options?: mongoose.ClientSessionOptions
  ): Promise<T> {
    const session = await mongoose.startSession(options);
    
    try {
      const result = await session.withTransaction(async () => {
        return operation(session);
      });
      
      metrics.increment('database.transactions.success');
      return result;
    } catch (error) {
      metrics.increment('database.transactions.failed');
      logger.error('Transaction failed', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  // Health check
  public async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    latency?: number;
    details?: any;
  }> {
    if (!this.isConnected || !this.connection) {
      return {
        healthy: false,
        status: 'disconnected',
      };
    }

    const startTime = Date.now();
    
    try {
      // Ping the database
      await this.connection.db.admin().ping();
      const latency = Date.now() - startTime;
      
      // Get connection stats
      const stats = {
        readyState: this.connection.readyState,
        host: this.connection.host,
        port: this.connection.port,
        name: this.connection.name,
      };
      
      metrics.recordHealthCheck('database', true, latency);
      
      return {
        healthy: true,
        status: 'connected',
        latency,
        details: stats,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      metrics.recordHealthCheck('database', false, latency);
      
      return {
        healthy: false,
        status: 'error',
        latency,
        details: { error: error.message },
      };
    }
  }

  // Database statistics
  public async getStats(): Promise<any> {
    if (!this.connection) {
      throw new SystemError('Database not connected');
    }

    try {
      const adminDb = this.connection.db.admin();
      const [serverStatus, dbStats] = await Promise.all([
        adminDb.serverStatus(),
        this.connection.db.stats(),
      ]);

      return {
        server: {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections,
          opcounters: serverStatus.opcounters,
        },
        database: {
          collections: dbStats.collections,
          indexes: dbStats.indexes,
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          avgObjSize: dbStats.avgObjSize,
        },
      };
    } catch (error) {
      logger.error('Failed to get database stats', error);
      throw new SystemError('Failed to retrieve database statistics');
    }
  }

  // Utility methods
  public getConnection(): Connection | null {
    return this.connection;
  }

  public isHealthy(): boolean {
    return this.isConnected && this.connection?.readyState === 1;
  }

  // Private methods
  private setupEventHandlers(): void {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB event: connected');
      this.isConnected = true;
      metrics.gauge('database.connected', 1);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB event: disconnected');
      this.isConnected = false;
      metrics.gauge('database.connected', 0);
      this.attemptReconnect();
    });

    mongoose.connection.on('error', (error: Error) => {
      logger.error('MongoDB event: error', error);
      metrics.increment('database.errors');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB event: reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      metrics.gauge('database.connected', 1);
    });
  }

  private setupQueryMonitoring(): void {
    // Monitor slow queries
    mongoose.plugin((schema: any) => {
      schema.pre(/^find/, function(this: any) {
        this._startTime = Date.now();
      });

      schema.post(/^find/, function(this: any) {
        if (this._startTime) {
          const duration = Date.now() - this._startTime;
          const collection = this.mongooseCollection?.name || 'unknown';
          
          metrics.recordDatabaseQuery('find', collection, duration, true);
          
          if (duration > 1000) { // Log slow queries (> 1 second)
            logger.warn('Slow query detected', {
              collection,
              duration,
              query: this.getQuery(),
            });
          }
        }
      });

      // Monitor save operations
      schema.pre('save', function(this: any) {
        this._startTime = Date.now();
      });

      schema.post('save', function(this: any) {
        if (this._startTime) {
          const duration = Date.now() - this._startTime;
          const collection = this.constructor.collection?.name || 'unknown';
          metrics.recordDatabaseQuery('save', collection, duration, true);
        }
      });
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection attempt failed', error);
      }
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.healthCheck();
    }, 30000); // Every 30 seconds
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private sanitizeUri(uri: string): string {
    // Remove password from URI for logging
    return uri.replace(/:([^@]+)@/, ':****@');
  }

  // Index management
  public async ensureIndexes(): Promise<void> {
    if (!this.connection) {
      throw new SystemError('Database not connected');
    }

    logger.info('Ensuring database indexes');
    
    try {
      // Get all models
      const modelNames = mongoose.modelNames();
      
      for (const modelName of modelNames) {
        const model = mongoose.model(modelName);
        await model.ensureIndexes();
        logger.debug(`Indexes ensured for model: ${modelName}`);
      }
      
      logger.info('All database indexes ensured');
      metrics.recordBusinessEvent('database.indexes_ensured');
    } catch (error) {
      logger.error('Failed to ensure indexes', error);
      throw new SystemError('Failed to ensure database indexes');
    }
  }

  // Backup utilities
  public async exportCollection(collectionName: string): Promise<any[]> {
    if (!this.connection) {
      throw new SystemError('Database not connected');
    }

    try {
      const collection = this.connection.db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      logger.info(`Exported ${documents.length} documents from ${collectionName}`);
      return documents;
    } catch (error) {
      logger.error(`Failed to export collection ${collectionName}`, error);
      throw new SystemError(`Failed to export collection: ${collectionName}`);
    }
  }
}

// Export singleton instance
export default DatabaseService.getInstance();