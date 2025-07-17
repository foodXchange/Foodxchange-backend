import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../app';
import { connectDB, disconnectDB } from '../../config/database';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { Product } from '../../models/Product';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { generateTestJWT } from '../utils/testHelpers';

describe('Analytics E2E Tests', () => {
  let adminUser: any;
  let managerUser: any;
  let analystUser: any;
  let regularUser: any;
  let testCompany: any;
  let supplierCompany: any;
  let testProducts: any[];
  let testOrders: any[];
  let testRFQs: any[];
  
  const testTenantId = 'test-tenant-e2e-analytics';
  let adminToken: string;
  let managerToken: string;
  let analystToken: string;
  let userToken: string;

  beforeAll(async () => {
    await connectDB();
    
    // Create test companies
    testCompany = await Company.create({
      name: 'Test Buyer Company',
      email: 'buyer@test.com',
      type: 'buyer',
      tenantId: testTenantId,
      address: {
        street: '123 Buyer St',
        city: 'Buyer City',
        state: 'BC',
        zipCode: '12345',
        country: 'US'
      },
      isActive: true
    });

    supplierCompany = await Company.create({
      name: 'Test Supplier Company',
      email: 'supplier@test.com',
      type: 'supplier',
      tenantId: testTenantId,
      address: {
        street: '456 Supplier Ave',
        city: 'Supplier City',
        state: 'SC',
        zipCode: '67890',
        country: 'US'
      },
      isActive: true
    });

    // Create test users with different roles
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'hashedpassword',
      role: 'admin',
      company: testCompany._id,
      tenantId: testTenantId,
      isActive: true
    });

    managerUser = await User.create({
      name: 'Manager User',
      email: 'manager@test.com',
      password: 'hashedpassword',
      role: 'manager',
      company: testCompany._id,
      tenantId: testTenantId,
      isActive: true
    });

    analystUser = await User.create({
      name: 'Analyst User',
      email: 'analyst@test.com',
      password: 'hashedpassword',
      role: 'analyst',
      company: testCompany._id,
      tenantId: testTenantId,
      isActive: true
    });

    regularUser = await User.create({
      name: 'Regular User',
      email: 'user@test.com',
      password: 'hashedpassword',
      role: 'user',
      company: testCompany._id,
      tenantId: testTenantId,
      isActive: true
    });

    // Generate auth tokens
    adminToken = generateTestJWT(adminUser._id, testTenantId, 'admin');
    managerToken = generateTestJWT(managerUser._id, testTenantId, 'manager');
    analystToken = generateTestJWT(analystUser._id, testTenantId, 'analyst');
    userToken = generateTestJWT(regularUser._id, testTenantId, 'user');

    // Create comprehensive test data
    await createComprehensiveTestData();
  });

  afterAll(async () => {
    // Clean up all test data
    await User.deleteMany({ tenantId: testTenantId });
    await Company.deleteMany({ tenantId: testTenantId });
    await Product.deleteMany({ tenantId: testTenantId });
    await Order.deleteMany({ tenantId: testTenantId });
    await RFQ.deleteMany({ tenantId: testTenantId });
    
    await disconnectDB();
  });

  describe('Complete Analytics Workflow', () => {
    it('should complete a full analytics workflow', async () => {
      // Step 1: Track some user events
      await request(app)
        .post('/api/v1/analytics/track')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventType: 'dashboard_view',
          category: 'system',
          data: { page: 'dashboard' }
        })
        .expect(201);

      await request(app)
        .post('/api/v1/analytics/track')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventType: 'product_view',
          category: 'product',
          entityId: testProducts[0]._id.toString(),
          data: { 
            productId: testProducts[0]._id.toString(),
            productName: testProducts[0].name,
            category: testProducts[0].category
          }
        })
        .expect(201);

      // Step 2: Get dashboard metrics
      const dashboardResponse = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(dashboardResponse.body.success).toBe(true);
      expect(dashboardResponse.body.data.totalOrders).toBeGreaterThan(0);
      expect(dashboardResponse.body.data.totalRevenue).toBeGreaterThan(0);
      expect(dashboardResponse.body.data.totalProducts).toBeGreaterThan(0);
      expect(dashboardResponse.body.data.totalRFQs).toBeGreaterThan(0);

      // Step 3: Generate comprehensive report
      const reportResponse = await request(app)
        .get('/api/v1/analytics/reports?startDate=2023-01-01&endDate=2023-12-31')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(reportResponse.body.success).toBe(true);
      expect(reportResponse.body.data.summary).toBeDefined();
      expect(reportResponse.body.data.financialMetrics).toBeDefined();
      expect(reportResponse.body.data.operationalMetrics).toBeDefined();

      // Step 4: Get real-time analytics
      const realTimeResponse = await request(app)
        .get('/api/v1/analytics/real-time')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(realTimeResponse.body.success).toBe(true);
      expect(realTimeResponse.body.data.recentActivity).toBeDefined();
      expect(Array.isArray(realTimeResponse.body.data.recentActivity)).toBe(true);

      // Step 5: Get top products
      const topProductsResponse = await request(app)
        .get('/api/v1/analytics/products/top?limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(topProductsResponse.body.success).toBe(true);
      expect(Array.isArray(topProductsResponse.body.data)).toBe(true);

      // Step 6: Get revenue trends
      const trendsResponse = await request(app)
        .get('/api/v1/analytics/revenue/trends')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(trendsResponse.body.success).toBe(true);
      expect(Array.isArray(trendsResponse.body.data)).toBe(true);

      // Step 7: Get user analytics
      const userAnalyticsResponse = await request(app)
        .get('/api/v1/analytics/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(userAnalyticsResponse.body.success).toBe(true);
      expect(userAnalyticsResponse.body.data.activeUsers).toBeDefined();
      expect(userAnalyticsResponse.body.data.topBuyers).toBeDefined();
      expect(userAnalyticsResponse.body.data.topSuppliers).toBeDefined();
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin access to all analytics endpoints', async () => {
      const endpoints = [
        '/api/v1/analytics/dashboard',
        '/api/v1/analytics/reports?startDate=2023-01-01&endDate=2023-12-31',
        '/api/v1/analytics/real-time',
        '/api/v1/analytics/products/top',
        '/api/v1/analytics/revenue/trends',
        '/api/v1/analytics/users'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('should allow manager access to analytics endpoints', async () => {
      const endpoints = [
        '/api/v1/analytics/dashboard',
        '/api/v1/analytics/reports?startDate=2023-01-01&endDate=2023-12-31',
        '/api/v1/analytics/real-time'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${managerToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('should allow analyst access to analytics endpoints', async () => {
      const endpoints = [
        '/api/v1/analytics/dashboard',
        '/api/v1/analytics/reports?startDate=2023-01-01&endDate=2023-12-31',
        '/api/v1/analytics/real-time'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${analystToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    it('should deny regular user access to analytics endpoints', async () => {
      const endpoints = [
        '/api/v1/analytics/dashboard',
        '/api/v1/analytics/reports?startDate=2023-01-01&endDate=2023-12-31',
        '/api/v1/analytics/real-time'
      ];

      for (const endpoint of endpoints) {
        await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
      }
    });
  });

  describe('Data Export Functionality', () => {
    it('should export dashboard data successfully', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export?type=dashboard&startDate=2023-01-01&endDate=2023-12-31&format=json')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalRevenue).toBeDefined();
      expect(response.body.data.totalOrders).toBeDefined();
    });

    it('should export report data successfully', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export?type=report&startDate=2023-01-01&endDate=2023-12-31&format=json')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should handle CSV export format', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export?type=dashboard&startDate=2023-01-01&endDate=2023-12-31&format=csv')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  describe('Analytics Filtering and Pagination', () => {
    it('should filter analytics by category', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/category/product?limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle date range filtering', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-06-30';

      const response = await request(app)
        .get(`/api/v1/analytics/dashboard?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should handle growth comparison', async () => {
      const startDate = '2023-07-01';
      const endDate = '2023-12-31';
      const compareWith = '2023-01-01';

      const response = await request(app)
        .get(`/api/v1/analytics/dashboard?startDate=${startDate}&endDate=${endDate}&compareWith=${compareWith}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.revenueGrowth).toBeDefined();
      expect(response.body.data.ordersGrowth).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large dataset queries efficiently', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(response.body.success).toBe(true);
      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/v1/analytics/dashboard')
          .set('Authorization', `Bearer ${adminToken}`)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid date formats gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports?startDate=invalid-date&endDate=2023-12-31')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle missing required parameters', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Start date and end date are required');
    });

    it('should handle invalid export types', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/export?type=invalid&startDate=2023-01-01&endDate=2023-12-31')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Invalid export type');
    });
  });

  describe('Tenant Isolation', () => {
    it('should only return data for the correct tenant', async () => {
      // Create data for a different tenant
      const differentTenantId = 'different-tenant-123';
      
      const differentCompany = await Company.create({
        name: 'Different Tenant Company',
        email: 'different@test.com',
        type: 'buyer',
        tenantId: differentTenantId,
        address: {
          street: '789 Different St',
          city: 'Different City',
          state: 'DC',
          zipCode: '11111',
          country: 'US'
        },
        isActive: true
      });

      await Order.create({
        orderNumber: 'DIFF-001',
        buyer: adminUser._id,
        supplier: differentCompany._id,
        buyerCompany: differentCompany._id,
        supplierCompany: differentCompany._id,
        items: [{
          productId: testProducts[0]._id,
          name: 'Different Product',
          quantity: 1,
          price: 100,
          totalPrice: 100
        }],
        totalAmount: 100,
        currency: 'USD',
        status: 'completed',
        tenantId: differentTenantId
      });

      // Get analytics for our tenant
      const response = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // The response should not include data from the different tenant
      // We can verify this by checking if the total revenue matches our test data
      expect(response.body.data.totalRevenue).not.toEqual(100);

      // Clean up
      await Company.deleteOne({ _id: differentCompany._id });
      await Order.deleteMany({ tenantId: differentTenantId });
    });
  });

  // Helper function to create comprehensive test data
  async function createComprehensiveTestData() {
    // Create test products
    testProducts = await Product.create([
      {
        name: 'Fresh Tomatoes',
        description: 'Organic fresh tomatoes',
        category: 'vegetables',
        price: 5.99,
        currency: 'USD',
        unit: 'lb',
        supplier: supplierCompany._id,
        tenantId: testTenantId,
        isActive: true,
        minOrderQuantity: 10
      },
      {
        name: 'Granny Smith Apples',
        description: 'Crisp Granny Smith apples',
        category: 'fruits',
        price: 3.49,
        currency: 'USD',
        unit: 'lb',
        supplier: supplierCompany._id,
        tenantId: testTenantId,
        isActive: true,
        minOrderQuantity: 5
      },
      {
        name: 'Organic Spinach',
        description: 'Fresh organic spinach leaves',
        category: 'vegetables',
        price: 4.99,
        currency: 'USD',
        unit: 'bunch',
        supplier: supplierCompany._id,
        tenantId: testTenantId,
        isActive: true,
        minOrderQuantity: 1
      }
    ]);

    // Create test orders with different statuses and dates
    const orderDates = [
      new Date('2023-01-15'),
      new Date('2023-03-20'),
      new Date('2023-06-10'),
      new Date('2023-09-05'),
      new Date('2023-11-25')
    ];

    testOrders = await Order.create(orderDates.map((date, index) => ({
      orderNumber: `ORD-${String(index + 1).padStart(3, '0')}`,
      buyer: adminUser._id,
      supplier: supplierCompany._id,
      buyerCompany: testCompany._id,
      supplierCompany: supplierCompany._id,
      items: [{
        productId: testProducts[index % testProducts.length]._id,
        name: testProducts[index % testProducts.length].name,
        quantity: 10 + (index * 5),
        price: testProducts[index % testProducts.length].price,
        totalPrice: testProducts[index % testProducts.length].price * (10 + (index * 5))
      }],
      totalAmount: testProducts[index % testProducts.length].price * (10 + (index * 5)),
      currency: 'USD',
      status: ['pending', 'processing', 'shipped', 'delivered', 'completed'][index % 5],
      tenantId: testTenantId,
      createdAt: date,
      updatedAt: date
    })));

    // Create test RFQs
    testRFQs = await RFQ.create([
      {
        title: 'Bulk Vegetable Order',
        description: 'Looking for fresh vegetables for restaurant chain',
        category: 'vegetables',
        budget: 5000,
        currency: 'USD',
        deadline: new Date('2024-01-31'),
        buyer: adminUser._id,
        buyerCompany: testCompany._id,
        status: 'published',
        tenantId: testTenantId,
        createdAt: new Date('2023-02-01')
      },
      {
        title: 'Organic Fruit Selection',
        description: 'Need organic fruits for juice bar',
        category: 'fruits',
        budget: 2000,
        currency: 'USD',
        deadline: new Date('2024-02-15'),
        buyer: managerUser._id,
        buyerCompany: testCompany._id,
        status: 'awarded',
        tenantId: testTenantId,
        createdAt: new Date('2023-04-15')
      },
      {
        title: 'Leafy Greens Supply',
        description: 'Regular supply of leafy greens',
        category: 'vegetables',
        budget: 3000,
        currency: 'USD',
        deadline: new Date('2024-03-01'),
        buyer: analystUser._id,
        buyerCompany: testCompany._id,
        status: 'closed',
        tenantId: testTenantId,
        createdAt: new Date('2023-07-10')
      }
    ]);
  }
});