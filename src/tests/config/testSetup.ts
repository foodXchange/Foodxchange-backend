import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { notificationIntegrationService } from '../../services/notifications/NotificationIntegrationService';

let mongoServer: MongoMemoryServer;

export const setupTestEnvironment = async (): Promise<void> => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
  process.env.BCRYPT_ROUNDS = '10';

  // Mock external services environment variables
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = '/mock/path/to/firebase-service-account.json';
  process.env.APN_KEY_PATH = '/mock/path/to/AuthKey_XXXXXXXXXX.p8';
  process.env.APN_KEY_ID = 'MOCK_KEY_ID';
  process.env.APN_TEAM_ID = 'MOCK_TEAM_ID';
  process.env.APN_BUNDLE_ID = 'com.foodxchange.test';
  process.env.VAPID_PUBLIC_KEY = 'mock-vapid-public-key';
  process.env.VAPID_PRIVATE_KEY = 'mock-vapid-private-key';
  process.env.VAPID_SUBJECT = 'mailto:test@foodxchange.com';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.TZ = 'UTC';

  try {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'foodxchange-test'
      }
    });

    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    // Connect to the test database
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });

    console.log('✅ Test database connected successfully');

    // Initialize notification services for testing
    await notificationIntegrationService.initialize();
    console.log('✅ Notification services initialized for testing');

  } catch (error) {
    console.error('❌ Failed to setup test environment:', error);
    throw error;
  }
};

export const teardownTestEnvironment = async (): Promise<void> => {
  try {
    // Stop notification services
    await notificationIntegrationService.stop();

    // Close database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    // Stop MongoDB memory server
    if (mongoServer) {
      await mongoServer.stop();
    }

    console.log('✅ Test environment cleaned up successfully');

  } catch (error) {
    console.error('❌ Failed to cleanup test environment:', error);
    throw error;
  }
};

export const clearTestDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    const {collections} = mongoose.connection;

    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
};

export const getTestDatabaseConnection = () => {
  return mongoose.connection;
};

export const isTestEnvironment = (): boolean => {
  return process.env.NODE_ENV === 'test';
};
