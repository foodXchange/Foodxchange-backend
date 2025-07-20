import 'reflect-metadata';
import { config } from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Load test environment variables
config({ path: '.env.test' });

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock process.env with test values
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BCRYPT_ROUNDS = '4'; // Lower for faster tests
process.env.MAX_LOGIN_ATTEMPTS = '5';

// Mock external services
jest.mock('../services/email/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
    sendWelcomeEmail: jest.fn().mockResolvedValue(true)
  }))
}));

jest.mock('../services/cache/MultiLevelCacheService', () => ({
  multiLevelCache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    clear: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../core/metrics/MetricsService', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    incrementCounter: jest.fn(),
    recordTimer: jest.fn(),
    recordGauge: jest.fn(),
    recordHistogram: jest.fn()
  }))
}));

jest.mock('../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }))
}));

// Global test timeout
jest.setTimeout(10000);

// Setup global test hooks
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Custom matchers
expect.extend({
  toBeValidObjectId(received) {
    const pass = /^[0-9a-fA-F]{24}$/.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid ObjectId`,
        pass: true
      };
    }
    return {
      message: () => `expected ${received} to be a valid ObjectId`,
      pass: false
    };

  },

  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid email`,
        pass: true
      };
    }
    return {
      message: () => `expected ${received} to be a valid email`,
      pass: false
    };

  },

  toBeValidJWT(received) {
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    const pass = jwtRegex.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid JWT`,
        pass: true
      };
    }
    return {
      message: () => `expected ${received} to be a valid JWT`,
      pass: false
    };

  }
});

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidObjectId(): R;
      toBeValidEmail(): R;
      toBeValidJWT(): R;
    }
  }
}

// Helper functions for tests
export const createMockRequest = (overrides: any = {}): any => ({
  body: {},
  query: {},
  params: {},
  headers: {},
  user: null,
  ip: '127.0.0.1',
  method: 'GET',
  path: '/test',
  url: '/test',
  get: jest.fn(),
  ...overrides
});

export const createMockResponse = (overrides: any = {}): any => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  cookie: jest.fn().mockReturnThis(),
  clearCookie: jest.fn().mockReturnThis(),
  redirect: jest.fn().mockReturnThis(),
  setHeader: jest.fn().mockReturnThis(),
  removeHeader: jest.fn().mockReturnThis(),
  get: jest.fn(),
  success: jest.fn().mockReturnThis(),
  error: jest.fn().mockReturnThis(),
  ...overrides
});

export const createMockNext = (): jest.MockedFunction<any> => jest.fn();

// Test data factories
export const createTestUser = (overrides: any = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
  password: 'hashedPassword',
  role: 'buyer',
  isEmailVerified: true,
  companyVerified: false,
  onboardingStep: 'email-verification',
  profileCompletionPercentage: 60,
  accountStatus: 'active',
  failedLoginAttempts: 0,
  loginCount: 0,
  preferences: {
    notifications: {
      email: true,
      sms: false,
      push: true
    },
    language: 'en',
    timezone: 'UTC'
  },
  verificationDocuments: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createTestCompany = (overrides: any = {}) => ({
  _id: '507f1f77bcf86cd799439012',
  name: 'Test Company',
  size: '50-200',
  industry: 'Food Import',
  businessType: 'restaurant',
  verificationStatus: 'pending',
  website: 'https://example.com',
  description: 'A test company',
  address: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zipCode: '12345',
    country: 'US'
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

export const createTestAuthTokens = () => ({
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiYnV5ZXIiLCJpYXQiOjE2MzQxMjM0NTYsImV4cCI6MTYzNDEyNzA1Nn0.test',
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTYzNDEyMzQ1NiwiZXhwIjoxNjM0NzI4MjU2fQ.test'
});

// Database helpers
export const clearDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
};

export const closeDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
};
