import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';

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
export const wait = (ms: number): Promise<void> => {
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
export const sleep = (ms: number): Promise<void> => {
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