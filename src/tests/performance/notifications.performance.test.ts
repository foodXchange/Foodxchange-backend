import { MobilePushNotificationService } from '../../services/notifications/MobilePushNotificationService';
import { NotificationEventHandler } from '../../services/notifications/NotificationEventHandler';
import { notificationIntegrationService } from '../../services/notifications/NotificationIntegrationService';

// Mock external dependencies for performance testing
jest.mock('firebase-admin');
jest.mock('node-apn');
jest.mock('web-push');
jest.mock('@azure/notification-hubs');

describe('Notification System Performance Tests', () => {
  let notificationService: MobilePushNotificationService;
  let eventHandler: NotificationEventHandler;

  beforeAll(async () => {
    notificationService = new MobilePushNotificationService();
    eventHandler = new NotificationEventHandler();
    await eventHandler.initialize();
    await notificationIntegrationService.initialize();
  });

  afterAll(async () => {
    await notificationIntegrationService.stop();
  });

  describe('Device Token Management Performance', () => {
    test('should handle large number of device registrations efficiently', async () => {
      const userCount = 1000;
      const platforms = ['ios', 'android', 'web'];
      
      console.time('Device Registration');
      
      const registrations = [];
      for (let i = 0; i < userCount; i++) {
        const platform = platforms[i % platforms.length];
        const token = `performance-token-${i}-${platform}`;
        
        registrations.push(
          notificationService.registerDeviceToken(`user${i}`, platform as any, token)
        );
      }
      
      await Promise.all(registrations);
      console.timeEnd('Device Registration');
      
      // Verify all tokens were registered
      for (let i = 0; i < Math.min(10, userCount); i++) {
        const tokens = notificationService.getDeviceTokens(`user${i}`);
        expect(tokens.length).toBeGreaterThan(0);
      }
    }, 30000);

    test('should retrieve device tokens quickly', async () => {
      const userId = 'performance-test-user';
      
      // Register multiple tokens for the user
      const platforms = ['ios', 'android', 'web'];
      for (let i = 0; i < 10; i++) {
        const platform = platforms[i % platforms.length];
        await notificationService.registerDeviceToken(
          userId, 
          platform as any, 
          `token-${i}-${platform}`
        );
      }
      
      console.time('Token Retrieval');
      
      // Perform many token retrievals
      const retrievals = Array.from({ length: 1000 }, () =>
        notificationService.getDeviceTokens(userId)
      );
      
      const results = await Promise.all(retrievals);
      console.timeEnd('Token Retrieval');
      
      expect(results[0].length).toBe(10);
      expect(results.every(r => r.length === 10)).toBe(true);
    });

    test('should unregister tokens efficiently', async () => {
      const userCount = 500;
      const tokens = [];
      
      // Register tokens
      for (let i = 0; i < userCount; i++) {
        const token = `unregister-token-${i}`;
        tokens.push(token);
        await notificationService.registerDeviceToken(`user${i}`, 'ios', token);
      }
      
      console.time('Token Unregistration');
      
      const unregistrations = tokens.map((token, i) =>
        notificationService.unregisterDeviceToken(`user${i}`, token)
      );
      
      await Promise.all(unregistrations);
      console.timeEnd('Token Unregistration');
      
      // Verify tokens were unregistered
      for (let i = 0; i < Math.min(10, userCount); i++) {
        const remainingTokens = notificationService.getDeviceTokens(`user${i}`);
        expect(remainingTokens.length).toBe(0);
      }
    });
  });

  describe('Notification Sending Performance', () => {
    test('should send single notifications quickly', async () => {
      const userCount = 100;
      
      // Register device tokens
      for (let i = 0; i < userCount; i++) {
        await notificationService.registerDeviceToken(`speed-user${i}`, 'ios', `speed-token-${i}`);
      }
      
      const notifications = Array.from({ length: userCount }, (_, i) => ({
        id: `speed-notif-${i}`,
        userId: `speed-user${i}`,
        title: 'Performance Test',
        body: `Test notification ${i}`,
        priority: 'normal' as const,
        category: 'test'
      }));
      
      console.time('Single Notifications');
      
      const sendPromises = notifications.map(notif =>
        notificationService.sendNotification(notif)
      );
      
      const results = await Promise.all(sendPromises);
      console.timeEnd('Single Notifications');
      
      expect(results.length).toBe(userCount);
      expect(results.every(r => r.success === true)).toBe(true);
    }, 15000);

    test('should handle bulk notifications efficiently', async () => {
      const userCount = 1000;
      const userIds = Array.from({ length: userCount }, (_, i) => `bulk-user${i}`);
      
      // Register device tokens for all users
      const registrations = userIds.map(userId =>
        notificationService.registerDeviceToken(userId, 'android', `bulk-token-${userId}`)
      );
      await Promise.all(registrations);
      
      console.time('Bulk Notification');
      
      const result = await notificationService.sendBulkNotification(
        userIds,
        'system_announcement',
        { message: 'Performance test bulk notification' }
      );
      
      console.timeEnd('Bulk Notification');
      
      expect(result.success).toBe(true);
      expect(result.totalSent).toBe(userCount);
      expect(result.failures.length).toBe(0);
    }, 20000);

    test('should maintain performance under concurrent load', async () => {
      const concurrentBatches = 10;
      const notificationsPerBatch = 50;
      
      // Prepare users and tokens
      for (let batch = 0; batch < concurrentBatches; batch++) {
        for (let i = 0; i < notificationsPerBatch; i++) {
          const userId = `concurrent-user-${batch}-${i}`;
          await notificationService.registerDeviceToken(userId, 'ios', `concurrent-token-${batch}-${i}`);
        }
      }
      
      console.time('Concurrent Notifications');
      
      const batchPromises = Array.from({ length: concurrentBatches }, (_, batch) => {
        const batchUserIds = Array.from({ length: notificationsPerBatch }, (_, i) =>
          `concurrent-user-${batch}-${i}`
        );
        
        return notificationService.sendBulkNotification(
          batchUserIds,
          'promotion_started',
          { batch: batch, promotionName: `Promotion ${batch}` }
        );
      });
      
      const results = await Promise.all(batchPromises);
      console.timeEnd('Concurrent Notifications');
      
      expect(results.length).toBe(concurrentBatches);
      expect(results.every(r => r.success)).toBe(true);
      
      const totalSent = results.reduce((sum, r) => sum + r.totalSent, 0);
      expect(totalSent).toBe(concurrentBatches * notificationsPerBatch);
    }, 25000);
  });

  describe('Event Handling Performance', () => {
    test('should process business events quickly', async () => {
      const eventCount = 500;
      
      console.time('Event Processing');
      
      const eventPromises = Array.from({ length: eventCount }, (_, i) => {
        const event = {
          type: 'order.created',
          data: {
            orderId: `perf-order-${i}`,
            buyerId: `perf-buyer-${i}`,
            sellerId: `perf-seller-${i}`,
            amount: 100 + i
          },
          userId: `perf-buyer-${i}`,
          timestamp: new Date(),
          priority: 'normal' as const
        };
        
        return eventHandler['handleBusinessEvent'](event);
      });
      
      await Promise.all(eventPromises);
      console.timeEnd('Event Processing');
    }, 15000);

    test('should handle rule evaluation efficiently', async () => {
      const ruleCount = 100;
      
      // Add many custom rules
      for (let i = 0; i < ruleCount; i++) {
        const rule = {
          eventType: `custom.event.${i}`,
          templateId: `custom_template_${i}`,
          condition: (event: any) => event.data.value > i,
          userSelector: async () => [`user${i}`],
          enabled: true
        };
        
        eventHandler.addNotificationRule(`custom.event.${i}`, rule);
      }
      
      console.time('Rule Evaluation');
      
      // Trigger events that will match all rules
      const eventPromises = Array.from({ length: ruleCount }, (_, i) => {
        const event = {
          type: `custom.event.${i}`,
          data: { value: ruleCount + i }, // Will match all conditions
          timestamp: new Date()
        };
        
        return eventHandler['handleBusinessEvent'](event);
      });
      
      await Promise.all(eventPromises);
      console.timeEnd('Rule Evaluation');
    });

    test('should scale user preference filtering', async () => {
      const userCount = 1000;
      const userIds = Array.from({ length: userCount }, (_, i) => `filter-user${i}`);
      
      // Mock user preferences for all users
      const mockGetUserPreferences = jest.fn().mockResolvedValue({
        enabled: true,
        categories: { order: true },
        quietHours: null
      });
      
      (notificationService.getUserNotificationPreferences as jest.Mock) = mockGetUserPreferences;
      
      console.time('Preference Filtering');
      
      const eligibleUsers = await eventHandler['filterUsersByPreferences'](userIds, 'order_created');
      
      console.timeEnd('Preference Filtering');
      
      expect(eligibleUsers.length).toBe(userCount);
      expect(mockGetUserPreferences).toHaveBeenCalledTimes(userCount);
    });
  });

  describe('Template Processing Performance', () => {
    test('should create notifications from templates quickly', async () => {
      const notificationCount = 1000;
      
      console.time('Template Processing');
      
      const notificationPromises = Array.from({ length: notificationCount }, (_, i) =>
        notificationService.createNotificationFromTemplate(
          `template-user${i}`,
          'order_shipped',
          {
            orderId: `template-order-${i}`,
            trackingNumber: `TRK${i.toString().padStart(6, '0')}`,
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          }
        )
      );
      
      const notifications = await Promise.all(notificationPromises);
      console.timeEnd('Template Processing');
      
      expect(notifications.length).toBe(notificationCount);
      expect(notifications.every(n => n.title && n.body)).toBe(true);
    });

    test('should handle template variable interpolation efficiently', async () => {
      const variableCount = 50;
      const notificationCount = 100;
      
      // Create a template with many variables
      const variables: any = {};
      for (let i = 0; i < variableCount; i++) {
        variables[`var${i}`] = `value${i}`;
      }
      
      console.time('Variable Interpolation');
      
      const notificationPromises = Array.from({ length: notificationCount }, (_, i) =>
        notificationService.createNotificationFromTemplate(
          `var-user${i}`,
          'order_created', // Using existing template
          { ...variables, orderId: `var-order-${i}` }
        )
      );
      
      const notifications = await Promise.all(notificationPromises);
      console.timeEnd('Variable Interpolation');
      
      expect(notifications.length).toBe(notificationCount);
    });
  });

  describe('Analytics Performance', () => {
    test('should generate statistics quickly', async () => {
      // Simulate notification activity
      const activityCount = 100;
      
      for (let i = 0; i < activityCount; i++) {
        await notificationService.registerDeviceToken(`stats-user${i}`, 'ios', `stats-token-${i}`);
        
        const notification = {
          id: `stats-notif-${i}`,
          userId: `stats-user${i}`,
          title: 'Stats Test',
          body: 'Statistics generation test',
          priority: 'normal' as const,
          category: 'test'
        };
        
        await notificationService.sendNotification(notification);
      }
      
      console.time('Statistics Generation');
      
      const stats = await notificationService.getNotificationStats(7);
      
      console.timeEnd('Statistics Generation');
      
      expect(stats).toMatchObject({
        sent: expect.any(Number),
        delivered: expect.any(Number),
        platform: expect.any(Object),
        categories: expect.any(Object)
      });
    });

    test('should handle large date range queries efficiently', async () => {
      console.time('Large Date Range Query');
      
      const stats = await notificationService.getNotificationStats(90); // 90 days
      
      console.timeEnd('Large Date Range Query');
      
      expect(stats).toBeDefined();
    });
  });

  describe('Memory and Resource Management', () => {
    test('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform intensive operations
      const operations = Array.from({ length: 1000 }, async (_, i) => {
        await notificationService.registerDeviceToken(`memory-user${i}`, 'ios', `memory-token-${i}`);
        
        const notification = {
          id: `memory-notif-${i}`,
          userId: `memory-user${i}`,
          title: 'Memory Test',
          body: 'Memory management test',
          priority: 'normal' as const,
          category: 'test'
        };
        
        await notificationService.sendNotification(notification);
        
        if (i % 100 === 0) {
          // Force garbage collection occasionally
          if (global.gc) {
            global.gc();
          }
        }
      });
      
      await Promise.all(operations);
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercentage = (memoryIncrease / initialMemory.heapUsed) * 100;
      
      console.log(`Memory increase: ${memoryIncreasePercentage.toFixed(2)}%`);
      
      // Memory increase should be reasonable (less than 200%)
      expect(memoryIncreasePercentage).toBeLessThan(200);
    }, 30000);

    test('should clean up resources properly', async () => {
      const userCount = 100;
      
      // Create and then remove many device tokens
      for (let i = 0; i < userCount; i++) {
        await notificationService.registerDeviceToken(`cleanup-user${i}`, 'ios', `cleanup-token-${i}`);
      }
      
      for (let i = 0; i < userCount; i++) {
        await notificationService.unregisterDeviceToken(`cleanup-user${i}`, `cleanup-token-${i}`);
      }
      
      // Verify cleanup
      for (let i = 0; i < Math.min(10, userCount); i++) {
        const tokens = notificationService.getDeviceTokens(`cleanup-user${i}`);
        expect(tokens.length).toBe(0);
      }
    });
  });

  describe('Scalability Benchmarks', () => {
    test('should demonstrate linear scalability', async () => {
      const testSizes = [100, 500, 1000];
      const results: { size: number; time: number; throughput: number }[] = [];
      
      for (const size of testSizes) {
        // Register users
        for (let i = 0; i < size; i++) {
          await notificationService.registerDeviceToken(`scale-user${i}`, 'ios', `scale-token-${i}`);
        }
        
        const userIds = Array.from({ length: size }, (_, i) => `scale-user${i}`);
        
        const startTime = Date.now();
        
        await notificationService.sendBulkNotification(
          userIds,
          'system_announcement',
          { message: `Scalability test for ${size} users` }
        );
        
        const endTime = Date.now();
        const time = endTime - startTime;
        const throughput = size / (time / 1000); // notifications per second
        
        results.push({ size, time, throughput });
        
        console.log(`Size: ${size}, Time: ${time}ms, Throughput: ${throughput.toFixed(2)} notifications/sec`);
      }
      
      // Verify that performance doesn't degrade significantly
      expect(results[0].throughput).toBeGreaterThan(0);
      expect(results[1].throughput).toBeGreaterThan(0);
      expect(results[2].throughput).toBeGreaterThan(0);
      
      // Throughput should not decrease dramatically with size
      const throughputRatio = results[2].throughput / results[0].throughput;
      expect(throughputRatio).toBeGreaterThan(0.3); // Allow some degradation but not too much
    }, 45000);
  });
});