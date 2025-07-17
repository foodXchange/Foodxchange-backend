import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Setup test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.BCRYPT_ROUNDS = '10';
process.env.MONGODB_URI = 'mongodb://localhost:27017/foodxchange-test';

let mongoServer: MongoMemoryServer;

// Global test setup
beforeAll(async () => {
  try {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to test database
    await mongoose.connect(mongoUri);
    
    console.log('Connected to test database');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    process.exit(1);
  }
});

// Clean up after each test
afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
});

// Global test teardown
afterAll(async () => {
  try {
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('Test database connection closed');
  } catch (error) {
    console.error('Failed to close test database:', error);
  }
});

// Mock external services
jest.mock('../services/email/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/azure/azureServices', () => ({
  analyzeDocument: jest.fn().mockResolvedValue({ success: true, data: {} }),
  processImage: jest.fn().mockResolvedValue({ success: true, data: {} }),
  extractText: jest.fn().mockResolvedValue({ success: true, text: 'sample text' })
}));

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidObjectId(): R;
    }
  }
}

expect.extend({
  toBeValidObjectId(received) {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(received);
    if (isValidObjectId) {
      return {
        message: () => `expected ${received} not to be a valid ObjectId`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid ObjectId`,
        pass: false,
      };
    }
  },
});

export {};