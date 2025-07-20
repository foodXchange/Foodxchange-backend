import { NotificationEventHandler } from '../../../../services/notifications/NotificationEventHandler';
import { mobilePushNotificationService } from '../../../../services/notifications/MobilePushNotificationService';
import { Order } from '../../../../models/Order';
import { RFQ } from '../../../../models/RFQ';
import { User } from '../../../../models/User';
import { Product } from '../../../../models/Product';

// Mock dependencies
jest.mock('../../../../services/notifications/MobilePushNotificationService');
jest.mock('../../../../models/Order');
jest.mock('../../../../models/RFQ');
jest.mock('../../../../models/User');
jest.mock('../../../../models/Product');

describe('NotificationEventHandler', () => {
  let eventHandler: NotificationEventHandler;

  beforeEach(() => {
    eventHandler = new NotificationEventHandler();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default rules', async () => {
      await eventHandler.initialize();

      const rules = eventHandler.getNotificationRules();
      expect(rules.length).toBeGreaterThan(0);
      
      // Check for key rule types
      const eventTypes = rules.map(r => r.eventType);
      expect(eventTypes).toContain('order.created');
      expect(eventTypes).toContain('rfq.created');
      expect(eventTypes).toContain('inventory.low');
      expect(eventTypes).toContain('payment.due_soon');
    });

    test('should setup event listeners', async () => {
      const spy = jest.spyOn(eventHandler, 'on');
      await eventHandler.initialize();

      expect(spy).toHaveBeenCalledWith('business_event', expect.any(Function));
    });
  });

  describe('Business Event Handling', () => {
    test('should handle order created event', async () => {
      const order = {
        _id: 'order123',
        buyer: 'buyer123',
        supplier: 'supplier123',
        total: 150.00,
        items: [{ product: 'product123', quantity: 10 }]
      };

      const emitSpy = jest.spyOn(eventHandler, 'emit');
      await eventHandler.triggerOrderEvent('created', order);

      expect(emitSpy).toHaveBeenCalledWith('order:created', order);
    });

    test('should handle order status change event', async () => {
      const order = {
        _id: 'order123',
        buyer: 'buyer123',
        supplier: 'supplier123',
        total: 150.00,
        status: 'SHIPPED'
      };

      const handleBusinessEventSpy = jest.spyOn(eventHandler as any, 'handleBusinessEvent');
      eventHandler.emit('order:status_changed', order, 'CONFIRMED', 'SHIPPED');

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for async handling

      expect(handleBusinessEventSpy).toHaveBeenCalled();
    });

    test('should handle RFQ created event', async () => {
      const rfq = {
        _id: 'rfq123',
        buyer: 'buyer123',
        category: 'category123',
        title: 'Need Fresh Vegetables',
        description: 'Looking for organic vegetables',
        budget: 1000.00
      };

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'supplier1', company: 'company1' },
        { _id: 'supplier2', company: 'company2' }
      ]);

      (Product.find as jest.Mock).mockResolvedValue([
        { supplier: 'company1' },
        { supplier: 'company2' }
      ]);

      const mockSendBulkNotification = jest.fn().mockResolvedValue({
        success: true,
        totalSent: 2,
        failures: []
      });
      (mobilePushNotificationService.sendBulkNotification as jest.Mock) = mockSendBulkNotification;

      await eventHandler.triggerRFQEvent('created', rfq);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSendBulkNotification).toHaveBeenCalledWith(
        expect.arrayContaining(['supplier1', 'supplier2']),
        'rfq_created',
        expect.objectContaining({
          rfqId: 'rfq123',
          buyerId: 'buyer123',
          categoryId: 'category123'
        })
      );
    });

    test('should handle inventory low event', async () => {
      const product = {
        _id: 'product123',
        name: 'Organic Tomatoes',
        supplier: 'supplier123'
      };

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'user1', company: 'supplier123' },
        { _id: 'user2', company: 'supplier123' }
      ]);

      const mockSendBulkNotification = jest.fn().mockResolvedValue({
        success: true,
        totalSent: 2,
        failures: []
      });
      (mobilePushNotificationService.sendBulkNotification as jest.Mock) = mockSendBulkNotification;

      await eventHandler.triggerInventoryEvent('low', product, 5, 10);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSendBulkNotification).toHaveBeenCalledWith(
        expect.arrayContaining(['user1', 'user2']),
        'inventory_low',
        expect.objectContaining({
          productId: 'product123',
          productName: 'Organic Tomatoes',
          stock: 5,
          threshold: 10
        })
      );
    });

    test('should handle payment due soon event', async () => {
      const order = {
        _id: 'order123',
        buyer: 'buyer123',
        total: 500.00,
        paymentDueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
      };

      const mockSendBulkNotification = jest.fn().mockResolvedValue({
        success: true,
        totalSent: 1,
        failures: []
      });
      (mobilePushNotificationService.sendBulkNotification as jest.Mock) = mockSendBulkNotification;

      await eventHandler.triggerPaymentEvent('due_soon', order, 2);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockSendBulkNotification).toHaveBeenCalledWith(
        ['buyer123'],
        'payment_reminder',
        expect.objectContaining({
          orderId: 'order123',
          buyerId: 'buyer123',
          amount: 500.00,
          daysUntilDue: 2
        })
      );
    });
  });

  describe('Rule Management', () => {
    test('should add custom notification rule', () => {
      const customRule = {
        eventType: 'custom.event',
        templateId: 'custom_template',
        userSelector: async () => ['user123'],
        enabled: true
      };

      eventHandler.addNotificationRule('custom.event', customRule);

      const rules = eventHandler.getNotificationRules();
      const customEventRules = rules.find(r => r.eventType === 'custom.event');
      
      expect(customEventRules).toBeDefined();
      expect(customEventRules!.rules).toHaveLength(1);
      expect(customEventRules!.rules[0].templateId).toBe('custom_template');
    });

    test('should enable/disable notification rules', () => {
      // Enable a rule
      const enabled = eventHandler.enableNotificationRule('order.created', 'order_created');
      expect(enabled).toBe(true);

      // Disable a rule
      const disabled = eventHandler.disableNotificationRule('order.created', 'order_created');
      expect(disabled).toBe(true);

      // Try to enable non-existent rule
      const notFound = eventHandler.enableNotificationRule('nonexistent.event', 'template');
      expect(notFound).toBe(false);
    });

    test('should remove notification rules', () => {
      const removed = eventHandler.removeNotificationRule('order.created', 'order_created');
      expect(removed).toBe(true);

      const notFound = eventHandler.removeNotificationRule('nonexistent.event', 'template');
      expect(notFound).toBe(false);
    });
  });

  describe('User Selection', () => {
    test('should find suppliers for category', async () => {
      const categoryId = 'category123';

      (Product.find as jest.Mock).mockResolvedValue([
        { supplier: 'supplier1' },
        { supplier: 'supplier2' },
        { supplier: 'supplier1' } // Duplicate should be handled
      ]);

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'user1' },
        { _id: 'user2' },
        { _id: 'user3' }
      ]);

      const suppliers = await eventHandler['findSuppliersForCategory'](categoryId);

      expect(Product.find).toHaveBeenCalledWith({ category: categoryId });
      expect(User.find).toHaveBeenCalledWith({
        company: { $in: ['supplier1', 'supplier2'] },
        role: { $in: ['SELLER', 'ADMIN'] }
      });
      expect(suppliers).toEqual(['user1', 'user2', 'user3']);
    });

    test('should find product owners', async () => {
      const productId = 'product123';

      (Product.findById as jest.Mock).mockResolvedValue({
        supplier: 'supplier123'
      });

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'owner1' },
        { _id: 'owner2' }
      ]);

      const owners = await eventHandler['findProductOwners'](productId);

      expect(Product.findById).toHaveBeenCalledWith(productId);
      expect(User.find).toHaveBeenCalledWith({
        company: 'supplier123',
        role: { $in: ['SELLER', 'ADMIN'] }
      });
      expect(owners).toEqual(['owner1', 'owner2']);
    });

    test('should find interested buyers', async () => {
      const productId = 'product123';

      (Order.find as jest.Mock).mockResolvedValue([
        { buyer: 'buyer1' },
        { buyer: 'buyer2' },
        { buyer: 'buyer1' } // Duplicate should be handled
      ]);

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'user1' },
        { _id: 'user2' }
      ]);

      const buyers = await eventHandler['findInterestedBuyers'](productId);

      expect(Order.find).toHaveBeenCalledWith({ 'items.product': productId });
      expect(User.find).toHaveBeenCalledWith({
        company: { $in: ['buyer1', 'buyer2'] },
        role: { $in: ['BUYER', 'ADMIN'] }
      });
      expect(buyers).toEqual(['user1', 'user2']);
    });

    test('should find all active users', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (User.find as jest.Mock).mockResolvedValue([
        { _id: 'activeUser1' },
        { _id: 'activeUser2' },
        { _id: 'activeUser3' }
      ]);

      const activeUsers = await eventHandler['getAllActiveUsers']();

      expect(User.find).toHaveBeenCalledWith({
        active: true,
        lastLoginAt: { $gte: expect.any(Date) }
      });
      expect(activeUsers).toEqual(['activeUser1', 'activeUser2', 'activeUser3']);
    });
  });

  describe('User Preference Filtering', () => {
    test('should filter users by notification preferences', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      const templateId = 'order_created';

      // Mock user preferences
      const mockGetUserPreferences = jest.fn()
        .mockResolvedValueOnce({ enabled: true, categories: { order: true }, quietHours: null })
        .mockResolvedValueOnce({ enabled: false, categories: { order: true }, quietHours: null })
        .mockResolvedValueOnce({ enabled: true, categories: { order: false }, quietHours: null });

      (mobilePushNotificationService.getUserNotificationPreferences as jest.Mock) = mockGetUserPreferences;

      // Mock template lookup
      const mockTemplates = new Map([
        ['order_created', { category: 'order' }]
      ]);
      (mobilePushNotificationService as any).templates = mockTemplates;

      const eligibleUsers = await eventHandler['filterUsersByPreferences'](userIds, templateId);

      expect(eligibleUsers).toEqual(['user1']); // Only user1 should be eligible
    });

    test('should check quiet hours correctly', () => {
      const quietHours = { start: '22:00', end: '08:00' };

      // Mock time within quiet hours (23:30)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(23);
      jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(30);

      const isQuiet = eventHandler['isInQuietHours'](quietHours);
      expect(isQuiet).toBe(true);

      // Mock time outside quiet hours (10:00)
      Date.prototype.getHours = jest.fn().mockReturnValue(10);
      Date.prototype.getMinutes = jest.fn().mockReturnValue(0);

      const isNotQuiet = eventHandler['isInQuietHours'](quietHours);
      expect(isNotQuiet).toBe(false);
    });

    test('should handle quiet hours spanning midnight', () => {
      const quietHours = { start: '22:00', end: '08:00' };

      // Test time in early morning (2:00 AM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(2);
      jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);

      const isQuiet = eventHandler['isInQuietHours'](quietHours);
      expect(isQuiet).toBe(true);
    });
  });

  describe('Event Priority Handling', () => {
    test('should assign correct priority to events', () => {
      expect(eventHandler['getEventPriority']('order.cancelled')).toBe('high');
      expect(eventHandler['getEventPriority']('payment.overdue')).toBe('high');
      expect(eventHandler['getEventPriority']('user.registered')).toBe('low');
      expect(eventHandler['getEventPriority']('order.created')).toBe('normal');
    });

    test('should handle high priority events with urgency', async () => {
      const highPriorityEvent = {
        type: 'order.cancelled',
        data: { orderId: 'order123', buyerId: 'buyer123' },
        timestamp: new Date(),
        priority: 'high' as const
      };

      const mockSendBulkNotification = jest.fn().mockResolvedValue({
        success: true,
        totalSent: 1,
        failures: []
      });
      (mobilePushNotificationService.sendBulkNotification as jest.Mock) = mockSendBulkNotification;

      await eventHandler['handleBusinessEvent'](highPriorityEvent);

      expect(mockSendBulkNotification).toHaveBeenCalledWith(
        ['buyer123'],
        'order_cancelled',
        expect.objectContaining({ orderId: 'order123' })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle user selection errors gracefully', async () => {
      const productId = 'product123';

      (Product.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

      const owners = await eventHandler['findProductOwners'](productId);
      expect(owners).toEqual([]);
    });

    test('should handle notification sending errors gracefully', async () => {
      const userIds = ['user1'];
      const templateId = 'order_created';
      const event = {
        type: 'order.created',
        data: { orderId: 'order123' },
        timestamp: new Date()
      };

      (mobilePushNotificationService.sendBulkNotification as jest.Mock)
        .mockRejectedValue(new Error('Notification service error'));

      // Should not throw error
      await expect(
        eventHandler['sendNotificationsToUsers'](userIds, templateId, event)
      ).resolves.not.toThrow();
    });

    test('should handle rule condition errors gracefully', async () => {
      const rule = {
        eventType: 'test.event',
        templateId: 'test_template',
        condition: () => { throw new Error('Condition error'); },
        userSelector: async () => ['user1'],
        enabled: true
      };

      eventHandler.addNotificationRule('test.event', rule);

      const event = {
        type: 'test.event',
        data: {},
        timestamp: new Date()
      };

      // Should not throw error and should skip the rule
      await expect(
        eventHandler['handleBusinessEvent'](event)
      ).resolves.not.toThrow();
    });
  });

  describe('Performance', () => {
    test('should handle large number of users efficiently', async () => {
      const largeUserList = Array.from({ length: 1000 }, (_, i) => `user${i}`);
      const templateId = 'bulk_notification';
      const event = {
        type: 'promotion.started',
        data: { promotionId: 'promo123' },
        timestamp: new Date()
      };

      const mockSendBulkNotification = jest.fn().mockResolvedValue({
        success: true,
        totalSent: 1000,
        failures: []
      });
      (mobilePushNotificationService.sendBulkNotification as jest.Mock) = mockSendBulkNotification;

      const startTime = Date.now();
      await eventHandler['sendNotificationsToUsers'](largeUserList, templateId, event);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mockSendBulkNotification).toHaveBeenCalledWith(
        largeUserList,
        templateId,
        event.data
      );
    });

    test('should batch user preference checks', async () => {
      const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
      const templateId = 'test_template';

      const mockGetUserPreferences = jest.fn().mockResolvedValue({
        enabled: true,
        categories: { test: true },
        quietHours: null
      });
      (mobilePushNotificationService.getUserNotificationPreferences as jest.Mock) = mockGetUserPreferences;

      const mockTemplates = new Map([['test_template', { category: 'test' }]]);
      (mobilePushNotificationService as any).templates = mockTemplates;

      const startTime = Date.now();
      await eventHandler['filterUsersByPreferences'](userIds, templateId);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(mockGetUserPreferences).toHaveBeenCalledTimes(100);
    });
  });
});