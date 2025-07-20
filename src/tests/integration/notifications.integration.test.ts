import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import notificationRoutes from '../../routes/notifications';
import { auth } from '../../middleware/auth';
import { User } from '../../models/User';
import { notificationIntegrationService } from '../../services/notifications/NotificationIntegrationService';
import jwt from 'jsonwebtoken';

// Mock external notification services
jest.mock('../../services/notifications/MobilePushNotificationService');
jest.mock('firebase-admin');
jest.mock('node-apn');
jest.mock('web-push');

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);

describe('Notification Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let adminToken: string;
  let userToken: string;
  let adminUser: any;
  let regularUser: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test users
    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'hashedpassword',
      role: 'ADMIN',
      verified: true,
      active: true
    });

    regularUser = await User.create({
      name: 'Regular User',
      email: 'user@test.com',
      password: 'hashedpassword',
      role: 'BUYER',
      verified: true,
      active: true
    });

    // Generate JWT tokens
    adminToken = jwt.sign(
      { id: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    userToken = jwt.sign(
      { id: regularUser._id, role: regularUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clean up test data after each test
    jest.clearAllMocks();
  });

  describe('Device Registration', () => {
    test('should register device token successfully', async () => {
      const deviceData = {
        platform: 'ios',
        token: 'test-device-token-123',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 14',
        osVersion: '17.0'
      };

      const response = await request(app)
        .post('/api/notifications/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send(deviceData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registered successfully');
    });

    test('should validate device registration data', async () => {
      const invalidData = {
        platform: 'invalid-platform',
        token: '',
        appVersion: 123
      };

      const response = await request(app)
        .post('/api/notifications/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('should require authentication for device registration', async () => {
      const deviceData = {
        platform: 'ios',
        token: 'test-device-token-123'
      };

      await request(app)
        .post('/api/notifications/devices/register')
        .send(deviceData)
        .expect(401);
    });

    test('should unregister device token', async () => {
      const tokenData = {
        token: 'test-device-token-to-remove'
      };

      const response = await request(app)
        .delete('/api/notifications/devices/unregister')
        .set('Authorization', `Bearer ${userToken}`)
        .send(tokenData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('unregistered successfully');
    });
  });

  describe('Manual Notification Sending', () => {
    test('should allow admin to send notification', async () => {
      const notificationData = {
        userId: regularUser._id.toString(),
        title: 'Test Notification',
        body: 'This is a test notification',
        priority: 'normal',
        category: 'test',
        data: { type: 'manual_test' }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(notificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent successfully');
    });

    test('should reject non-admin notification sending', async () => {
      const notificationData = {
        userId: adminUser._id.toString(),
        title: 'Unauthorized Notification',
        body: 'This should not be sent'
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${userToken}`)
        .send(notificationData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Admin access required');
    });

    test('should schedule notification for future delivery', async () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      const notificationData = {
        userId: regularUser._id.toString(),
        title: 'Scheduled Notification',
        body: 'This is scheduled for later',
        scheduledAt: futureDate.toISOString()
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(notificationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('scheduled successfully');
      expect(response.body.data.scheduleId).toBeDefined();
    });

    test('should validate notification data', async () => {
      const invalidData = {
        userId: 'invalid-user-id',
        title: '',
        body: '',
        priority: 'invalid-priority'
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Bulk Notification Sending', () => {
    test('should send bulk notifications to multiple users', async () => {
      const bulkData = {
        userIds: [regularUser._id.toString(), adminUser._id.toString()],
        templateId: 'system_announcement',
        variables: {
          announcementTitle: 'System Maintenance',
          scheduledTime: '2024-02-15 02:00 UTC'
        }
      };

      const response = await request(app)
        .post('/api/notifications/bulk-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bulkData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalSent).toBeGreaterThan(0);
    });

    test('should limit bulk notification size', async () => {
      const largeUserList = Array.from({ length: 1001 }, (_, i) => `user${i}`);
      const bulkData = {
        userIds: largeUserList,
        templateId: 'test_template'
      };

      const response = await request(app)
        .post('/api/notifications/bulk-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(bulkData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Maximum 1000 users');
    });

    test('should validate bulk notification data', async () => {
      const invalidData = {
        userIds: 'not-an-array',
        templateId: '',
        variables: 'not-an-object'
      };

      const response = await request(app)
        .post('/api/notifications/bulk-send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('User Preferences', () => {
    test('should get user notification preferences', async () => {
      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        enabled: expect.any(Boolean),
        categories: expect.any(Object),
        quietHours: expect.any(Object)
      });
    });

    test('should update user notification preferences', async () => {
      const preferences = {
        enabled: false,
        categories: {
          order: true,
          promotion: false,
          rfq: true
        },
        quietHours: {
          start: '23:00',
          end: '07:00'
        },
        timezone: 'America/New_York'
      };

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send(preferences)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');
    });

    test('should validate preference updates', async () => {
      const invalidPreferences = {
        enabled: 'not-boolean',
        categories: 'not-object',
        quietHours: {
          start: 'invalid-time',
          end: '25:00'
        }
      };

      const response = await request(app)
        .put('/api/notifications/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send(invalidPreferences)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Test Notifications', () => {
    test('should send test notification to authenticated user', async () => {
      const response = await request(app)
        .post('/api/notifications/test')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Test notification sent');
      expect(response.body.data).toBeDefined();
    });

    test('should require authentication for test notifications', async () => {
      await request(app)
        .post('/api/notifications/test')
        .expect(401);
    });
  });

  describe('Admin Statistics', () => {
    test('should provide notification statistics to admin', async () => {
      const response = await request(app)
        .get('/api/notifications/stats?days=7')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        sent: expect.any(Number),
        delivered: expect.any(Number),
        opened: expect.any(Number),
        failed: expect.any(Number),
        platform: expect.any(Object),
        categories: expect.any(Object),
        period: '7 days',
        generatedAt: expect.any(String)
      });
    });

    test('should reject non-admin access to statistics', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Admin access required');
    });

    test('should validate statistics query parameters', async () => {
      const response = await request(app)
        .get('/api/notifications/stats?days=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Scheduled Notification Management', () => {
    test('should cancel scheduled notification', async () => {
      const scheduleId = 'test-schedule-id-123';

      const response = await request(app)
        .delete(`/api/notifications/scheduled/${scheduleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled successfully');
    });

    test('should handle non-existent scheduled notification', async () => {
      const nonExistentId = 'non-existent-schedule-id';

      const response = await request(app)
        .delete(`/api/notifications/scheduled/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should require admin access for cancelling scheduled notifications', async () => {
      const scheduleId = 'test-schedule-id';

      const response = await request(app)
        .delete(`/api/notifications/scheduled/${scheduleId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Admin access required');
    });
  });

  describe('Template Management', () => {
    test('should get notification templates for admin', async () => {
      const response = await request(app)
        .get('/api/notifications/templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should reject non-admin access to templates', async () => {
      const response = await request(app)
        .get('/api/notifications/templates')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Admin access required');
    });
  });

  describe('Rule Management', () => {
    test('should get notification rules for admin', async () => {
      const response = await request(app)
        .get('/api/notifications/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should toggle notification rules', async () => {
      const eventType = 'order.created';
      const templateId = 'order_created';

      const response = await request(app)
        .put(`/api/notifications/rules/${eventType}/${templateId}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('disabled successfully');
    });

    test('should validate rule toggle data', async () => {
      const eventType = 'order.created';
      const templateId = 'order_created';

      const response = await request(app)
        .put(`/api/notifications/rules/${eventType}/${templateId}/toggle`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: 'not-boolean' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to notification endpoints', async () => {
      const deviceData = {
        platform: 'ios',
        token: 'rate-limit-test-token'
      };

      // Make multiple rapid requests to test rate limiting
      const requests = Array.from({ length: 12 }, () =>
        request(app)
          .post('/api/notifications/devices/register')
          .set('Authorization', `Bearer ${userToken}`)
          .send(deviceData)
      );

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited (status 429)
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should have separate rate limits for device registration', async () => {
      // Device registration should have stricter limits
      const deviceData = {
        platform: 'ios',
        token: 'device-rate-limit-test'
      };

      // Make requests up to the device registration limit
      const requests = Array.from({ length: 11 }, () =>
        request(app)
          .post('/api/notifications/devices/register')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ ...deviceData, token: `token-${Math.random()}` })
      );

      const responses = await Promise.all(requests);
      
      // The last request should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
    });
  });

  describe('Error Handling', () => {
    test('should handle service unavailable gracefully', async () => {
      // Mock service to throw error
      const originalSend = notificationIntegrationService.sendNotification;
      notificationIntegrationService.sendNotification = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      );

      const notificationData = {
        userId: regularUser._id.toString(),
        title: 'Test Notification',
        body: 'This should fail'
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(notificationData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to send notification');

      // Restore original method
      notificationIntegrationService.sendNotification = originalSend;
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle database connection errors', async () => {
      // Temporarily close database connection
      await mongoose.connection.close();

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);

      // Reconnect database
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    });
  });

  describe('Security', () => {
    test('should sanitize input data', async () => {
      const maliciousData = {
        userId: regularUser._id.toString(),
        title: '<script>alert("xss")</script>Test',
        body: 'Safe content<script>evil()</script>',
        data: {
          comment: '<img src=x onerror=alert(1)>',
          safe: 'normal text'
        }
      };

      const response = await request(app)
        .post('/api/notifications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(maliciousData)
        .expect(200);

      expect(response.body.success).toBe(true);
      // The service should have sanitized the malicious content
    });

    test('should validate JWT token integrity', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should prevent notification access for inactive users', async () => {
      // Create inactive user
      const inactiveUser = await User.create({
        name: 'Inactive User',
        email: 'inactive@test.com',
        password: 'hashedpassword',
        role: 'BUYER',
        verified: true,
        active: false
      });

      const inactiveToken = jwt.sign(
        { id: inactiveUser._id, role: inactiveUser.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/notifications/preferences')
        .set('Authorization', `Bearer ${inactiveToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});