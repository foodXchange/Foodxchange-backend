import mongoose from 'mongoose';
import { config } from '../config';
import { productionLogger } from '../utils/productionLogger';
import { circuitBreakers } from '../utils/circuitBreaker';

export interface DatabaseMetrics {
  connectionsCreated: number;
  connectionsDestroyed: number;
  connectionsActive: number;
  connectionsAvailable: number;
  queriesExecuted: number;
  queryErrors: number;
  averageQueryTime: number;
}

export class ProductionDatabaseConnection {
  private static instance: ProductionDatabaseConnection;
  private metrics: DatabaseMetrics = {
    connectionsCreated: 0,
    connectionsDestroyed: 0,
    connectionsActive: 0,
    connectionsAvailable: 0,
    queriesExecuted: 0,
    queryErrors: 0,
    averageQueryTime: 0
  };
  private queryTimes: number[] = [];
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  private constructor() {}

  static getInstance(): ProductionDatabaseConnection {
    if (!ProductionDatabaseConnection.instance) {
      ProductionDatabaseConnection.instance = new ProductionDatabaseConnection();
    }
    return ProductionDatabaseConnection.instance;
  }

  async connect(): Promise<void> {
    try {
      await circuitBreakers.database.execute(async () => {
        await this.performConnection();
      });
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      productionLogger.info('Database connected successfully', {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      });
    } catch (error) {
      productionLogger.error('Database connection failed', { 
        error: error.message,
        attempts: this.reconnectAttempts
      });
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        productionLogger.info(`Retrying database connection in ${delay}ms`, {
          attempt: this.reconnectAttempts,
          maxAttempts: this.maxReconnectAttempts
        });
        
        setTimeout(() => this.connect(), delay);
      } else {
        productionLogger.error('Max database reconnection attempts reached', {
          maxAttempts: this.maxReconnectAttempts
        });
        throw error;
      }
    }
  }

  private async performConnection(): Promise<void> {
    const options: mongoose.ConnectOptions = {
      // Connection pooling
      maxPoolSize: config.database.poolSize || 10,
      minPoolSize: 2,
      maxIdleTimeMS: 300000, // 5 minutes
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
      
      // Buffering
      bufferCommands: false,
      
      // Write concern
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 5000
      },
      
      // Read preference
      readPreference: 'secondaryPreferred',
      
      // Compression
      compressors: ['zlib'],
      
      // Monitoring
      monitorCommands: true,
    };

    await mongoose.connect(config.database.uri, options);
    this.setupEventListeners();
    this.setupQueryMonitoring();
  }

  private setupEventListeners(): void {
    const connection = mongoose.connection;

    connection.on('connected', () => {
      this.metrics.connectionsCreated++;
      productionLogger.info('Database connection established');
    });

    connection.on('disconnected', () => {
      this.metrics.connectionsDestroyed++;
      this.isConnected = false;
      productionLogger.warn('Database connection lost');
      
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.connect();
      }
    });

    connection.on('error', (error) => {
      this.metrics.queryErrors++;
      productionLogger.error('Database connection error', { error: error.message });
    });

    connection.on('reconnected', () => {
      this.isConnected = true;
      productionLogger.info('Database reconnected successfully');
    });

    // Connection pool events
    connection.on('fullsetup', () => {
      productionLogger.info('Database replica set connection established');
    });

    connection.on('timeout', () => {
      productionLogger.warn('Database connection timeout');
    });

    connection.on('close', () => {
      productionLogger.info('Database connection closed');
    });
  }

  private setupQueryMonitoring(): void {
    mongoose.connection.on('commandStarted', (event) => {
      this.metrics.queriesExecuted++;
      // Store query start time for performance tracking
      const queryId = event.requestId;
      mongoose.connection.db.admin().command = mongoose.connection.db.admin().command || {};
      (mongoose.connection.db.admin().command as any)[queryId] = Date.now();
    });

    mongoose.connection.on('commandSucceeded', (event) => {
      const queryId = event.requestId;
      const startTime = (mongoose.connection.db.admin().command as any)?.[queryId];
      
      if (startTime) {
        const duration = Date.now() - startTime;
        this.queryTimes.push(duration);
        
        // Keep only last 1000 query times
        if (this.queryTimes.length > 1000) {
          this.queryTimes = this.queryTimes.slice(-1000);
        }
        
        // Calculate average query time
        this.metrics.averageQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;
        
        // Log slow queries
        if (duration > 1000) {
          productionLogger.warn('Slow database query detected', {
            command: event.commandName,
            collection: event.command?.collection,
            duration,
            queryId
          });
        }
        
        // Clean up
        delete (mongoose.connection.db.admin().command as any)[queryId];
      }
    });

    mongoose.connection.on('commandFailed', (event) => {
      this.metrics.queryErrors++;
      productionLogger.error('Database query failed', {
        command: event.commandName,
        error: event.failure,
        queryId: event.requestId
      });
    });
  }

  async gracefulShutdown(): Promise<void> {
    try {
      productionLogger.info('Initiating graceful database shutdown');
      
      // Wait for pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close the connection
      await mongoose.connection.close();
      
      productionLogger.info('Database connection closed gracefully');
    } catch (error) {
      productionLogger.error('Error during database shutdown', { error: error.message });
      throw error;
    }
  }

  getMetrics(): DatabaseMetrics {
    return {
      ...this.metrics,
      connectionsActive: mongoose.connection.readyState === 1 ? 1 : 0,
      connectionsAvailable: mongoose.connection.readyState === 1 ? 1 : 0
    };
  }

  isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  // Transaction helper with retry logic
  async withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession();
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const result = await session.withTransaction(fn, {
          readPreference: 'primary',
          readConcern: { level: 'local' },
          writeConcern: { w: 'majority', j: true }
        });
        
        return result;
      } catch (error) {
        retryCount++;
        
        if (retryCount >= maxRetries) {
          productionLogger.error('Transaction failed after max retries', {
            error: error.message,
            retryCount,
            maxRetries
          });
          throw error;
        }
        
        // Check if error is retryable
        if (error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError')) {
          productionLogger.warn('Retrying transaction due to transient error', {
            error: error.message,
            retryCount,
            maxRetries
          });
          
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  }

  // Bulk operations with error handling
  async bulkWrite(model: mongoose.Model<any>, operations: any[]): Promise<any> {
    try {
      const result = await model.bulkWrite(operations, {
        ordered: false,
        writeConcern: { w: 'majority', j: true }
      });
      
      productionLogger.info('Bulk write operation completed', {
        model: model.modelName,
        operationsCount: operations.length,
        insertedCount: result.insertedCount,
        modifiedCount: result.modifiedCount,
        deletedCount: result.deletedCount
      });
      
      return result;
    } catch (error) {
      productionLogger.error('Bulk write operation failed', {
        model: model.modelName,
        operationsCount: operations.length,
        error: error.message
      });
      throw error;
    }
  }

  // Index management
  async ensureIndexes(): Promise<void> {
    try {
      const models = mongoose.models;
      
      for (const [modelName, model] of Object.entries(models)) {
        try {
          await model.ensureIndexes();
          productionLogger.info(`Indexes ensured for model: ${modelName}`);
        } catch (error) {
          productionLogger.error(`Failed to ensure indexes for model: ${modelName}`, {
            error: error.message
          });
        }
      }
    } catch (error) {
      productionLogger.error('Error ensuring indexes', { error: error.message });
      throw error;
    }
  }

  // Connection status check
  async ping(): Promise<boolean> {
    try {
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      productionLogger.error('Database ping failed', { error: error.message });
      return false;
    }
  }
}

export const productionDatabase = ProductionDatabaseConnection.getInstance();