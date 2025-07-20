import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

import { kafkaService } from './KafkaService';

interface StreamEvent {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  correlationId?: string;
  userId?: string;
  companyId?: string;
  metadata?: Record<string, any>;
}

export class EventConsumerService {
  private readonly logger: Logger;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('EventConsumerService');
  }

  /**
   * Initialize all event consumers
   */
  async initialize(): Promise<void> {
    try {
      // Initialize order event consumers
      await this.initializeOrderConsumers();

      // Initialize product event consumers
      await this.initializeProductConsumers();

      // Initialize RFQ event consumers
      await this.initializeRFQConsumers();

      // Initialize user activity consumers
      await this.initializeUserActivityConsumers();

      // Initialize analytics consumers
      await this.initializeAnalyticsConsumers();

      // Initialize notification consumers
      await this.initializeNotificationConsumers();

      this.isInitialized = true;
      this.logger.info('Event consumer service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize event consumer service:', error);
      throw error;
    }
  }

  /**
   * Initialize order event consumers
   */
  private async initializeOrderConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'orders',
      groupId: 'order-processors',
      handler: this.handleOrderEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 10
      }
    });

    this.logger.info('Order event consumers initialized');
  }

  /**
   * Initialize product event consumers
   */
  private async initializeProductConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'products',
      groupId: 'product-processors',
      handler: this.handleProductEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 20
      }
    });

    this.logger.info('Product event consumers initialized');
  }

  /**
   * Initialize RFQ event consumers
   */
  private async initializeRFQConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'rfqs',
      groupId: 'rfq-processors',
      handler: this.handleRFQEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 10
      }
    });

    this.logger.info('RFQ event consumers initialized');
  }

  /**
   * Initialize user activity consumers
   */
  private async initializeUserActivityConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'user-activity',
      groupId: 'user-activity-processors',
      handler: this.handleUserActivityEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 50
      }
    });

    this.logger.info('User activity event consumers initialized');
  }

  /**
   * Initialize analytics consumers
   */
  private async initializeAnalyticsConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'analytics',
      groupId: 'analytics-processors',
      handler: this.handleAnalyticsEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 100
      }
    });

    this.logger.info('Analytics event consumers initialized');
  }

  /**
   * Initialize notification consumers
   */
  private async initializeNotificationConsumers(): Promise<void> {
    await kafkaService.subscribe({
      topic: 'notifications',
      groupId: 'notification-processors',
      handler: this.handleNotificationEvent.bind(this),
      options: {
        autoCommit: true,
        maxBatchSize: 30
      }
    });

    this.logger.info('Notification event consumers initialized');
  }

  /**
   * Handle order events
   */
  private async handleOrderEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing order event: ${event.type}`, { eventId: event.id });

      switch (event.type) {
        case 'order.created':
          await this.processOrderCreated(event);
          break;
        case 'order.updated':
          await this.processOrderUpdated(event);
          break;
        case 'order.cancelled':
          await this.processOrderCancelled(event);
          break;
        case 'order.completed':
          await this.processOrderCompleted(event);
          break;
        default:
          this.logger.warn(`Unknown order event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process order event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle product events
   */
  private async handleProductEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing product event: ${event.type}`, { eventId: event.id });

      switch (event.type) {
        case 'product.created':
          await this.processProductCreated(event);
          break;
        case 'product.updated':
          await this.processProductUpdated(event);
          break;
        case 'product.deleted':
          await this.processProductDeleted(event);
          break;
        case 'product.stock_updated':
          await this.processProductStockUpdated(event);
          break;
        default:
          this.logger.warn(`Unknown product event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process product event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle RFQ events
   */
  private async handleRFQEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing RFQ event: ${event.type}`, { eventId: event.id });

      switch (event.type) {
        case 'rfq.created':
          await this.processRFQCreated(event);
          break;
        case 'rfq.updated':
          await this.processRFQUpdated(event);
          break;
        case 'rfq.closed':
          await this.processRFQClosed(event);
          break;
        case 'rfq.proposal_received':
          await this.processRFQProposalReceived(event);
          break;
        default:
          this.logger.warn(`Unknown RFQ event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process RFQ event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle user activity events
   */
  private async handleUserActivityEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing user activity event: ${event.type}`, { eventId: event.id });

      // Store user activity for analytics
      await this.storeUserActivity(event);

      // Update user last activity
      if (event.userId) {
        await this.updateUserLastActivity(event.userId, event.timestamp);
      }

      // Process specific activity types
      switch (event.type) {
        case 'user.login':
          await this.processUserLogin(event);
          break;
        case 'user.logout':
          await this.processUserLogout(event);
          break;
        case 'user.profile_updated':
          await this.processUserProfileUpdated(event);
          break;
        default:
          this.logger.debug(`Processed generic user activity: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process user activity event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle analytics events
   */
  private async handleAnalyticsEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing analytics event: ${event.type}`, { eventId: event.id });

      // Store analytics data
      await this.storeAnalyticsData(event);

      // Process specific analytics types
      switch (event.type) {
        case 'analytics.page_view':
          await this.processPageView(event);
          break;
        case 'analytics.conversion':
          await this.processConversion(event);
          break;
        case 'analytics.user_journey':
          await this.processUserJourney(event);
          break;
        default:
          this.logger.debug(`Processed generic analytics event: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process analytics event ${event.id}:`, error);
      throw error;
    }
  }

  /**
   * Handle notification events
   */
  private async handleNotificationEvent(event: StreamEvent): Promise<void> {
    try {
      this.logger.debug(`Processing notification event: ${event.type}`, { eventId: event.id });

      // Process notification delivery
      await this.processNotificationDelivery(event);

      // Track notification metrics
      await this.trackNotificationMetrics(event);
    } catch (error) {
      this.logger.error(`Failed to process notification event ${event.id}:`, error);
      throw error;
    }
  }

  // Order event processors

  private async processOrderCreated(event: StreamEvent): Promise<void> {
    const { orderId } = event.data;

    // Update order analytics
    await this.updateOrderAnalytics('created', event);

    // Send notifications
    if (event.userId) {
      await kafkaService.publishNotificationEvent(
        'order_created',
        event.userId,
        {
          title: 'Order Created',
          message: `Your order ${orderId} has been created successfully`,
          orderId
        },
        event.companyId
      );
    }

    this.logger.info(`Order created event processed: ${orderId}`);
  }

  private async processOrderUpdated(event: StreamEvent): Promise<void> {
    const { orderId, status } = event.data;

    // Update order analytics
    await this.updateOrderAnalytics('updated', event);

    // Clear related caches
    await optimizedCache.deletePattern(`order:${orderId}:*`);

    this.logger.info(`Order updated event processed: ${orderId} -> ${status}`);
  }

  private async processOrderCancelled(event: StreamEvent): Promise<void> {
    const { orderId } = event.data;

    // Update order analytics
    await this.updateOrderAnalytics('cancelled', event);

    // Send cancellation notifications
    if (event.userId) {
      await kafkaService.publishNotificationEvent(
        'order_cancelled',
        event.userId,
        {
          title: 'Order Cancelled',
          message: `Your order ${orderId} has been cancelled`,
          orderId
        },
        event.companyId
      );
    }

    this.logger.info(`Order cancelled event processed: ${orderId}`);
  }

  private async processOrderCompleted(event: StreamEvent): Promise<void> {
    const { orderId } = event.data;

    // Update order analytics
    await this.updateOrderAnalytics('completed', event);

    // Send completion notifications
    if (event.userId) {
      await kafkaService.publishNotificationEvent(
        'order_completed',
        event.userId,
        {
          title: 'Order Completed',
          message: `Your order ${orderId} has been completed`,
          orderId
        },
        event.companyId
      );
    }

    this.logger.info(`Order completed event processed: ${orderId}`);
  }

  // Product event processors

  private async processProductCreated(event: StreamEvent): Promise<void> {
    const { productId } = event.data;

    // Update product analytics
    await this.updateProductAnalytics('created', event);

    // Clear product listing caches
    await optimizedCache.deletePattern('products:list:*');

    this.logger.info(`Product created event processed: ${productId}`);
  }

  private async processProductUpdated(event: StreamEvent): Promise<void> {
    const { productId } = event.data;

    // Update product analytics
    await this.updateProductAnalytics('updated', event);

    // Clear related caches
    await optimizedCache.deletePattern(`product:${productId}:*`);
    await optimizedCache.deletePattern('products:list:*');

    this.logger.info(`Product updated event processed: ${productId}`);
  }

  private async processProductDeleted(event: StreamEvent): Promise<void> {
    const { productId } = event.data;

    // Update product analytics
    await this.updateProductAnalytics('deleted', event);

    // Clear all related caches
    await optimizedCache.deletePattern(`product:${productId}:*`);
    await optimizedCache.deletePattern('products:*');

    this.logger.info(`Product deleted event processed: ${productId}`);
  }

  private async processProductStockUpdated(event: StreamEvent): Promise<void> {
    const { productId, newStock, oldStock } = event.data;

    // Update stock analytics
    await this.updateStockAnalytics(productId, newStock, oldStock, event);

    // Clear stock-related caches
    await optimizedCache.deletePattern(`product:${productId}:stock`);

    this.logger.info(`Product stock updated event processed: ${productId}`);
  }

  // RFQ event processors

  private async processRFQCreated(event: StreamEvent): Promise<void> {
    const { rfqId } = event.data;

    // Update RFQ analytics
    await this.updateRFQAnalytics('created', event);

    this.logger.info(`RFQ created event processed: ${rfqId}`);
  }

  private async processRFQUpdated(event: StreamEvent): Promise<void> {
    const { rfqId } = event.data;

    // Clear RFQ caches
    await optimizedCache.deletePattern(`rfq:${rfqId}:*`);

    this.logger.info(`RFQ updated event processed: ${rfqId}`);
  }

  private async processRFQClosed(event: StreamEvent): Promise<void> {
    const { rfqId } = event.data;

    // Update RFQ analytics
    await this.updateRFQAnalytics('closed', event);

    this.logger.info(`RFQ closed event processed: ${rfqId}`);
  }

  private async processRFQProposalReceived(event: StreamEvent): Promise<void> {
    const { rfqId, proposalId } = event.data;

    // Send notification to RFQ owner
    const rfq = await RFQ.findById(rfqId).populate('createdBy');
    if (rfq && rfq.createdBy) {
      await kafkaService.publishNotificationEvent(
        'rfq_proposal_received',
        (rfq.createdBy as any)._id.toString(),
        {
          title: 'New RFQ Proposal',
          message: `You received a new proposal for RFQ: ${rfq.title}`,
          rfqId,
          proposalId
        }
      );
    }

    this.logger.info(`RFQ proposal received event processed: ${rfqId}`);
  }

  // Helper methods

  private async updateOrderAnalytics(action: string, event: StreamEvent): Promise<void> {
    try {
      const cacheKey = `analytics:orders:${action}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400); // 24 hours
    } catch (error) {
      this.logger.error('Failed to update order analytics:', error);
    }
  }

  private async updateProductAnalytics(action: string, event: StreamEvent): Promise<void> {
    try {
      const cacheKey = `analytics:products:${action}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400); // 24 hours
    } catch (error) {
      this.logger.error('Failed to update product analytics:', error);
    }
  }

  private async updateRFQAnalytics(action: string, event: StreamEvent): Promise<void> {
    try {
      const cacheKey = `analytics:rfqs:${action}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400); // 24 hours
    } catch (error) {
      this.logger.error('Failed to update RFQ analytics:', error);
    }
  }

  private async updateStockAnalytics(productId: string, newStock: number, oldStock: number, event: StreamEvent): Promise<void> {
    try {
      const stockChange = newStock - oldStock;
      const cacheKey = `analytics:stock:changes:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + Math.abs(stockChange), 86400);
    } catch (error) {
      this.logger.error('Failed to update stock analytics:', error);
    }
  }

  private async storeUserActivity(event: StreamEvent): Promise<void> {
    try {
      const cacheKey = `analytics:user_activity:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400);
    } catch (error) {
      this.logger.error('Failed to store user activity:', error);
    }
  }

  private async updateUserLastActivity(userId: string, timestamp: Date): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, { lastActivity: timestamp });
      await optimizedCache.set(`user:${userId}:last_activity`, timestamp.toISOString(), 3600);
    } catch (error) {
      this.logger.error('Failed to update user last activity:', error);
    }
  }

  private async processUserLogin(event: StreamEvent): Promise<void> {
    const { userId } = event;
    if (userId) {
      await optimizedCache.set(`user:${userId}:online`, true, 3600);
    }
  }

  private async processUserLogout(event: StreamEvent): Promise<void> {
    const { userId } = event;
    if (userId) {
      await optimizedCache.del(`user:${userId}:online`);
    }
  }

  private async processUserProfileUpdated(event: StreamEvent): Promise<void> {
    const { userId } = event;
    if (userId) {
      await optimizedCache.deletePattern(`user:${userId}:*`);
    }
  }

  private async storeAnalyticsData(event: StreamEvent): Promise<void> {
    try {
      const cacheKey = `analytics:events:${event.type}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400);
    } catch (error) {
      this.logger.error('Failed to store analytics data:', error);
    }
  }

  private async processPageView(event: StreamEvent): Promise<void> {
    const { page, userId } = event.data;
    if (page && userId) {
      const cacheKey = `analytics:page_views:${page}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + 1, 86400);
    }
  }

  private async processConversion(event: StreamEvent): Promise<void> {
    const { conversionType, value } = event.data;
    if (conversionType) {
      const cacheKey = `analytics:conversions:${conversionType}:${this.getDateKey(event.timestamp)}`;
      const current = await optimizedCache.get(cacheKey) || 0;
      await optimizedCache.set(cacheKey, current + (value || 1), 86400);
    }
  }

  private async processUserJourney(event: StreamEvent): Promise<void> {
    // Store user journey data for analysis
    const { userId, journey } = event.data;
    if (userId && journey) {
      const cacheKey = `analytics:user_journeys:${userId}:${this.getDateKey(event.timestamp)}`;
      await optimizedCache.set(cacheKey, journey, 86400);
    }
  }

  private async processNotificationDelivery(event: StreamEvent): Promise<void> {
    const { recipientId, notificationType } = event.data;

    // Track notification delivery
    const cacheKey = `analytics:notifications:${notificationType}:${this.getDateKey(event.timestamp)}`;
    const current = await optimizedCache.get(cacheKey) || 0;
    await optimizedCache.set(cacheKey, current + 1, 86400);
  }

  private async trackNotificationMetrics(event: StreamEvent): Promise<void> {
    try {
      const { channel, success } = event.data;
      if (channel) {
        const statusKey = success ? 'delivered' : 'failed';
        const cacheKey = `analytics:notifications:${channel}:${statusKey}:${this.getDateKey(event.timestamp)}`;
        const current = await optimizedCache.get(cacheKey) || 0;
        await optimizedCache.set(cacheKey, current + 1, 86400);
      }
    } catch (error) {
      this.logger.error('Failed to track notification metrics:', error);
    }
  }

  private getDateKey(timestamp: Date): string {
    return timestamp.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
}

// Singleton instance
export const eventConsumerService = new EventConsumerService();
