import mongoose from 'mongoose';

import { Logger } from '../core/logging/logger';

import { databaseConfigManager, type EnvironmentDatabaseConfig } from './database-config';

const logger = new Logger('DatabaseOptimization');

export interface DatabaseConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

export interface ConnectionMetrics {
  totalConnections: number;
  availableConnections: number;
  waitQueueSize: number;
  activeOperations: number;
  lastHeartbeat: Date;
}

export const optimizedMongooseConfig: mongoose.ConnectOptions = {
  // Connection Pool Settings - Optimized for production
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || process.env.NODE_ENV === 'production' ? '50' : '10'),
  minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || process.env.NODE_ENV === 'production' ? '10' : '2'),
  maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME || '10000'),
  waitQueueTimeoutMS: parseInt(process.env.DB_WAIT_QUEUE_TIMEOUT || '5000'),

  // Connection Settings
  serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '5000'),
  socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000'),
  connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000'),
  heartbeatFrequencyMS: parseInt(process.env.DB_HEARTBEAT_FREQUENCY || '10000'),
  family: 4, // Use IPv4, skip trying IPv6

  // Write Concern - Configurable per environment
  w: (process.env.DB_WRITE_CONCERN || 'majority') as any,
  wtimeoutMS: parseInt(process.env.DB_WRITE_TIMEOUT || '2500'),
  journal: process.env.DB_JOURNAL !== 'false',

  // Read Preference - Optimized for performance
  readPreference: (process.env.DB_READ_PREFERENCE || 'primaryPreferred') as any,
  readConcern: { level: (process.env.DB_READ_CONCERN_LEVEL || 'majority') as any } as any,
  maxStalenessSeconds: parseInt(process.env.DB_MAX_STALENESS_SECONDS || '90'),

  // Retry Settings
  retryWrites: process.env.DB_RETRY_WRITES !== 'false',
  retryReads: process.env.DB_RETRY_READS !== 'false',

  // Monitoring
  monitorCommands: process.env.DB_MONITOR_COMMANDS === 'true' || process.env.NODE_ENV === 'development',

  // Compression - Optimized settings
  compressors: (process.env.DB_COMPRESSORS ? process.env.DB_COMPRESSORS.split(',') : ['zlib', 'snappy']) as any,
  zlibCompressionLevel: parseInt(process.env.DB_ZLIB_COMPRESSION_LEVEL || '4') as any,

  // Authentication
  authSource: process.env.DB_AUTH_SOURCE || 'admin',

  // TLS/SSL Settings (for production)
  tls: process.env.DB_TLS === 'true',
  tlsInsecure: process.env.DB_TLS_INSECURE === 'true',
  tlsAllowInvalidCertificates: process.env.DB_TLS_ALLOW_INVALID_CERTS === 'true',
  tlsAllowInvalidHostnames: process.env.DB_TLS_ALLOW_INVALID_HOSTNAMES === 'true',

  // Additional Production Settings
  autoCreate: process.env.NODE_ENV !== 'production',
  autoIndex: process.env.NODE_ENV !== 'production',
  bufferCommands: false,
  directConnection: process.env.DB_DIRECT_CONNECTION === 'true',
  serverApi: process.env.DB_SERVER_API_VERSION ? { version: '1' as const } : undefined
};

// Connection retry configuration
const RETRY_CONFIG = {
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '5'),
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '5000'),
  backoffMultiplier: parseFloat(process.env.DB_BACKOFF_MULTIPLIER || '1.5'),
  maxRetryDelay: parseInt(process.env.DB_MAX_RETRY_DELAY || '30000')
};

// Connection state tracking
let connectionAttempts = 0;
let lastConnectionError: Error | null = null;
let connectionMetrics: ConnectionMetrics = {
  totalConnections: 0,
  availableConnections: 0,
  waitQueueSize: 0,
  activeOperations: 0,
  lastHeartbeat: new Date()
};

export const createDatabaseConnection = async (config: DatabaseConfig): Promise<typeof mongoose> => {
  // Get environment-specific configuration
  const envConfig = databaseConfigManager.getConfigForEnvironment();
  const validation = databaseConfigManager.validateConfiguration(envConfig);

  // Log validation results
  if (validation.warnings.length > 0) {
    logger.warn('Database configuration warnings:', validation.warnings);
  }

  if (validation.errors.length > 0) {
    logger.error('Database configuration errors:', validation.errors);
    throw new Error(`Database configuration errors: ${validation.errors.join(', ')}`);
  }

  if (validation.recommendations.length > 0) {
    logger.info('Database configuration recommendations:', validation.recommendations);
  }

  // Use environment-specific retry configuration
  const retryConfig = {
    maxRetries: envConfig.retrySettings.maxRetries,
    retryDelay: envConfig.retrySettings.retryDelay,
    backoffMultiplier: envConfig.retrySettings.backoffMultiplier,
    maxRetryDelay: envConfig.retrySettings.maxRetryDelay
  };

  let retryCount = 0;
  let {retryDelay} = retryConfig;

  while (retryCount < retryConfig.maxRetries) {
    try {
      connectionAttempts++;
      logger.info(`Attempting MongoDB connection (attempt ${connectionAttempts}) with ${process.env.NODE_ENV || 'development'} configuration...`);

      // Set up connection event handlers
      setupConnectionEventHandlers(envConfig);

      // Convert environment config to mongoose options
      const mongooseOptions = databaseConfigManager.toMongooseOptions(envConfig);

      // Connect with optimized settings and retry logic
      await mongoose.connect(config.uri || envConfig.uri, {
        ...mongooseOptions,
        ...config.options
      });

      // Setup post-connection configurations
      await setupPostConnectionConfig(envConfig);

      // Reset retry count on successful connection
      retryCount = 0;
      lastConnectionError = null;
      logger.info('MongoDB connection established successfully with optimized configuration');

      return mongoose;
    } catch (error) {
      lastConnectionError = error as Error;
      retryCount++;

      if (retryCount >= retryConfig.maxRetries) {
        logger.error(`Failed to connect to MongoDB after ${retryConfig.maxRetries} attempts:`, error);
        throw error;
      }

      logger.warn(`MongoDB connection failed (attempt ${retryCount}/${retryConfig.maxRetries}). Retrying in ${retryDelay}ms...`, error);

      await new Promise(resolve => setTimeout(resolve, retryDelay));

      // Exponential backoff with jitter
      retryDelay = Math.min(
        retryDelay * retryConfig.backoffMultiplier + Math.random() * 1000,
        retryConfig.maxRetryDelay
      );
    }
  }

  throw new Error('Failed to establish MongoDB connection');
};

function setupConnectionEventHandlers(envConfig: EnvironmentDatabaseConfig): void {
  // Remove existing listeners to prevent duplicates
  mongoose.connection.removeAllListeners();

  mongoose.connection.on('connecting', () => {
    logger.info('Connecting to MongoDB...');
  });

  mongoose.connection.on('connected', () => {
    logger.info('Successfully connected to MongoDB');
    updateConnectionMetrics();
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err);
    lastConnectionError = err;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    connectionMetrics.availableConnections = 0;
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
    updateConnectionMetrics();
  });

  // Monitor connection pool events
  mongoose.connection.on('serverOpening', () => {
    logger.debug('MongoDB server opening connection');
    connectionMetrics.totalConnections++;
  });

  mongoose.connection.on('serverClosed', () => {
    logger.debug('MongoDB server closed connection');
    connectionMetrics.totalConnections = Math.max(0, connectionMetrics.totalConnections - 1);
  });

  // Monitor server heartbeat
  mongoose.connection.on('serverHeartbeatSucceeded', () => {
    connectionMetrics.lastHeartbeat = new Date();
  });

  // Monitor operation execution
  mongoose.connection.on('commandStarted', () => {
    connectionMetrics.activeOperations++;
  });

  mongoose.connection.on('commandSucceeded', () => {
    connectionMetrics.activeOperations = Math.max(0, connectionMetrics.activeOperations - 1);
  });

  mongoose.connection.on('commandFailed', () => {
    connectionMetrics.activeOperations = Math.max(0, connectionMetrics.activeOperations - 1);
  });
}

async function setupPostConnectionConfig(envConfig: EnvironmentDatabaseConfig): Promise<void> {
  // Enable query profiling based on environment configuration
  if (envConfig.monitoringSettings.monitorCommands || envConfig.monitoringSettings.enableProfiling) {
    mongoose.set('debug', (collectionName: string, method: string, query: any, doc: any, startTime: number) => {
      const duration = Date.now() - startTime;
      logger.debug(`MongoDB Query: ${collectionName}.${method} (${duration}ms)`, {
        query,
        doc,
        duration
      });

      // Log slow queries using environment-specific threshold
      if (duration > envConfig.monitoringSettings.slowQueryThreshold) {
        logger.warn(`Slow MongoDB query detected: ${collectionName}.${method} took ${duration}ms`, {
          query,
          threshold: envConfig.monitoringSettings.slowQueryThreshold
        });
      }
    });
  }

  // Set up automatic index building based on environment
  mongoose.set('autoIndex', envConfig.advancedSettings.autoIndex);

  // Set up query middleware for monitoring
  mongoose.plugin((schema: any) => {
    schema.pre(['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'], function() {
      this.startTime = Date.now();
    });

    schema.post(['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany'], function() {
      if (this.startTime) {
        const duration = Date.now() - this.startTime;
        if (duration > envConfig.monitoringSettings.slowQueryThreshold) {
          logger.warn(`Slow query detected: ${this.constructor.modelName || 'Unknown'} operation took ${duration}ms`, {
            operation: this.op || 'unknown',
            duration,
            threshold: envConfig.monitoringSettings.slowQueryThreshold
          });
        }
      }
    });
  });

  // Log configuration summary
  logger.info('Database post-connection configuration applied:', {
    environment: process.env.NODE_ENV || 'development',
    autoIndex: envConfig.advancedSettings.autoIndex,
    queryProfiling: envConfig.monitoringSettings.enableProfiling,
    slowQueryThreshold: envConfig.monitoringSettings.slowQueryThreshold,
    compressionEnabled: envConfig.compressionSettings.compressors.length > 0,
    tlsEnabled: envConfig.securitySettings.tls
  });
}

function updateConnectionMetrics(): void {
  const client = mongoose.connection.getClient();
  if (client) {
    try {
      // MongoDB driver v4+ doesn't expose topology directly
      // Use connection readyState instead
      connectionMetrics.totalConnections = mongoose.connection.readyState === 1 ? 1 : 0;
      connectionMetrics.availableConnections = mongoose.connection.readyState === 1 ? 1 : 0;
    } catch (error) {
      // Fallback to default values
      connectionMetrics.totalConnections = 0;
      connectionMetrics.availableConnections = 0;
    }
  }
}

// Enhanced connection pool monitoring
export const getConnectionPoolStats = () => {
  const readyStateMap: { [key: number]: string } = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const stats = {
    readyState: mongoose.connection.readyState,
    readyStateText: readyStateMap[mongoose.connection.readyState] || 'unknown',
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name,
    connectionAttempts,
    lastError: lastConnectionError?.message || null,
    metrics: { ...connectionMetrics },
    uptime: mongoose.connection.readyState === 1 ?
      Date.now() - connectionMetrics.lastHeartbeat.getTime() : 0
  };

  // Get detailed pool statistics if available
  try {
    const client = mongoose.connection.getClient();
    if (client) {
      // MongoDB driver v4+ doesn't expose topology directly
      (stats as any).topology = {
        type: 'replica-set',
        servers: 1
      };
    }
  } catch (error) {
    logger.debug('Unable to get topology stats:', error);
  }

  return stats;
};

// Get connection health status
export const getConnectionHealth = () => {
  const isHealthy = mongoose.connection.readyState === 1;
  const lastHeartbeatAge = Date.now() - connectionMetrics.lastHeartbeat.getTime();
  const heartbeatThreshold = parseInt(process.env.DB_HEARTBEAT_THRESHOLD || '30000');

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    isConnected: isHealthy,
    lastHeartbeat: connectionMetrics.lastHeartbeat,
    heartbeatAge: lastHeartbeatAge,
    isHeartbeatHealthy: lastHeartbeatAge < heartbeatThreshold,
    connectionPool: {
      total: connectionMetrics.totalConnections,
      available: connectionMetrics.availableConnections,
      inUse: connectionMetrics.totalConnections - connectionMetrics.availableConnections,
      waitQueue: connectionMetrics.waitQueueSize
    },
    activeOperations: connectionMetrics.activeOperations
  };
};

// Connection diagnostics
export const runConnectionDiagnostics = async () => {
  const diagnostics = {
    timestamp: new Date(),
    connection: getConnectionPoolStats(),
    health: getConnectionHealth(),
    performance: {
      pingTime: -1,
      serverInfo: null as any
    },
    errors: [] as string[]
  };

  try {
    // Ping the database
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    diagnostics.performance.pingTime = Date.now() - startTime;

    // Get server info
    diagnostics.performance.serverInfo = await mongoose.connection.db.admin().serverInfo();
  } catch (error) {
    diagnostics.errors.push(`Ping failed: ${(error as Error).message}`);
  }

  return diagnostics;
};

// Graceful shutdown with cleanup
export const closeDatabaseConnection = async (): Promise<void> => {
  try {
    logger.info('Initiating graceful MongoDB shutdown...');

    // Wait for active operations to complete
    const maxWaitTime = parseInt(process.env.DB_SHUTDOWN_TIMEOUT || '30000');
    const startTime = Date.now();

    while (connectionMetrics.activeOperations > 0 && Date.now() - startTime < maxWaitTime) {
      logger.info(`Waiting for ${connectionMetrics.activeOperations} active operations to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (connectionMetrics.activeOperations > 0) {
      logger.warn(`Forcing shutdown with ${connectionMetrics.activeOperations} active operations`);
    }

    // Close all connections
    await mongoose.connection.close();
    logger.info('MongoDB connection closed gracefully');

    // Reset metrics
    connectionMetrics = {
      totalConnections: 0,
      availableConnections: 0,
      waitQueueSize: 0,
      activeOperations: 0,
      lastHeartbeat: new Date()
    };
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
};

// Export connection metrics for monitoring
export const getConnectionMetrics = () => ({ ...connectionMetrics });
