import mongoose from 'mongoose';
import { Logger } from '../core/logging/logger';

const logger = new Logger('DatabaseOptimization');

export interface DatabaseConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

export const optimizedMongooseConfig: mongoose.ConnectOptions = {
  // Connection Pool Settings
  maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10'),
  minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '2'),
  maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME || '10000'),
  
  // Connection Settings
  serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '5000'),
  socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000'),
  family: 4, // Use IPv4, skip trying IPv6
  
  // Write Concern
  w: 'majority',
  wtimeoutMS: parseInt(process.env.DB_WRITE_TIMEOUT || '2500'),
  journal: true,
  
  // Read Preference
  readPreference: 'primaryPreferred',
  readConcern: { level: 'majority' },
  
  // Retry Settings
  retryWrites: true,
  retryReads: true,
  
  // Monitoring
  monitorCommands: process.env.NODE_ENV === 'development',
  
  // Compression
  compressors: ['zlib'],
  zlibCompressionLevel: 4
};

export const createDatabaseConnection = async (config: DatabaseConfig): Promise<typeof mongoose> => {
  try {
    // Set up connection event handlers
    mongoose.connection.on('connecting', () => {
      logger.info('Connecting to MongoDB...');
    });

    mongoose.connection.on('connected', () => {
      logger.info('Successfully connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Monitor connection pool
    mongoose.connection.on('serverOpening', () => {
      logger.debug('MongoDB server opening connection');
    });

    mongoose.connection.on('serverClosed', () => {
      logger.debug('MongoDB server closed connection');
    });

    // Connect with optimized settings
    await mongoose.connect(config.uri, {
      ...optimizedMongooseConfig,
      ...config.options
    });

    // Enable query profiling in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', (collectionName: string, method: string, query: any, doc: any) => {
        logger.debug(`MongoDB Query: ${collectionName}.${method}`, { query, doc });
      });
    }

    // Set up automatic index building
    mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

    return mongoose;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

// Connection pool monitoring
export const getConnectionPoolStats = () => {
  const stats = {
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
  
  return stats;
};

// Graceful shutdown
export const closeDatabaseConnection = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed gracefully');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
};