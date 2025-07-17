import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../app';
import { connectDB, disconnectDB } from '../../config/database';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { generateTestJWT } from '../utils/testHelpers';

describe('Analytics Integration Tests', () => {
  let testUser: any;
  let testCompany: any;
  let authToken: string;
  const testTenantId = 'test-tenant-analytics';

  beforeAll(async () => {
    await connectDB();
    
    // Create test company
    testCompany = await Company.create({
      name: 'Test Analytics Company',
      email: 'analytics@test.com',
      type: 'buyer',
      tenantId: testTenantId,
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'US'
      },
      isActive: true
    });

    // Create test user
    testUser = await User.create({
      name: 'Analytics Test User',
      email: 'analytics@test.com',
      password: 'hashedpassword',
      role: 'admin',
      company: testCompany._id,
      tenantId: testTenantId,
      isActive: true
    });

    // Generate auth token
    authToken = generateTestJWT(testUser._id, testTenantId, 'admin');
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ tenantId: testTenantId });
    await Company.deleteMany({ tenantId: testTenantId });
    await Order.deleteMany({ tenantId: testTenantId });
    await RFQ.deleteMany({ tenantId: testTenantId });
    await Product.deleteMany({ tenantId: testTenantId });
    
    await disconnectDB();
  });

  beforeEach(async () => {
    // Create test data for each test
    await createTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await Order.deleteMany({ tenantId: testTenantId });
    await RFQ.deleteMany({ tenantId: testTenantId });
    await Product.deleteMany({ tenantId: testTenantId });
  });

  describe('GET /api/v1/analytics/dashboard', () => {
    it('should return dashboard metrics for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
      expect(response.body.data).toHaveProperty('totalOrders');
      expect(response.body.data).toHaveProperty('totalRFQs');
      expect(response.body.data).toHaveProperty('totalProducts');
      expect(response.body.data).toHaveProperty('revenueGrowth');
      expect(response.body.data).toHaveProperty('ordersGrowth');
      expect(response.body.data).toHaveProperty('complianceRate');
      expect(response.body.message).toBe('Dashboard metrics retrieved successfully');
    });

    it('should return 401 for unauthenticated requests', async () => {
      await request(app)
        .get('/api/v1/analytics/dashboard')
        .expect(401);
    });

    it('should handle date range filters', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';

      const response = await request(app)
        .get(`/api/v1/analytics/dashboard?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
    });

    it('should handle comparison date parameter', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      const compareWith = '2022-01-01';

      const response = await request(app)
        .get(`/api/v1/analytics/dashboard?startDate=${startDate}&endDate=${endDate}&compareWith=${compareWith}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('revenueGrowth');
      expect(response.body.data).toHaveProperty('ordersGrowth');
    });
  });

  describe('GET /api/v1/analytics/reports', () => {
    it('should generate comprehensive report', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';

      const response = await request(app)
        .get(`/api/v1/analytics/reports?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('financialMetrics');
      expect(response.body.data).toHaveProperty('operationalMetrics');
      expect(response.body.data).toHaveProperty('complianceMetrics');
      expect(response.body.data).toHaveProperty('trends');
      expect(response.body.data).toHaveProperty('insights');
    });

    it('should return 400 for missing required parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Start date and end date are required');
    });

    it('should handle category filter', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      const category = 'vegetables';

      const response = await request(app)
        .get(`/api/v1/analytics/reports?startDate=${startDate}&endDate=${endDate}&category=${category}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/real-time', () => {
    it('should return real-time analytics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/real-time')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activeUsers');
      expect(response.body.data).toHaveProperty('ongoingOrders');
      expect(response.body.data).toHaveProperty('openRFQs');
      expect(response.body.data).toHaveProperty('activeAlerts');
      expect(response.body.data).toHaveProperty('recentActivity');
      expect(Array.isArray(response.body.data.recentActivity)).toBe(true);
    });
  });

  describe('POST /api/v1/analytics/track', () => {
    it('should track analytics event', async () => {
      const eventData = {
        eventType: 'product_view',
        category: 'product',
        entityId: 'prod-123',
        data: {
          productId: 'prod-123',
          productName: 'Test Product',
          category: 'vegetables'
        }
      };

      const response = await request(app)
        .post('/api/v1/analytics/track')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Event tracked successfully');
    });

    it('should handle missing event data', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/track')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/analytics/category/:category', () => {
    it('should return analytics by category', async () => {
      const category = 'product';

      const response = await request(app)
        .get(`/api/v1/analytics/category/${category}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle limit parameter', async () => {
      const category = 'product';
      const limit = 5;

      const response = await request(app)
        .get(`/api/v1/analytics/category/${category}?limit=${limit}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/products/top', () => {
    it('should return top products', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/products/top')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle date range and limit parameters', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      const limit = 5;

      const response = await request(app)
        .get(`/api/v1/analytics/products/top?startDate=${startDate}&endDate=${endDate}&limit=${limit}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('GET /api/v1/analytics/revenue/trends', () => {
    it('should return revenue trends', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/revenue/trends')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/users', () => {
    it('should return user analytics', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/users')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activeUsers');
      expect(response.body.data).toHaveProperty('topBuyers');
      expect(response.body.data).toHaveProperty('topSuppliers');
    });
  });

  describe('GET /api/v1/analytics/export', () => {
    it('should return export data', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';
      const type = 'dashboard';

      const response = await request(app)
        .get(`/api/v1/analytics/export?type=${type}&startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalRevenue');
    });

    it('should handle missing required parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export?type=dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Start date and end date are required');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple requests to trigger rate limiting
      const requests = Array(25).fill(null).map(() => 
        request(app)
          .get('/api/v1/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Authorization', () => {
    it('should require appropriate role for analytics access', async () => {
      // Create user with insufficient role
      const limitedUser = await User.create({
        name: 'Limited User',
        email: 'limited@test.com',
        password: 'hashedpassword',
        role: 'user',
        company: testCompany._id,
        tenantId: testTenantId,
        isActive: true
      });

      const limitedToken = generateTestJWT(limitedUser._id, testTenantId, 'user');

      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${limitedToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);

      // Clean up
      await User.deleteOne({ _id: limitedUser._id });
    });
  });

  // Helper function to create test data
  async function createTestData() {
    // Create test products
    const products = await Product.create([
      {
        name: 'Test Product 1',
        description: 'Test product description',
        category: 'vegetables',
        price: 10.50,
        currency: 'USD',
        unit: 'kg',
        supplier: testCompany._id,
        tenantId: testTenantId,
        isActive: true
      },
      {
        name: 'Test Product 2',
        description: 'Another test product',
        category: 'fruits',
        price: 15.75,
        currency: 'USD',
        unit: 'kg',
        supplier: testCompany._id,
        tenantId: testTenantId,
        isActive: true
      }
    ]);

    // Create test orders
    await Order.create([
      {
        orderNumber: 'ORD-001',
        buyer: testUser._id,
        supplier: testCompany._id,
        buyerCompany: testCompany._id,
        supplierCompany: testCompany._id,
        items: [
          {
            productId: products[0]._id,
            name: products[0].name,
            quantity: 10,
            price: products[0].price,
            totalPrice: products[0].price * 10
          }
        ],
        totalAmount: products[0].price * 10,
        currency: 'USD',
        status: 'completed',
        tenantId: testTenantId
      },
      {
        orderNumber: 'ORD-002',
        buyer: testUser._id,
        supplier: testCompany._id,
        buyerCompany: testCompany._id,
        supplierCompany: testCompany._id,
        items: [
          {
            productId: products[1]._id,
            name: products[1].name,
            quantity: 5,
            price: products[1].price,
            totalPrice: products[1].price * 5
          }
        ],
        totalAmount: products[1].price * 5,
        currency: 'USD',
        status: 'pending',
        tenantId: testTenantId
      }
    ]);

    // Create test RFQs
    await RFQ.create([
      {
        title: 'Test RFQ 1',
        description: 'Looking for fresh vegetables',
        category: 'vegetables',
        budget: 1000,
        currency: 'USD',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        buyer: testUser._id,
        buyerCompany: testCompany._id,
        status: 'published',
        tenantId: testTenantId
      },
      {
        title: 'Test RFQ 2',
        description: 'Looking for organic fruits',
        category: 'fruits',
        budget: 500,
        currency: 'USD',
        deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        buyer: testUser._id,
        buyerCompany: testCompany._id,
        status: 'awarded',
        tenantId: testTenantId
      }
    ]);
  }
});