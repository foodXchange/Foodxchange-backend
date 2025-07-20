import { setupTestEnvironment, teardownTestEnvironment, clearTestDatabase } from './config/testSetup';

// Global test setup
beforeAll(async () => {
  await setupTestEnvironment();
}, 30000);

// Clean up after each test
afterEach(async () => {
  await clearTestDatabase();
});

// Global test teardown
afterAll(async () => {
  await teardownTestEnvironment();
}, 30000);

// Mock external services
jest.mock('../services/email/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true)
}), { virtual: true });

// Mock Azure services
jest.mock('../services/azure/azureServices', () => ({
  analyzeDocument: jest.fn().mockResolvedValue({ success: true, data: {} }),
  processImage: jest.fn().mockResolvedValue({ success: true, data: {} }),
  extractText: jest.fn().mockResolvedValue({ success: true, text: 'sample text' })
}), { virtual: true });

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
        pass: true
      };
    }
    return {
      message: () => `expected ${received} to be a valid ObjectId`,
      pass: false
    };

  }
});

export {};
