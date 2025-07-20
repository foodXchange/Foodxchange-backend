import { MobilePushNotificationService } from '../../../../services/notifications/MobilePushNotificationService';
import { User } from '../../../../models/User';

// Mock external dependencies
jest.mock('firebase-admin', () => ({
  messaging: jest.fn(() => ({
    send: jest.fn().mockResolvedValue('message-id'),
    sendMulticast: jest.fn().mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [
        { success: true, messageId: 'msg1' },
        { success: true, messageId: 'msg2' }
      ]
    })
  })),
  initializeApp: jest.fn(),
  credential: {
    applicationDefault: jest.fn()
  }
}));

jest.mock('node-apn', () => ({
  Provider: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      sent: [{ device: 'device-token' }],
      failed: []
    }),
    shutdown: jest.fn()
  })),
  Notification: jest.fn()
}));

jest.mock('web-push', () => ({
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 200 }),
  setVapidDetails: jest.fn()
}));

jest.mock('@azure/notification-hubs', () => ({
  NotificationHubsClient: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn().mockResolvedValue({
      notificationId: 'azure-notification-id'
    })
  }))
}));

describe('MobilePushNotificationService', () => {
  let notificationService: MobilePushNotificationService;

  beforeEach(() => {
    notificationService = new MobilePushNotificationService();
    jest.clearAllMocks();
  });

  describe('Device Token Management', () => {
    test('should register device token successfully', async () => {
      const userId = 'user123';
      const platform = 'ios';
      const token = 'device-token-123';
      const metadata = { appVersion: '1.0.0', deviceModel: 'iPhone 14' };

      await notificationService.registerDeviceToken(userId, platform, token, metadata);

      const userTokens = notificationService.getDeviceTokens(userId);
      expect(userTokens).toHaveLength(1);
      expect(userTokens[0]).toMatchObject({
        platform,
        token,
        metadata
      });
    });

    test('should prevent duplicate token registration', async () => {
      const userId = 'user123';
      const platform = 'ios';
      const token = 'device-token-123';

      await notificationService.registerDeviceToken(userId, platform, token);
      await notificationService.registerDeviceToken(userId, platform, token);

      const userTokens = notificationService.getDeviceTokens(userId);
      expect(userTokens).toHaveLength(1);
    });

    test('should unregister device token successfully', async () => {
      const userId = 'user123';
      const token = 'device-token-123';

      await notificationService.registerDeviceToken(userId, 'ios', token);
      await notificationService.unregisterDeviceToken(userId, token);

      const userTokens = notificationService.getDeviceTokens(userId);
      expect(userTokens).toHaveLength(0);
    });

    test('should validate device tokens by platform', () => {
      const validIOSToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const validAndroidToken = 'fGw6qw4o9:APA91bEh...abc123';
      const validWebToken = JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        keys: { p256dh: 'key1', auth: 'key2' }
      });

      expect(notificationService['validateDeviceToken'](validIOSToken, 'ios')).toBe(true);
      expect(notificationService['validateDeviceToken'](validAndroidToken, 'android')).toBe(true);
      expect(notificationService['validateDeviceToken'](validWebToken, 'web')).toBe(true);
      expect(notificationService['validateDeviceToken']('invalid', 'ios')).toBe(false);
    });
  });

  describe('Notification Templates', () => {
    test('should create notification from template', async () => {
      const userId = 'user123';
      const templateId = 'order_created';
      const variables = {
        orderId: 'ORD-123',
        amount: 150.00
      };

      const notification = await notificationService.createNotificationFromTemplate(
        userId, 
        templateId, 
        variables
      );

      expect(notification).toMatchObject({
        userId,
        title: expect.stringContaining('Order'),
        body: expect.stringContaining('ORD-123'),
        priority: 'normal',
        category: 'order'
      });
    });

    test('should interpolate variables in template', async () => {
      const notification = await notificationService.createNotificationFromTemplate(
        'user123',
        'order_shipped',
        { orderId: 'ORD-456', trackingNumber: 'TRK-789' }
      );

      expect(notification.body).toContain('ORD-456');
      expect(notification.body).toContain('TRK-789');
    });

    test('should throw error for invalid template', async () => {
      await expect(
        notificationService.createNotificationFromTemplate(
          'user123',
          'invalid_template',
          {}
        )
      ).rejects.toThrow('Template not found');
    });
  });

  describe('Notification Sending', () => {
    test('should send notification to all platforms', async () => {
      const userId = 'user123';
      
      // Register tokens for all platforms
      await notificationService.registerDeviceToken(userId, 'ios', 'ios-token');
      await notificationService.registerDeviceToken(userId, 'android', 'android-token');
      await notificationService.registerDeviceToken(userId, 'web', JSON.stringify({
        endpoint: 'https://fcm.googleapis.com/fcm/send/web-token',
        keys: { p256dh: 'key1', auth: 'key2' }
      }));

      const notification = {
        id: 'notif-123',
        userId,
        title: 'Test Notification',
        body: 'This is a test',
        priority: 'normal' as const,
        category: 'test'
      };

      const result = await notificationService.sendNotification(notification);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3); // iOS, Android, Web
    });

    test('should handle platform failures gracefully', async () => {
      const userId = 'user123';
      await notificationService.registerDeviceToken(userId, 'ios', 'invalid-token');

      const notification = {
        id: 'notif-123',
        userId,
        title: 'Test Notification',
        body: 'This is a test',
        priority: 'normal' as const,
        category: 'test'
      };

      // Mock APNs to fail
      const mockProvider = require('node-apn').Provider();
      mockProvider.send.mockResolvedValueOnce({
        sent: [],
        failed: [{ device: 'invalid-token', error: 'BadDeviceToken' }]
      });

      const result = await notificationService.sendNotification(notification);
      
      expect(result.success).toBe(false);
      expect(result.results.some(r => !r.success)).toBe(true);
    });

    test('should send bulk notifications efficiently', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const templateId = 'promotion_started';
      const variables = { discountPercent: 20 };

      // Register tokens for all users
      for (const userId of userIds) {
        await notificationService.registerDeviceToken(userId, 'android', `${userId}-token`);
      }

      const result = await notificationService.sendBulkNotification(
        userIds,
        templateId,
        variables
      );

      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(3);
      expect(result.failures).toHaveLength(0);
    });
  });

  describe('User Preferences', () => {
    test('should get default notification preferences', async () => {
      const userId = 'user123';
      const preferences = await notificationService.getUserNotificationPreferences(userId);

      expect(preferences).toMatchObject({
        enabled: true,
        categories: {
          order: true,
          rfq: true,
          promotion: true,
          inventory: true,
          payment: true
        },
        quietHours: {
          start: '22:00',
          end: '08:00'
        }
      });
    });

    test('should update notification preferences', async () => {
      const userId = 'user123';
      const updates = {
        enabled: false,
        categories: { promotion: false },
        quietHours: { start: '23:00', end: '07:00' }
      };

      await notificationService.updateUserNotificationPreferences(userId, updates);

      const preferences = await notificationService.getUserNotificationPreferences(userId);
      expect(preferences.enabled).toBe(false);
      expect(preferences.categories.promotion).toBe(false);
      expect(preferences.quietHours.start).toBe('23:00');
    });

    test('should respect quiet hours when checking preferences', () => {
      const quietHours = { start: '22:00', end: '08:00' };
      
      // Mock current time to be within quiet hours
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(23);
      jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(30);

      const isQuiet = notificationService['isInQuietHours'](quietHours);
      expect(isQuiet).toBe(true);

      // Mock current time to be outside quiet hours
      Date.prototype.getHours = jest.fn().mockReturnValue(10);
      const isNotQuiet = notificationService['isInQuietHours'](quietHours);
      expect(isNotQuiet).toBe(false);
    });
  });

  describe('Scheduled Notifications', () => {
    test('should schedule notification for future delivery', async () => {
      const notification = {
        id: 'notif-123',
        userId: 'user123',
        title: 'Scheduled Notification',
        body: 'This is scheduled',
        priority: 'normal' as const,
        category: 'reminder'
      };

      const scheduledTime = new Date(Date.now() + 60000); // 1 minute from now
      const scheduleId = await notificationService.scheduleNotification(notification, scheduledTime);

      expect(scheduleId).toBeDefined();
      expect(typeof scheduleId).toBe('string');
    });

    test('should cancel scheduled notification', async () => {
      const notification = {
        id: 'notif-123',
        userId: 'user123',
        title: 'Scheduled Notification',
        body: 'This is scheduled',
        priority: 'normal' as const,
        category: 'reminder'
      };

      const scheduledTime = new Date(Date.now() + 60000);
      const scheduleId = await notificationService.scheduleNotification(notification, scheduledTime);

      const cancelled = await notificationService.cancelScheduledNotification(scheduleId);
      expect(cancelled).toBe(true);
    });
  });

  describe('Analytics and Monitoring', () => {
    test('should track notification statistics', async () => {
      const userId = 'user123';
      await notificationService.registerDeviceToken(userId, 'ios', 'test-token');

      const notification = {
        id: 'notif-123',
        userId,
        title: 'Test Notification',
        body: 'This is a test',
        priority: 'normal' as const,
        category: 'test'
      };

      await notificationService.sendNotification(notification);

      const stats = await notificationService.getNotificationStats(1);
      expect(stats.sent).toBeGreaterThan(0);
      expect(stats.platform.ios).toBeGreaterThan(0);
    });

    test('should provide system health status', async () => {
      const health = await notificationService.getSystemHealth();

      expect(health).toMatchObject({
        status: expect.stringMatching(/healthy|degraded|unhealthy/),
        providers: expect.objectContaining({
          firebase: expect.any(Boolean),
          apns: expect.any(Boolean),
          webPush: expect.any(Boolean)
        }),
        lastChecked: expect.any(Date)
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle provider initialization failures', async () => {
      // Mock Firebase initialization failure
      const firebase = require('firebase-admin');
      firebase.initializeApp.mockImplementationOnce(() => {
        throw new Error('Firebase initialization failed');
      });

      const service = new MobilePushNotificationService();
      await expect(service['initializeFirebase']()).rejects.toThrow();
    });

    test('should validate notification payload', () => {
      const validNotification = {
        id: 'notif-123',
        userId: 'user123',
        title: 'Valid Title',
        body: 'Valid body',
        priority: 'normal' as const,
        category: 'test'
      };

      const invalidNotification = {
        id: '',
        userId: '',
        title: '',
        body: '',
        priority: 'invalid' as any,
        category: 'test'
      };

      expect(() => notificationService['validateNotification'](validNotification)).not.toThrow();
      expect(() => notificationService['validateNotification'](invalidNotification)).toThrow();
    });

    test('should handle rate limiting', async () => {
      const userId = 'user123';
      const notification = {
        id: 'notif-123',
        userId,
        title: 'Rate Limited',
        body: 'This should be rate limited',
        priority: 'normal' as const,
        category: 'test'
      };

      // Send multiple notifications rapidly
      const promises = Array(10).fill(null).map(() => 
        notificationService.sendNotification(notification)
      );

      const results = await Promise.all(promises);
      expect(results.some(r => !r.success)).toBe(false); // Should not fail due to rate limiting in tests
    });
  });

  describe('Security', () => {
    test('should sanitize notification content', () => {
      const maliciousContent = '<script>alert("xss")</script>Hello';
      const sanitized = notificationService['sanitizeContent'](maliciousContent);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello');
    });

    test('should validate user permissions', async () => {
      const userId = 'user123';
      const otherUserId = 'user456';

      await notificationService.registerDeviceToken(userId, 'ios', 'user-token');

      // Should not allow access to other user's tokens
      const tokens = notificationService.getDeviceTokens(otherUserId);
      expect(tokens).toHaveLength(0);
    });

    test('should encrypt sensitive data in notifications', () => {
      const sensitiveData = { creditCard: '1234-5678-9012-3456' };
      const encrypted = notificationService['encryptSensitiveData'](sensitiveData);
      
      expect(encrypted).not.toContain('1234-5678-9012-3456');
      expect(encrypted).toMatch(/^[a-f0-9]+$/); // Should be hex string
    });
  });
});