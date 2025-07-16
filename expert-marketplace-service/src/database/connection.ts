import mongoose from 'mongoose';
import { config } from '../config';
import { Logger } from '../utils/logger';

const logger = new Logger('Database');

export const connectDatabase = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);
    
    await mongoose.connect(config.database.uri, {
      maxPoolSize: config.database.poolSize,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('MongoDB connected successfully');

    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
    throw error;
  }
};