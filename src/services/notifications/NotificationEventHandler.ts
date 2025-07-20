import { EventEmitter } from 'events';

import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Proposal } from '../../models/Proposal';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';

import { mobilePushNotificationService, PushNotification } from './MobilePushNotificationService';

const logger = new Logger('NotificationEventHandler');

export interface BusinessEvent {
  type: string;
  data: any;
  userId?: string;
  companyId?: string;
  timestamp: Date;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationRule {
  eventType: string;
  templateId: string;
  condition?: (event: BusinessEvent) => boolean;
  userSelector: (event: BusinessEvent) => Promise<string[]>;
  delay?: number; // milliseconds
  enabled: boolean;
}

export class NotificationEventHandler extends EventEmitter {
  private readonly rules: Map<string, NotificationRule[]> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.setupDefaultRules();
  }

  async initialize(): Promise<void> {
    try {
      this.setupEventListeners();
      this.isInitialized = true;
      logger.info('Notification event handler initialized');
    } catch (error) {
      logger.error('Failed to initialize notification event handler', error);
      throw error;
    }
  }

  private setupDefaultRules(): void {
    const defaultRules: NotificationRule[] = [
      // Order Events
      {
        eventType: 'order.created',
        templateId: 'order_created',
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'order.confirmed',
        templateId: 'order_created',
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'order.shipped',
        templateId: 'order_shipped',
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'order.delivered',
        templateId: 'order_delivered',
        userSelector: async (event) => [event.data.buyerId],
        delay: 1000 * 60 * 30, // 30 minutes delay
        enabled: true
      },
      {
        eventType: 'order.cancelled',
        templateId: 'order_cancelled',
        userSelector: async (event) => [event.data.buyerId, event.data.sellerId],
        enabled: true
      },

      // RFQ Events
      {
        eventType: 'rfq.created',
        templateId: 'rfq_created',
        userSelector: async (event) => {
          // Notify relevant suppliers in the category
          return await this.findSuppliersForCategory(event.data.categoryId);
        },
        enabled: true
      },
      {
        eventType: 'proposal.received',
        templateId: 'rfq_response',
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'proposal.accepted',
        templateId: 'proposal_accepted',
        userSelector: async (event) => [event.data.supplierId],
        enabled: true
      },
      {
        eventType: 'proposal.rejected',
        templateId: 'proposal_rejected',
        userSelector: async (event) => [event.data.supplierId],
        enabled: true
      },

      // Inventory Events
      {
        eventType: 'inventory.low',
        templateId: 'inventory_low',
        condition: (event) => event.data.stock <= event.data.threshold,
        userSelector: async (event) => await this.findProductOwners(event.data.productId),
        enabled: true
      },
      {
        eventType: 'inventory.out_of_stock',
        templateId: 'inventory_out',
        userSelector: async (event) => await this.findProductOwners(event.data.productId),
        enabled: true
      },

      // Price Events
      {
        eventType: 'price.drop',
        templateId: 'price_alert',
        condition: (event) => event.data.discountPercentage >= 10,
        userSelector: async (event) => await this.findInterestedBuyers(event.data.productId),
        enabled: true
      },
      {
        eventType: 'price.increase',
        templateId: 'price_increase',
        condition: (event) => event.data.increasePercentage >= 20,
        userSelector: async (event) => await this.findInterestedBuyers(event.data.productId),
        enabled: true
      },

      // Payment Events
      {
        eventType: 'payment.due_soon',
        templateId: 'payment_reminder',
        condition: (event) => event.data.daysUntilDue <= 3,
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'payment.overdue',
        templateId: 'payment_overdue',
        userSelector: async (event) => [event.data.buyerId],
        enabled: true
      },
      {
        eventType: 'payment.received',
        templateId: 'payment_received',
        userSelector: async (event) => [event.data.sellerId],
        enabled: true
      },

      // User Events
      {
        eventType: 'user.registered',
        templateId: 'welcome',
        userSelector: async (event) => [event.data.userId],
        delay: 1000 * 60 * 5, // 5 minutes delay
        enabled: true
      },
      {
        eventType: 'user.verified',
        templateId: 'account_verified',
        userSelector: async (event) => [event.data.userId],
        enabled: true
      },

      // Promotion Events
      {
        eventType: 'promotion.started',
        templateId: 'promotion_started',
        userSelector: async (event) => await this.findTargetedUsers(event.data.targetCriteria),
        enabled: true
      },
      {
        eventType: 'promotion.ending_soon',
        templateId: 'promotion_ending',
        condition: (event) => event.data.hoursRemaining <= 24,
        userSelector: async (event) => await this.findPromotionParticipants(event.data.promotionId),
        enabled: true
      },

      // Quality Events
      {
        eventType: 'quality.issue_reported',
        templateId: 'quality_issue',
        userSelector: async (event) => await this.findProductOwners(event.data.productId),
        enabled: true
      },

      // System Events
      {
        eventType: 'system.maintenance',
        templateId: 'maintenance_notice',
        condition: (event) => event.data.duration >= 30, // 30+ minutes
        userSelector: async (event) => await this.getAllActiveUsers(),
        enabled: true
      }
    ];

    // Group rules by event type
    defaultRules.forEach(rule => {
      if (!this.rules.has(rule.eventType)) {
        this.rules.set(rule.eventType, []);
      }
      this.rules.get(rule.eventType).push(rule);
    });

    logger.info(`Loaded ${defaultRules.length} notification rules`);
  }

  private setupEventListeners(): void {
    // Listen for business events and trigger notifications
    this.on('business_event', async (event: BusinessEvent) => {
      await this.handleBusinessEvent(event);
    });

    // Setup specific event handlers
    this.setupOrderEventHandlers();
    this.setupRFQEventHandlers();
    this.setupInventoryEventHandlers();
    this.setupPaymentEventHandlers();
    this.setupUserEventHandlers();
  }

  private setupOrderEventHandlers(): void {
    this.on('order:created', async (order: any) => {
      await this.emitBusinessEvent({
        type: 'order.created',
        data: {
          orderId: order._id,
          buyerId: order.buyer,
          sellerId: order.supplier,
          amount: order.total,
          items: order.items
        },
        userId: order.buyer,
        companyId: order.buyer,
        timestamp: new Date(),
        priority: 'normal'
      });
    });

    this.on('order:status_changed', async (order: any, oldStatus: string, newStatus: string) => {
      const eventType = `order.${newStatus.toLowerCase()}`;

      await this.emitBusinessEvent({
        type: eventType,
        data: {
          orderId: order._id,
          buyerId: order.buyer,
          sellerId: order.supplier,
          oldStatus,
          newStatus,
          amount: order.total
        },
        userId: order.buyer,
        timestamp: new Date(),
        priority: newStatus === 'delivered' ? 'high' : 'normal'
      });
    });
  }

  private setupRFQEventHandlers(): void {
    this.on('rfq:created', async (rfq: any) => {
      await this.emitBusinessEvent({
        type: 'rfq.created',
        data: {
          rfqId: rfq._id,
          buyerId: rfq.buyer,
          categoryId: rfq.category,
          title: rfq.title,
          description: rfq.description,
          budget: rfq.budget
        },
        userId: rfq.buyer,
        timestamp: new Date(),
        priority: 'normal'
      });
    });

    this.on('proposal:submitted', async (proposal: any) => {
      await this.emitBusinessEvent({
        type: 'proposal.received',
        data: {
          proposalId: proposal._id,
          rfqId: proposal.rfq,
          buyerId: proposal.rfq.buyer,
          supplierId: proposal.supplier,
          price: proposal.price
        },
        timestamp: new Date(),
        priority: 'high'
      });
    });
  }

  private setupInventoryEventHandlers(): void {
    this.on('inventory:low', async (product: any, currentStock: number, threshold: number) => {
      await this.emitBusinessEvent({
        type: 'inventory.low',
        data: {
          productId: product._id,
          productName: product.name,
          stock: currentStock,
          threshold,
          supplierId: product.supplier
        },
        timestamp: new Date(),
        priority: 'high'
      });
    });

    this.on('inventory:out_of_stock', async (product: any) => {
      await this.emitBusinessEvent({
        type: 'inventory.out_of_stock',
        data: {
          productId: product._id,
          productName: product.name,
          supplierId: product.supplier
        },
        timestamp: new Date(),
        priority: 'high'
      });
    });
  }

  private setupPaymentEventHandlers(): void {
    this.on('payment:due_soon', async (order: any, daysUntilDue: number) => {
      await this.emitBusinessEvent({
        type: 'payment.due_soon',
        data: {
          orderId: order._id,
          buyerId: order.buyer,
          amount: order.total,
          daysUntilDue
        },
        timestamp: new Date(),
        priority: 'high'
      });
    });

    this.on('payment:overdue', async (order: any) => {
      await this.emitBusinessEvent({
        type: 'payment.overdue',
        data: {
          orderId: order._id,
          buyerId: order.buyer,
          amount: order.total,
          daysOverdue: Math.floor((Date.now() - order.dueDate.getTime()) / (1000 * 60 * 60 * 24))
        },
        timestamp: new Date(),
        priority: 'high'
      });
    });
  }

  private setupUserEventHandlers(): void {
    this.on('user:registered', async (user: any) => {
      await this.emitBusinessEvent({
        type: 'user.registered',
        data: {
          userId: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        userId: user._id,
        timestamp: new Date(),
        priority: 'normal'
      });
    });

    this.on('user:verified', async (user: any) => {
      await this.emitBusinessEvent({
        type: 'user.verified',
        data: {
          userId: user._id,
          email: user.email,
          name: user.name
        },
        userId: user._id,
        timestamp: new Date(),
        priority: 'normal'
      });
    });
  }

  private async emitBusinessEvent(event: BusinessEvent): Promise<void> {
    try {
      this.emit('business_event', event);

      logger.debug('Business event emitted', {
        type: event.type,
        userId: event.userId,
        priority: event.priority
      });

    } catch (error) {
      logger.error('Failed to emit business event', error);
    }
  }

  private async handleBusinessEvent(event: BusinessEvent): Promise<void> {
    try {
      const rules = this.rules.get(event.type) || [];

      for (const rule of rules) {
        if (!rule.enabled) continue;

        // Check condition if specified
        if (rule.condition && !rule.condition(event)) {
          continue;
        }

        // Get target users
        const userIds = await rule.userSelector(event);
        if (userIds.length === 0) continue;

        // Apply delay if specified
        const delay = rule.delay || 0;

        if (delay > 0) {
          setTimeout(async () => {
            await this.sendNotificationsToUsers(userIds, rule.templateId, event);
          }, delay);
        } else {
          await this.sendNotificationsToUsers(userIds, rule.templateId, event);
        }
      }

    } catch (error) {
      logger.error('Failed to handle business event', error);
    }
  }

  private async sendNotificationsToUsers(
    userIds: string[],
    templateId: string,
    event: BusinessEvent
  ): Promise<void> {
    try {
      // Check user preferences and filter accordingly
      const eligibleUsers = await this.filterUsersByPreferences(userIds, templateId);

      if (eligibleUsers.length === 0) return;

      // Send bulk notification
      const result = await mobilePushNotificationService.sendBulkNotification(
        eligibleUsers,
        templateId,
        event.data
      );

      logger.info('Event notifications sent', {
        eventType: event.type,
        templateId,
        totalUsers: eligibleUsers.length,
        sentCount: result.totalSent,
        failureCount: result.failures.length
      });

    } catch (error) {
      logger.error('Failed to send event notifications', error);
    }
  }

  private async filterUsersByPreferences(
    userIds: string[],
    templateId: string
  ): Promise<string[]> {
    try {
      const eligibleUsers: string[] = [];

      for (const userId of userIds) {
        const preferences = await mobilePushNotificationService.getUserNotificationPreferences(userId);

        if (!preferences.enabled) continue;

        // Check if the notification category is enabled
        const template = mobilePushNotificationService['templates'].get(templateId);
        if (template && preferences.categories[template.category] === false) {
          continue;
        }

        // Check quiet hours if specified
        if (preferences.quietHours && this.isInQuietHours(preferences.quietHours)) {
          continue;
        }

        eligibleUsers.push(userId);
      }

      return eligibleUsers;

    } catch (error) {
      logger.error('Failed to filter users by preferences', error);
      return userIds; // Fallback to all users
    }
  }

  private isInQuietHours(quietHours: { start: string; end: string }): boolean {
    try {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMin] = quietHours.start.split(':').map(Number);
      const [endHour, endMin] = quietHours.end.split(':').map(Number);

      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (startTime <= endTime) {
        return currentTime >= startTime && currentTime <= endTime;
      }
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime;


    } catch (error) {
      return false;
    }
  }

  // Helper methods for user selection

  private async findSuppliersForCategory(categoryId: string): Promise<string[]> {
    try {
      const products = await Product.find({ category: categoryId }).populate('supplier');
      const supplierIds = [...new Set(products.map(p => p.supplier.toString()))];

      const users = await User.find({
        company: { $in: supplierIds },
        role: { $in: ['SELLER', 'ADMIN'] }
      });

      return users.map(u => u._id.toString());

    } catch (error) {
      logger.error('Failed to find suppliers for category', error);
      return [];
    }
  }

  private async findProductOwners(productId: string): Promise<string[]> {
    try {
      const product = await Product.findById(productId);
      if (!product) return [];

      const users = await User.find({
        company: product.supplier,
        role: { $in: ['SELLER', 'ADMIN'] }
      });

      return users.map(u => u._id.toString());

    } catch (error) {
      logger.error('Failed to find product owners', error);
      return [];
    }
  }

  private async findInterestedBuyers(productId: string): Promise<string[]> {
    try {
      // Find buyers who have previously ordered this product or similar products
      const orders = await Order.find({ 'items.product': productId }).populate('buyer');
      const buyerIds = [...new Set(orders.map(o => o.buyer.toString()))];

      const users = await User.find({
        company: { $in: buyerIds },
        role: { $in: ['BUYER', 'ADMIN'] }
      });

      return users.map(u => u._id.toString());

    } catch (error) {
      logger.error('Failed to find interested buyers', error);
      return [];
    }
  }

  private async findTargetedUsers(targetCriteria: any): Promise<string[]> {
    try {
      // Implement user targeting based on criteria (role, location, purchase history, etc.)
      const query: any = {};

      if (targetCriteria.roles) {
        query.role = { $in: targetCriteria.roles };
      }

      if (targetCriteria.locations) {
        query['profile.location'] = { $in: targetCriteria.locations };
      }

      const users = await User.find(query);
      return users.map(u => u._id.toString());

    } catch (error) {
      logger.error('Failed to find targeted users', error);
      return [];
    }
  }

  private async findPromotionParticipants(promotionId: string): Promise<string[]> {
    try {
      // Find users who have viewed or interacted with the promotion
      // This would require tracking promotion interactions
      return [];

    } catch (error) {
      logger.error('Failed to find promotion participants', error);
      return [];
    }
  }

  private async getAllActiveUsers(): Promise<string[]> {
    try {
      const users = await User.find({
        active: true,
        lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Active in last 30 days
      });

      return users.map(u => u._id.toString());

    } catch (error) {
      logger.error('Failed to get all active users', error);
      return [];
    }
  }

  // Public methods for manual event triggering

  async triggerOrderEvent(eventType: string, order: any, additionalData?: any): Promise<void> {
    this.emit(`order:${eventType}`, order, additionalData);
  }

  async triggerRFQEvent(eventType: string, rfq: any, additionalData?: any): Promise<void> {
    this.emit(`rfq:${eventType}`, rfq, additionalData);
  }

  async triggerInventoryEvent(eventType: string, product: any, additionalData?: any): Promise<void> {
    this.emit(`inventory:${eventType}`, product, additionalData);
  }

  async triggerPaymentEvent(eventType: string, order: any, additionalData?: any): Promise<void> {
    this.emit(`payment:${eventType}`, order, additionalData);
  }

  async triggerUserEvent(eventType: string, user: any, additionalData?: any): Promise<void> {
    this.emit(`user:${eventType}`, user, additionalData);
  }

  // Rule management

  addNotificationRule(eventType: string, rule: NotificationRule): void {
    if (!this.rules.has(eventType)) {
      this.rules.set(eventType, []);
    }
    this.rules.get(eventType).push(rule);

    logger.info('Notification rule added', { eventType, templateId: rule.templateId });
  }

  removeNotificationRule(eventType: string, templateId: string): boolean {
    const rules = this.rules.get(eventType);
    if (!rules) return false;

    const index = rules.findIndex(r => r.templateId === templateId);
    if (index === -1) return false;

    rules.splice(index, 1);

    logger.info('Notification rule removed', { eventType, templateId });
    return true;
  }

  enableNotificationRule(eventType: string, templateId: string): boolean {
    return this.toggleNotificationRule(eventType, templateId, true);
  }

  disableNotificationRule(eventType: string, templateId: string): boolean {
    return this.toggleNotificationRule(eventType, templateId, false);
  }

  private toggleNotificationRule(eventType: string, templateId: string, enabled: boolean): boolean {
    const rules = this.rules.get(eventType);
    if (!rules) return false;

    const rule = rules.find(r => r.templateId === templateId);
    if (!rule) return false;

    rule.enabled = enabled;

    logger.info('Notification rule toggled', { eventType, templateId, enabled });
    return true;
  }

  getNotificationRules(): Array<{ eventType: string; rules: NotificationRule[] }> {
    return Array.from(this.rules.entries()).map(([eventType, rules]) => ({
      eventType,
      rules: [...rules]
    }));
  }
}

export const notificationEventHandler = new NotificationEventHandler();
