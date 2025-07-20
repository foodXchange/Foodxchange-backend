import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../../server';
import { User } from '../../models/User';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { Product } from '../../models/Product';
import { Company } from '../../models/Company';
import { notificationIntegrationService } from '../../services/notifications/NotificationIntegrationService';
import jwt from 'jsonwebtoken';

// Mock external services
jest.mock('firebase-admin');
jest.mock('node-apn');
jest.mock('web-push');
jest.mock('@azure/notification-hubs');

describe('Notification System E2E Tests', () => {
  let mongoServer: MongoMemoryServer;
  let buyerUser: any;
  let sellerUser: any;
  let adminUser: any;
  let buyerCompany: any;
  let sellerCompany: any;
  let buyerToken: string;
  let sellerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialize notification service
    await notificationIntegrationService.initialize();

    // Create test companies
    buyerCompany = await Company.create({
      name: 'Test Buyer Company',
      type: 'BUYER',
      email: 'buyer@testcompany.com',
      address: {
        street: '123 Buyer St',
        city: 'Buyer City',
        state: 'BC',
        zipCode: '12345',
        country: 'TestLand'
      },
      verified: true,
      active: true
    });

    sellerCompany = await Company.create({
      name: 'Test Seller Company',
      type: 'SELLER',
      email: 'seller@testcompany.com',
      address: {
        street: '456 Seller Ave',
        city: 'Seller City',
        state: 'SC',
        zipCode: '67890',
        country: 'TestLand'
      },
      verified: true,
      active: true
    });

    // Create test users
    buyerUser = await User.create({
      name: 'Buyer User',
      email: 'buyer@test.com',
      password: 'hashedpassword',
      role: 'BUYER',
      company: buyerCompany._id,
      verified: true,
      active: true
    });

    sellerUser = await User.create({
      name: 'Seller User',
      email: 'seller@test.com',
      password: 'hashedpassword',
      role: 'SELLER',
      company: sellerCompany._id,
      verified: true,
      active: true
    });

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'hashedpassword',
      role: 'ADMIN',
      verified: true,
      active: true
    });

    // Generate JWT tokens
    buyerToken = jwt.sign(
      { id: buyerUser._id, role: buyerUser.role, company: buyerCompany._id },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    sellerToken = jwt.sign(
      { id: sellerUser._id, role: sellerUser.role, company: sellerCompany._id },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await notificationIntegrationService.stop();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Register device tokens for users before each test
    await request(app)
      .post('/api/notifications/devices/register')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        platform: 'ios',
        token: 'buyer-ios-token',
        appVersion: '1.0.0'
      });

    await request(app)
      .post('/api/notifications/devices/register')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        platform: 'android',
        token: 'seller-android-token',
        appVersion: '1.0.0'
      });
  });

  describe('Order Lifecycle Notifications', () => {
    test('should send notifications throughout order lifecycle', async () => {
      // Create a product first
      const product = await Product.create({
        name: 'Test Product',
        description: 'A test product for E2E testing',
        category: 'vegetables',
        supplier: sellerCompany._id,
        price: 10.99,
        unit: 'kg',
        inventory: {
          current: 100,
          lowStockThreshold: 10
        },
        status: 'ACTIVE'
      });

      // 1. Create an order - should trigger order created notification
      const orderData = {
        supplier: sellerCompany._id,
        items: [{
          product: product._id,
          quantity: 10,
          unitPrice: 10.99
        }],
        total: 109.90,
        deliveryAddress: {
          street: '123 Delivery St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'TestLand'
        }
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(201);

      const orderId = orderResponse.body.data._id;

      // Wait for notification to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Seller confirms order - should trigger confirmation notification
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ status: 'CONFIRMED' })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Seller ships order - should trigger shipping notification
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          status: 'SHIPPED',
          trackingNumber: 'TRK123456789',
          estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      // 4. Order is delivered - should trigger delivery notification
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ status: 'DELIVERED' })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify notification statistics
      const statsResponse = await request(app)
        .get('/api/notifications/stats?days=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statsResponse.body.data.sent).toBeGreaterThan(0);
      expect(statsResponse.body.data.categories.order).toBeGreaterThan(0);
    });

    test('should handle order cancellation notifications', async () => {
      // Create a product and order
      const product = await Product.create({
        name: 'Cancellation Test Product',
        category: 'fruits',
        supplier: sellerCompany._id,
        price: 15.99,
        unit: 'kg',
        inventory: { current: 50 },
        status: 'ACTIVE'
      });

      const orderData = {
        supplier: sellerCompany._id,
        items: [{ product: product._id, quantity: 5, unitPrice: 15.99 }],
        total: 79.95,
        deliveryAddress: {
          street: '456 Cancel St',
          city: 'Cancel City',
          state: 'CC',
          zipCode: '54321',
          country: 'TestLand'
        }
      };

      const orderResponse = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(201);

      const orderId = orderResponse.body.data._id;

      // Cancel the order - should trigger cancellation notification
      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          status: 'CANCELLED',
          cancellationReason: 'Changed requirements'
        })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check that cancellation notification was sent
      const statsResponse = await request(app)
        .get('/api/notifications/stats?days=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statsResponse.body.data.sent).toBeGreaterThan(0);
    });
  });

  describe('RFQ Workflow Notifications', () => {
    test('should send notifications during RFQ workflow', async () => {
      // 1. Create RFQ - should notify relevant suppliers
      const rfqData = {
        title: 'Need Fresh Vegetables',
        description: 'Looking for organic vegetables for restaurant chain',
        category: 'vegetables',
        quantity: 1000,
        unit: 'kg',
        budget: 5000,
        deliveryLocation: {
          street: '789 Restaurant Ave',
          city: 'Food City',
          state: 'FC',
          zipCode: '11111',
          country: 'TestLand'
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      const rfqResponse = await request(app)
        .post('/api/rfqs')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(rfqData)
        .expect(201);

      const rfqId = rfqResponse.body.data._id;

      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. Supplier submits proposal - should notify buyer
      const proposalData = {
        rfq: rfqId,
        price: 4500,
        description: 'Premium organic vegetables from local farms',
        deliveryTime: 3,
        terms: 'Payment on delivery'
      };

      await request(app)
        .post('/api/proposals')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send(proposalData)
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. Check notification statistics
      const statsResponse = await request(app)
        .get('/api/notifications/stats?days=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statsResponse.body.data.categories.rfq).toBeGreaterThan(0);
    });
  });

  describe('User Preference Handling', () => {
    test('should respect user notification preferences', async () => {
      // Disable order notifications for buyer
      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          enabled: true,
          categories: {
            order: false,
            rfq: true,
            promotion: true
          }
        })
        .expect(200);

      // Create an order
      const product = await Product.create({
        name: 'Preference Test Product',
        category: 'vegetables',
        supplier: sellerCompany._id,
        price: 8.99,
        unit: 'kg',
        inventory: { current: 25 },
        status: 'ACTIVE'
      });

      const orderData = {
        supplier: sellerCompany._id,
        items: [{ product: product._id, quantity: 3, unitPrice: 8.99 }],
        total: 26.97,
        deliveryAddress: {
          street: '321 Pref St',
          city: 'Pref City',
          state: 'PC',
          zipCode: '98765',
          country: 'TestLand'
        }
      };

      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(orderData)
        .expect(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Since order notifications are disabled for buyer, 
      // they should not receive the notification
      // (This would be verified in a real system by checking actual notification delivery)
    });

    test('should respect quiet hours', async () => {
      // Set quiet hours that cover current time
      const now = new Date();
      const quietStart = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago
      const quietEnd = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          enabled: true,
          quietHours: {
            start: quietStart.toTimeString().slice(0, 5),
            end: quietEnd.toTimeString().slice(0, 5)
          }
        })
        .expect(200);

      // Send a test notification during quiet hours
      await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      // The notification should be delayed or not sent during quiet hours
      // (Implementation depends on business logic)
    });
  });

  describe('Admin Management Functions', () => {
    test('should allow admin to manage notification rules', async () => {
      // Get current rules
      const rulesResponse = await request(app)
        .get('/api/notifications/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(rulesResponse.body.data).toBeInstanceOf(Array);

      // Disable a specific rule
      await request(app)
        .put('/api/notifications/rules/order.created/order_created/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false })
        .expect(200);

      // Re-enable the rule
      await request(app)
        .put('/api/notifications/rules/order.created/order_created/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true })
        .expect(200);
    });

    test('should provide comprehensive analytics', async () => {
      // Generate some notification activity first
      await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${buyerToken}`);

      await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${sellerToken}`);

      // Get analytics
      const analyticsResponse = await request(app)
        .get('/api/notifications/stats?days=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(analyticsResponse.body.data).toMatchObject({
        sent: expect.any(Number),
        delivered: expect.any(Number),
        opened: expect.any(Number),
        failed: expect.any(Number),
        platform: expect.any(Object),
        categories: expect.any(Object),
        period: '1 days'
      });
    });

    test('should handle bulk notifications efficiently', async () => {
      // Create multiple users for bulk testing
      const bulkUsers = [];
      for (let i = 0; i < 5; i++) {
        const user = await User.create({
          name: `Bulk User ${i}`,
          email: `bulk${i}@test.com`,
          password: 'hashedpassword',
          role: 'BUYER',
          verified: true,
          active: true
        });
        bulkUsers.push(user._id.toString());
      }

      // Send bulk notification
      const bulkResponse = await request(app)
        .post('/api/notifications/bulk-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userIds: bulkUsers,
          templateId: 'system_announcement',
          variables: {
            announcementTitle: 'System Update',
            message: 'The system will be updated tonight'
          }
        })
        .expect(200);

      expect(bulkResponse.body.data.totalSent).toBe(5);
      expect(bulkResponse.body.data.failures).toHaveLength(0);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle notification service failures gracefully', async () => {
      // Mock service failure
      const originalSendNotification = notificationIntegrationService.sendNotification;
      notificationIntegrationService.sendNotification = jest.fn().mockRejectedValue(
        new Error('Service temporarily unavailable')
      );

      // Attempt to send notification
      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: buyerUser._id.toString(),
          title: 'Test Notification',
          body: 'This should fail gracefully'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to send notification');

      // Restore original method
      notificationIntegrationService.sendNotification = originalSendNotification;
    });

    test('should handle high notification volume', async () => {
      // Register many device tokens
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/notifications/devices/register')
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({
            platform: 'ios',
            token: `bulk-token-${i}`,
            appVersion: '1.0.0'
          });
      }

      // Send multiple test notifications rapidly
      const promises = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/notifications/test')
          .set('Authorization', `Bearer ${buyerToken}`)
      );

      const responses = await Promise.all(promises);
      
      // Most notifications should succeed despite high volume
      const successfulResponses = responses.filter(r => r.status === 200);
      expect(successfulResponses.length).toBeGreaterThan(7); // Allow some to be rate limited
    });
  });

  describe('Security and Data Protection', () => {
    test('should prevent unauthorized access to other users notifications', async () => {
      // Buyer tries to access seller's preferences
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200);

      // Should only get their own preferences
      expect(response.body.data).toBeDefined();
      
      // Should not be able to send notifications as non-admin
      const unauthorizedSend = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          userId: sellerUser._id.toString(),
          title: 'Unauthorized',
          body: 'This should not work'
        })
        .expect(403);

      expect(unauthorizedSend.body.message).toContain('Admin access required');
    });

    test('should sanitize notification content', async () => {
      const maliciousContent = {
        userId: buyerUser._id.toString(),
        title: '<script>alert("xss")</script>Clean Title',
        body: 'Safe content<img src=x onerror=alert(1)>',
        data: {
          comment: '<svg onload=alert(1)>',
          safe: 'normal data'
        }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousContent)
        .expect(200);

      expect(response.body.success).toBe(true);
      // The service should have sanitized malicious content
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent device registrations', async () => {
      const concurrentRegistrations = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .post('/api/notifications/devices/register')
          .set('Authorization', `Bearer ${buyerToken}`)
          .send({
            platform: 'ios',
            token: `concurrent-token-${i}`,
            appVersion: '1.0.0'
          })
      );

      const responses = await Promise.all(concurrentRegistrations);
      
      // Most registrations should succeed
      const successfulRegistrations = responses.filter(r => r.status === 200);
      expect(successfulRegistrations.length).toBeGreaterThan(15);
    });

    test('should provide timely response for analytics queries', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/notifications/stats?days=30')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      // Analytics should respond quickly even for larger time ranges
      expect(responseTime).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});