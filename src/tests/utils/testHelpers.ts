import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import mongoose from 'mongoose';

import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';

/**
 * Generate a test JWT token
 */
export const generateTestJWT = (userId: string | ObjectId, tenantId: string, role: string): string => {
  const payload = {
    sub: userId.toString(),
    email: 'test@example.com',
    role,
    tenantId,
    companyId: 'test-company-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiry
    type: 'access'
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret-key');
};

/**
 * Generate a test refresh token
 */
export const generateTestRefreshToken = (userId: string | ObjectId, sessionId: string): string => {
  const payload = {
    sub: userId.toString(),
    sessionId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiry
    type: 'refresh'
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-secret-key');
};

/**
 * Create test user data
 */
export const createTestUserData = (overrides = {}) => {
  return {
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashedPassword123',
    role: 'user',
    tenantId: 'test-tenant-123',
    companyId: 'test-company-123',
    isActive: true,
    ...overrides
  };
};

/**
 * Create test company data
 */
export const createTestCompanyData = (overrides = {}) => {
  return {
    name: 'Test Company',
    email: 'company@test.com',
    type: 'buyer',
    tenantId: 'test-tenant-123',
    address: {
      street: '123 Test Street',
      city: 'Test City',
      state: 'TS',
      zipCode: '12345',
      country: 'US'
    },
    isActive: true,
    ...overrides
  };
};

/**
 * Create test product data
 */
export const createTestProductData = (overrides = {}) => {
  return {
    name: 'Test Product',
    description: 'A test product description',
    category: 'vegetables',
    price: 10.99,
    currency: 'USD',
    unit: 'kg',
    minOrderQuantity: 1,
    availability: 'in_stock',
    tenantId: 'test-tenant-123',
    isActive: true,
    ...overrides
  };
};

/**
 * Create test order data
 */
export const createTestOrderData = (overrides = {}) => {
  return {
    orderNumber: 'ORD-001',
    buyer: 'buyer-user-id',
    supplier: 'supplier-user-id',
    buyerCompany: 'buyer-company-id',
    supplierCompany: 'supplier-company-id',
    items: [
      {
        productId: 'product-id-1',
        name: 'Test Product',
        quantity: 10,
        price: 10.99,
        totalPrice: 109.90
      }
    ],
    totalAmount: 109.90,
    currency: 'USD',
    status: 'pending',
    tenantId: 'test-tenant-123',
    ...overrides
  };
};

/**
 * Create test RFQ data
 */
export const createTestRFQData = (overrides = {}) => {
  return {
    title: 'Test RFQ',
    description: 'A test RFQ description',
    category: 'vegetables',
    budget: 1000,
    currency: 'USD',
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    buyer: 'buyer-user-id',
    buyerCompany: 'buyer-company-id',
    status: 'published',
    tenantId: 'test-tenant-123',
    ...overrides
  };
};

/**
 * Wait for a specified amount of time
 */
export const wait = async (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generate random string
 */
export const generateRandomString = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate random email
 */
export const generateRandomEmail = (): string => {
  return `test${generateRandomString(6)}@example.com`;
};

/**
 * Generate random phone number
 */
export const generateRandomPhoneNumber = (): string => {
  return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;
};

/**
 * Mock request object
 */
export const createMockRequest = (overrides = {}) => {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    user: null,
    tenantId: 'test-tenant-123',
    userId: 'test-user-123',
    sessionId: 'test-session-123',
    ip: '127.0.0.1',
    get: jest.fn(),
    ...overrides
  };
};

/**
 * Mock response object
 */
export const createMockResponse = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
    setHeader: jest.fn(),
    end: jest.fn()
  };

  // Make methods chainable
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  res.setHeader.mockReturnValue(res);

  return res;
};

/**
 * Mock next function
 */
export const createMockNext = () => {
  return jest.fn();
};

/**
 * Generate test analytics event data
 */
export const createTestAnalyticsEventData = (overrides = {}) => {
  return {
    tenantId: 'test-tenant-123',
    userId: 'test-user-123',
    eventType: 'product_view',
    category: 'product' as const,
    entityId: 'product-123',
    data: {
      productId: 'product-123',
      productName: 'Test Product',
      category: 'vegetables'
    },
    timestamp: new Date(),
    sessionId: 'test-session-123',
    userAgent: 'Mozilla/5.0 (Test Browser)',
    ipAddress: '127.0.0.1',
    ...overrides
  };
};

/**
 * Generate test dashboard metrics
 */
export const createTestDashboardMetrics = (overrides = {}) => {
  return {
    totalRevenue: 50000,
    revenueGrowth: 15.5,
    averageOrderValue: 125.75,
    totalOrders: 200,
    ordersGrowth: 10.2,
    totalRFQs: 45,
    rfqConversionRate: 78.5,
    averageRFQValue: 850.25,
    rfqGrowth: 5.8,
    totalProducts: 150,
    topProducts: [
      {
        productId: 'prod-1',
        name: 'Product 1',
        orders: 50,
        revenue: 2500
      }
    ],
    totalUsers: 25,
    activeUsers: 18,
    newUsers: 5,
    userGrowth: 25.0,
    complianceRate: 95.5,
    totalViolations: 3,
    criticalAlerts: 1,
    averageProcessingTime: 45,
    systemUptime: 99.9,
    revenueByMonth: [
      { month: '2023-1', revenue: 4000, orders: 20 },
      { month: '2023-2', revenue: 4500, orders: 25 }
    ],
    ordersByStatus: [
      { status: 'completed', count: 120, percentage: 60 },
      { status: 'pending', count: 50, percentage: 25 }
    ],
    topBuyers: [
      {
        companyId: 'comp-1',
        companyName: 'Buyer 1',
        totalOrders: 25,
        totalValue: 5000
      }
    ],
    topSuppliers: [
      {
        companyId: 'comp-2',
        companyName: 'Supplier 1',
        totalOrders: 30,
        totalValue: 6000
      }
    ],
    ...overrides
  };
};

/**
 * Create test export options
 */
export const createTestExportOptions = (overrides = {}) => {
  return {
    format: 'csv' as const,
    fields: ['id', 'name', 'price', 'category'],
    includeRelated: false,
    fileName: 'test-export',
    filters: {
      category: 'vegetables',
      startDate: '2023-01-01',
      endDate: '2023-12-31'
    },
    ...overrides
  };
};

/**
 * Create test import options
 */
export const createTestImportOptions = (overrides = {}) => {
  return {
    format: 'csv' as const,
    validateOnly: false,
    batchSize: 100,
    skipErrors: false,
    mapping: {
      'Product Name': 'name',
      'Product Price': 'price',
      'Product Category': 'category'
    },
    ...overrides
  };
};

/**
 * Setup test database
 */
export const setupTestDatabase = async () => {
  // This would contain logic to setup test database
  // For now, it's a placeholder
  console.log('Setting up test database...');
};

/**
 * Cleanup test database
 */
export const cleanupTestDatabase = async () => {
  // This would contain logic to cleanup test database
  // For now, it's a placeholder
  console.log('Cleaning up test database...');
};

/**
 * Create test file content for import/export testing
 */
export const createTestCSVContent = (data: any[]): string => {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row =>
    Object.values(row).map(value =>
      typeof value === 'string' ? `"${value}"` : value
    ).join(',')
  );

  return [headers, ...rows].join('\n');
};

/**
 * Create test Excel content
 */
export const createTestExcelContent = (data: any[]): Buffer => {
  // This would use a library like xlsx to create Excel content
  // For now, it's a placeholder that returns a simple buffer
  return Buffer.from(JSON.stringify(data));
};

/**
 * Validate test response structure
 */
export const validateResponseStructure = (response: any, expectedStructure: any): boolean => {
  const validateObject = (obj: any, structure: any): boolean => {
    for (const key in structure) {
      if (!(key in obj)) return false;

      const expectedType = structure[key];
      const actualValue = obj[key];

      if (typeof expectedType === 'string') {
        if (typeof actualValue !== expectedType) return false;
      } else if (typeof expectedType === 'object' && expectedType !== null) {
        if (typeof actualValue !== 'object' || actualValue === null) return false;
        if (!validateObject(actualValue, expectedType)) return false;
      }
    }
    return true;
  };

  return validateObject(response, expectedStructure);
};

/**
 * Create test middleware
 */
export const createTestMiddleware = (mockImplementation?: any) => {
  return jest.fn(mockImplementation || ((req, res, next) => next()));
};

/**
 * Sleep utility for testing
 */
export const sleep = async (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generate test date range
 */
export const generateTestDateRange = (daysAgo: number = 30): { startDate: Date; endDate: Date } => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysAgo);

  return { startDate, endDate };
};

/**
 * Create test error
 */
export const createTestError = (message: string = 'Test error', code: string = 'TEST_ERROR'): Error => {
  const error = new Error(message);
  (error as any).code = code;
  return error;
};

/**
 * Assert async function throws
 */
export const assertAsyncThrows = async (
  fn: () => Promise<any>,
  errorMessage?: string
): Promise<void> => {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    if (errorMessage && error.message !== errorMessage) {
      throw new Error(`Expected error message "${errorMessage}", got "${error.message}"`);
    }
  }
};

// Enhanced test utilities for notification and blockchain testing

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company?: string;
  token: string;
}

export interface TestCompany {
  id: string;
  name: string;
  type: string;
  email: string;
}

export interface TestProduct {
  id: string;
  name: string;
  supplier: string;
  price: number;
  category: string;
}

export class TestDataFactory {
  /**
   * Create a test company with enhanced fields
   */
  static async createTestCompany(overrides: Partial<any> = {}): Promise<TestCompany> {
    const companyData = {
      name: 'Test Company',
      type: 'BUYER',
      email: 'test@company.com',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'TestLand'
      },
      verified: true,
      active: true,
      ...overrides
    };

    const company = await Company.create(companyData);

    return {
      id: company._id.toString(),
      name: company.name,
      type: company.type,
      email: (company as any).email
    };
  }

  /**
   * Create a test user with token generation
   */
  static async createTestUser(overrides: Partial<any> = {}): Promise<TestUser> {
    const userData = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'BUYER',
      verified: true,
      active: true,
      ...overrides
    };

    const user = await User.create(userData);

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        company: user.company
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company?.toString(),
      token
    };
  }

  /**
   * Create a test product
   */
  static async createTestProduct(supplierId: string, overrides: Partial<any> = {}): Promise<TestProduct> {
    const productData = {
      name: 'Test Product',
      description: 'A test product',
      category: 'vegetables',
      supplier: supplierId,
      price: 10.99,
      unit: 'kg',
      inventory: {
        current: 100,
        lowStockThreshold: 10
      },
      status: 'ACTIVE',
      ...overrides
    };

    const product = await Product.create(productData);

    return {
      id: product._id.toString(),
      name: product.name,
      supplier: product.supplier.toString(),
      price: (product as any).price,
      category: product.category
    };
  }

  /**
   * Create a complete test scenario
   */
  static async createCompleteTestScenario() {
    const buyerCompany = await this.createTestCompany({
      name: 'Buyer Company',
      type: 'BUYER',
      email: 'buyer@company.com'
    });

    const sellerCompany = await this.createTestCompany({
      name: 'Seller Company',
      type: 'SELLER',
      email: 'seller@company.com'
    });

    const buyer = await this.createTestUser({
      firstName: 'Buyer',
      lastName: 'User',
      email: 'buyer@test.com',
      role: 'BUYER',
      company: buyerCompany.id
    });

    const seller = await this.createTestUser({
      name: 'Seller User',
      email: 'seller@test.com',
      role: 'SELLER',
      company: sellerCompany.id
    });

    const admin = await this.createTestUser({
      name: 'Admin User',
      email: 'admin@test.com',
      role: 'ADMIN'
    });

    const product = await this.createTestProduct(sellerCompany.id);

    return {
      companies: { buyer: buyerCompany, seller: sellerCompany },
      users: { buyer, seller, admin },
      product
    };
  }
}

export class TestAssertions {
  /**
   * Assert that a notification has the expected structure
   */
  static expectValidNotification(notification: any) {
    expect(notification).toHaveProperty('id');
    expect(notification).toHaveProperty('userId');
    expect(notification).toHaveProperty('title');
    expect(notification).toHaveProperty('body');
    expect(notification).toHaveProperty('priority');
    expect(notification).toHaveProperty('category');
    expect(notification.priority).toMatch(/^(low|normal|high)$/);
  }

  /**
   * Assert that user preferences have the expected structure
   */
  static expectValidUserPreferences(preferences: any) {
    expect(preferences).toHaveProperty('enabled');
    expect(preferences).toHaveProperty('categories');
    expect(preferences).toHaveProperty('quietHours');
    expect(typeof preferences.enabled).toBe('boolean');
    expect(typeof preferences.categories).toBe('object');

    if (preferences.quietHours) {
      expect(preferences.quietHours).toHaveProperty('start');
      expect(preferences.quietHours).toHaveProperty('end');
      expect(preferences.quietHours.start).toMatch(/^\d{2}:\d{2}$/);
      expect(preferences.quietHours.end).toMatch(/^\d{2}:\d{2}$/);
    }
  }

  /**
   * Assert that notification statistics have the expected structure
   */
  static expectValidNotificationStats(stats: any) {
    expect(stats).toHaveProperty('sent');
    expect(stats).toHaveProperty('delivered');
    expect(stats).toHaveProperty('opened');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('platform');
    expect(stats).toHaveProperty('categories');

    expect(typeof stats.sent).toBe('number');
    expect(typeof stats.delivered).toBe('number');
    expect(typeof stats.opened).toBe('number');
    expect(typeof stats.failed).toBe('number');
    expect(typeof stats.platform).toBe('object');
    expect(typeof stats.categories).toBe('object');
  }

  /**
   * Assert that blockchain batch has the expected structure
   */
  static expectValidBlockchainBatch(batch: any) {
    expect(batch).toHaveProperty('id');
    expect(batch).toHaveProperty('productId');
    expect(batch).toHaveProperty('supplierId');
    expect(batch).toHaveProperty('quantity');
    expect(batch).toHaveProperty('harvestDate');
    expect(batch).toHaveProperty('hash');
    expect(batch).toHaveProperty('verified');
    expect(batch).toHaveProperty('events');

    expect(typeof batch.quantity).toBe('number');
    expect(typeof batch.verified).toBe('boolean');
    expect(Array.isArray(batch.events)).toBe(true);
  }
}

export class TestPerformance {
  /**
   * Measure execution time of an async function
   */
  static async measureExecutionTime<T>(
    operation: () => Promise<T>,
    label?: string
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const endTime = Date.now();
    const duration = endTime - startTime;

    if (label) {
      console.log(`${label}: ${duration}ms`);
    }

    return { result, duration };
  }

  /**
   * Run a performance benchmark
   */
  static async runBenchmark(
    operation: () => Promise<any>,
    iterations: number = 100,
    label?: string
  ): Promise<{
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  }> {
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureExecutionTime(operation);
      durations.push(duration);
    }

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = totalDuration / iterations;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    if (label) {
      console.log(`${label} Benchmark - Avg: ${averageDuration.toFixed(2)}ms, Min: ${minDuration}ms, Max: ${maxDuration}ms`);
    }

    return {
      averageDuration,
      minDuration,
      maxDuration,
      totalDuration
    };
  }

  /**
   * Check memory usage
   */
  static getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100 // MB
    };
  }
}

export class TestValidation {
  /**
   * Validate MongoDB ObjectId
   */
  static isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Validate notification priority
   */
  static isValidNotificationPriority(priority: string): boolean {
    return ['low', 'normal', 'high'].includes(priority);
  }

  /**
   * Validate device token format by platform
   */
  static isValidDeviceToken(token: string, platform: string): boolean {
    switch (platform) {
      case 'ios':
        return /^[a-f0-9]{64}$/.test(token);
      case 'android':
        return token.length > 100 && token.includes(':');
      case 'web':
        try {
          const parsed = JSON.parse(token);
          return parsed.endpoint && parsed.keys;
        } catch {
          return false;
        }
      default:
        return false;
    }
  }
}
