import mongoose from 'mongoose';
import { Logger } from '../core/logging/logger';
import { databaseOptimizationService } from '../services/database/DatabaseOptimizationService';

const logger = new Logger('OptimizedDatabase');

interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

export class OptimizedDatabaseConnection {
  private static instance: OptimizedDatabaseConnection;
  private connectionPool: Map<string, mongoose.Connection> = new Map();
  private primaryConnection: mongoose.Connection | null = null;

  private constructor() {}

  static getInstance(): OptimizedDatabaseConnection {
    if (!OptimizedDatabaseConnection.instance) {
      OptimizedDatabaseConnection.instance = new OptimizedDatabaseConnection();
    }
    return OptimizedDatabaseConnection.instance;
  }

  /**
   * Get optimized connection options
   */
  private getOptimizedOptions(): mongoose.ConnectOptions {
    return {
      // Connection Pool Settings
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '2'),
      
      // Connection Settings
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4
      
      // Write Concern
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 1000
      },
      
      // Read Preference
      readPreference: 'primaryPreferred',
      
      // Retry Options
      retryWrites: true,
      retryReads: true,
      
      // Monitoring
      monitoring: true,
      
      // Compression
      compressors: ['zlib'],
      zlibCompressionLevel: 6,
      
      // Additional Options
      directConnection: false,
      appName: 'FoodXchange-Backend'
    };
  }

  /**
   * Connect to database with optimization
   */
  async connect(uri?: string): Promise<mongoose.Connection> {
    try {
      const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';
      
      logger.info('Connecting to MongoDB with optimized settings...');
      
      // Set mongoose options
      mongoose.set('strictQuery', false);
      mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
      
      // Create connection
      const connection = await mongoose.connect(mongoUri, this.getOptimizedOptions());
      this.primaryConnection = connection.connection;
      
      // Set up connection event handlers
      this.setupEventHandlers(this.primaryConnection);
      
      // Enable profiling in development
      if (process.env.NODE_ENV === 'development') {
        await databaseOptimizationService.enableProfiling(1, 100);
      }
      
      // Create indexes
      await databaseOptimizationService.createIndexes();
      
      // Log connection stats
      await this.logConnectionStats();
      
      logger.info('MongoDB connected successfully with optimization');
      
      return this.primaryConnection;
    } catch (error) {
      logger.error('MongoDB connection error:', error);
      throw error;
    }
  }

  /**
   * Create a separate connection for specific use cases
   */
  async createConnection(name: string, uri: string): Promise<mongoose.Connection> {
    if (this.connectionPool.has(name)) {
      return this.connectionPool.get(name)!;
    }
    
    const connection = mongoose.createConnection(uri, this.getOptimizedOptions());
    this.setupEventHandlers(connection);
    this.connectionPool.set(name, connection);
    
    logger.info(`Created separate connection: ${name}`);
    
    return connection;
  }

  /**
   * Set up event handlers for connection
   */
  private setupEventHandlers(connection: mongoose.Connection): void {
    connection.on('connected', () => {
      logger.info('MongoDB connected');
    });
    
    connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });
    
    connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
    // Monitor slow queries
    connection.on('commandStarted', (event) => {
      if (process.env.LOG_SLOW_QUERIES === 'true') {
        (event as any).startTime = Date.now();
      }
    });
    
    connection.on('commandSucceeded', (event) => {
      if (process.env.LOG_SLOW_QUERIES === 'true') {
        const duration = Date.now() - (event as any).startTime;
        if (duration > 100) { // Log queries slower than 100ms
          logger.warn(`Slow query detected: ${event.commandName} took ${duration}ms`);
        }
      }
    });
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats(): Promise<any> {
    if (!this.primaryConnection) {
      throw new Error('No active connection');
    }
    
    const adminDb = this.primaryConnection.db.admin();
    const serverStatus = await adminDb.serverStatus();
    
    return {
      connections: {
        current: serverStatus.connections.current,
        available: serverStatus.connections.available,
        totalCreated: serverStatus.connections.totalCreated
      },
      network: {
        bytesIn: serverStatus.network.bytesIn,
        bytesOut: serverStatus.network.bytesOut,
        numRequests: serverStatus.network.numRequests
      },
      opcounters: serverStatus.opcounters,
      mem: serverStatus.mem,
      uptime: serverStatus.uptime
    };
  }

  /**
   * Log connection statistics
   */
  private async logConnectionStats(): Promise<void> {
    try {
      const stats = await this.getConnectionStats();
      logger.info('Database connection stats:', {
        currentConnections: stats.connections.current,
        availableConnections: stats.connections.available
      });
    } catch (error) {
      logger.error('Failed to get connection stats:', error);
    }
  }

  /**
   * Optimize collections
   */
  async optimizeCollections(): Promise<void> {
    await databaseOptimizationService.optimizeCollections();
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    // Close primary connection
    if (this.primaryConnection) {
      await this.primaryConnection.close();
    }
    
    // Close all pooled connections
    for (const [name, connection] of this.connectionPool) {
      await connection.close();
      logger.info(`Closed connection: ${name}`);
    }
    
    this.connectionPool.clear();
    logger.info('All database connections closed');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.primaryConnection || this.primaryConnection.readyState !== 1) {
        return false;
      }
      
      // Ping the database
      await this.primaryConnection.db.admin().ping();
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const optimizedDb = OptimizedDatabaseConnection.getInstance();

// Mongoose plugins for optimization

/**
 * Plugin to add lean queries by default for read operations
 */
export const leanPlugin = (schema: mongoose.Schema) => {
  schema.pre(['find', 'findOne', 'findOneAndUpdate'], function() {
    if (!this.getOptions().lean) {
      this.lean();
    }
  });
};

/**
 * Plugin to add pagination support
 */
export const paginationPlugin = (schema: mongoose.Schema) => {
  schema.statics.paginate = async function(
    filter: any = {},
    options: {
      page?: number;
      limit?: number;
      sort?: any;
      populate?: any;
      select?: any;
      lean?: boolean;
    } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;
    
    const query = this.find(filter);
    
    if (options.sort) query.sort(options.sort);
    if (options.populate) query.populate(options.populate);
    if (options.select) query.select(options.select);
    if (options.lean !== false) query.lean();
    
    const [data, total] = await Promise.all([
      query.skip(skip).limit(limit),
      this.countDocuments(filter)
    ]);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  };
};

/**
 * Plugin to add caching support
 */
export const cachePlugin = (schema: mongoose.Schema) => {
  schema.methods.cache = async function(ttl: number = 300) {
    const { optimizedCache } = await import('../services/cache/OptimizedCacheService');
    const key = `model:${this.constructor.modelName}:${this._id}`;
    return optimizedCache.remember(key, async () => this.toObject(), { ttl });
  };
  
  schema.statics.cacheFind = async function(filter: any, ttl: number = 300) {
    const { optimizedCache } = await import('../services/cache/OptimizedCacheService');
    const key = `model:${this.modelName}:find:${JSON.stringify(filter)}`;
    return optimizedCache.remember(key, async () => this.find(filter).lean(), { ttl });
  };
};