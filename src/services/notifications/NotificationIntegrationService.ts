import { EventEmitter } from 'events';

import { Logger } from '../../core/logging/logger';
import { realTimeAnalyticsService } from '../analytics/RealTimeAnalyticsService';

import { mobilePushNotificationService } from './MobilePushNotificationService';
import { notificationEventHandler } from './NotificationEventHandler';
import { notificationSchedulerService } from './NotificationSchedulerService';

const logger = new Logger('NotificationIntegrationService');

export interface NotificationConfig {
  enablePushNotifications: boolean;
  enableScheduledNotifications: boolean;
  enableEventDrivenNotifications: boolean;
  enableAnalyticsIntegration: boolean;
  platforms: {
    ios: boolean;
    android: boolean;
    web: boolean;
  };
  providers: {
    firebase: boolean;
    apns: boolean;
    webPush: boolean;
    azureNotificationHubs: boolean;
  };
  retryConfig: {
    maxRetries: number;
    retryDelay: number;
  };
  batchConfig: {
    batchSize: number;
    batchDelay: number;
  };
}

export class NotificationIntegrationService extends EventEmitter {
  private config: NotificationConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<NotificationConfig>) {
    super();

    this.config = {
      enablePushNotifications: true,
      enableScheduledNotifications: true,
      enableEventDrivenNotifications: true,
      enableAnalyticsIntegration: true,
      platforms: {
        ios: true,
        android: true,
        web: true
      },
      providers: {
        firebase: true,
        apns: true,
        webPush: true,
        azureNotificationHubs: false
      },
      retryConfig: {
        maxRetries: 3,
        retryDelay: 5000
      },
      batchConfig: {
        batchSize: 100,
        batchDelay: 1000
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing notification integration service');

      // Initialize event handler
      if (this.config.enableEventDrivenNotifications) {
        await notificationEventHandler.initialize();
        this.setupEventHandlerIntegration();
      }

      // Initialize scheduler
      if (this.config.enableScheduledNotifications) {
        await notificationSchedulerService.initialize();
      }

      // Setup analytics integration
      if (this.config.enableAnalyticsIntegration) {
        this.setupAnalyticsIntegration();
      }

      // Setup business event listeners
      this.setupBusinessEventListeners();

      this.isInitialized = true;
      logger.info('Notification integration service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize notification integration service', error);
      throw error;
    }
  }

  private setupEventHandlerIntegration(): void {
    // Forward business events to notification event handler
    this.on('business_event', (event) => {
      notificationEventHandler.emit('business_event', event);
    });

    // Listen for notification results
    notificationEventHandler.on('notification_sent', (result) => {
      this.emit('notification_sent', result);

      if (this.config.enableAnalyticsIntegration) {
        this.trackNotificationMetrics(result);
      }
    });
  }

  private setupAnalyticsIntegration(): void {
    // Track notification events in analytics
    this.on('notification_sent', async (result) => {
      try {
        await realTimeAnalyticsService.emitLiveEvent({
          type: 'NOTIFICATION_SENT',
          timestamp: new Date(),
          data: {
            notificationId: result.notificationId,
            templateId: result.templateId,
            platform: result.platform,
            success: result.success
          },
          userId: result.userId,
          companyId: result.companyId
        });
      } catch (error) {
        logger.error('Failed to track notification in analytics', error);
      }
    });

    this.on('notification_opened', async (data) => {
      try {
        await realTimeAnalyticsService.emitLiveEvent({
          type: 'NOTIFICATION_OPENED',
          timestamp: new Date(),
          data: {
            notificationId: data.notificationId,
            platform: data.platform,
            openedAt: data.openedAt
          },
          userId: data.userId,
          companyId: data.companyId
        });
      } catch (error) {
        logger.error('Failed to track notification open in analytics', error);
      }
    });
  }

  private setupBusinessEventListeners(): void {
    // Order events
    this.on('order:created', (order) => {
      this.emitBusinessEvent('order.created', {
        orderId: order._id,
        buyerId: order.buyer,
        sellerId: order.supplier,
        amount: order.total,
        items: order.items.length
      }, order.buyer);
    });

    this.on('order:status_changed', (order, oldStatus, newStatus) => {
      this.emitBusinessEvent(`order.${newStatus.toLowerCase()}`, {
        orderId: order._id,
        buyerId: order.buyer,
        sellerId: order.supplier,
        oldStatus,
        newStatus,
        amount: order.total
      }, order.buyer);
    });

    // RFQ events
    this.on('rfq:created', (rfq) => {
      this.emitBusinessEvent('rfq.created', {
        rfqId: rfq._id,
        buyerId: rfq.buyer,
        categoryId: rfq.category,
        title: rfq.title,
        budget: rfq.budget
      }, rfq.buyer);
    });

    this.on('proposal:submitted', (proposal) => {
      this.emitBusinessEvent('proposal.received', {
        proposalId: proposal._id,
        rfqId: proposal.rfq,
        supplierId: proposal.supplier,
        price: proposal.price
      });
    });

    // User events
    this.on('user:registered', (user) => {
      this.emitBusinessEvent('user.registered', {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }, user._id);
    });

    // Payment events
    this.on('payment:due_soon', (order, daysUntilDue) => {
      this.emitBusinessEvent('payment.due_soon', {
        orderId: order._id,
        buyerId: order.buyer,
        amount: order.total,
        daysUntilDue
      }, order.buyer);
    });

    // Inventory events
    this.on('inventory:low', (product, currentStock, threshold) => {
      this.emitBusinessEvent('inventory.low', {
        productId: product._id,
        productName: product.name,
        stock: currentStock,
        threshold,
        supplierId: product.supplier
      });
    });
  }

  private emitBusinessEvent(type: string, data: any, userId?: string): void {
    const event = {
      type,
      data,
      userId,
      timestamp: new Date(),
      priority: this.getEventPriority(type)
    };

    this.emit('business_event', event);

    logger.debug('Business event emitted', {
      type,
      userId,
      priority: event.priority
    });
  }

  private getEventPriority(eventType: string): 'low' | 'normal' | 'high' {
    const highPriorityEvents = [
      'order.cancelled',
      'payment.overdue',
      'inventory.out_of_stock',
      'proposal.accepted'
    ];

    const lowPriorityEvents = [
      'user.registered',
      'promotion.started',
      'weekly_summary'
    ];

    if (highPriorityEvents.includes(eventType)) return 'high';
    if (lowPriorityEvents.includes(eventType)) return 'low';
    return 'normal';
  }

  private trackNotificationMetrics(result: any): void {
    // Track notification metrics for analytics
    this.emit('notification_metrics', {
      timestamp: new Date(),
      templateId: result.templateId,
      platform: result.platform,
      success: result.success,
      userId: result.userId,
      error: result.error
    });
  }

  // Public methods for sending notifications

  async sendNotification(
    userId: string,
    templateId: string,
    variables: Record<string, any> = {},
    options: {
      priority?: 'low' | 'normal' | 'high';
      scheduledAt?: Date;
      category?: string;
    } = {}
  ): Promise<{
    success: boolean;
    notificationId?: string;
    scheduleId?: string;
    results?: any[];
  }> {
    try {
      if (!this.config.enablePushNotifications) {
        throw new Error('Push notifications are disabled');
      }

      const notification = await mobilePushNotificationService.createNotificationFromTemplate(
        userId,
        templateId,
        variables
      );

      // Apply options
      if (options.priority) {
        notification.priority = options.priority;
      }
      if (options.category) {
        notification.category = options.category;
      }

      let result;
      if (options.scheduledAt) {
        const scheduleId = await mobilePushNotificationService.scheduleNotification(
          notification,
          options.scheduledAt
        );
        result = { success: true, scheduleId };
      } else {
        const sendResult = await mobilePushNotificationService.sendNotification(notification);
        result = {
          success: sendResult.success,
          notificationId: notification.id,
          results: sendResult.results
        };

        // Emit notification sent event
        this.emit('notification_sent', {
          notificationId: notification.id,
          templateId,
          userId,
          success: sendResult.success,
          platform: 'multi',
          results: sendResult.results
        });
      }

      return result;

    } catch (error) {
      logger.error('Failed to send notification', error);
      throw error;
    }
  }

  async sendBulkNotification(
    userIds: string[],
    templateId: string,
    variables: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    totalSent: number;
    failures: Array<{ userId: string; error: string }>;
  }> {
    try {
      if (!this.config.enablePushNotifications) {
        throw new Error('Push notifications are disabled');
      }

      const result = await mobilePushNotificationService.sendBulkNotification(
        userIds,
        templateId,
        variables
      );

      // Emit bulk notification sent event
      this.emit('bulk_notification_sent', {
        templateId,
        userIds,
        totalSent: result.totalSent,
        failures: result.failures.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to send bulk notification', error);
      throw error;
    }
  }

  async registerDevice(
    userId: string,
    platform: 'ios' | 'android' | 'web',
    token: string,
    metadata?: any
  ): Promise<void> {
    try {
      if (!this.config.platforms[platform]) {
        throw new Error(`Platform ${platform} is disabled`);
      }

      await mobilePushNotificationService.registerDeviceToken(
        userId,
        platform,
        token,
        metadata
      );

      // Emit device registered event
      this.emit('device_registered', {
        userId,
        platform,
        timestamp: new Date()
      });

      logger.info('Device registered', { userId, platform });

    } catch (error) {
      logger.error('Failed to register device', error);
      throw error;
    }
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    try {
      await mobilePushNotificationService.unregisterDeviceToken(userId, token);

      // Emit device unregistered event
      this.emit('device_unregistered', {
        userId,
        timestamp: new Date()
      });

      logger.info('Device unregistered', { userId });

    } catch (error) {
      logger.error('Failed to unregister device', error);
      throw error;
    }
  }

  // Business event triggers

  async triggerOrderEvent(eventType: string, orderData: any): Promise<void> {
    if (!this.config.enableEventDrivenNotifications) return;

    this.emit(`order:${eventType}`, orderData);
  }

  async triggerRFQEvent(eventType: string, rfqData: any): Promise<void> {
    if (!this.config.enableEventDrivenNotifications) return;

    this.emit(`rfq:${eventType}`, rfqData);
  }

  async triggerUserEvent(eventType: string, userData: any): Promise<void> {
    if (!this.config.enableEventDrivenNotifications) return;

    this.emit(`user:${eventType}`, userData);
  }

  async triggerPaymentEvent(eventType: string, paymentData: any, additionalData?: any): Promise<void> {
    if (!this.config.enableEventDrivenNotifications) return;

    this.emit(`payment:${eventType}`, paymentData, additionalData);
  }

  async triggerInventoryEvent(eventType: string, inventoryData: any, additionalData?: any): Promise<void> {
    if (!this.config.enableEventDrivenNotifications) return;

    this.emit(`inventory:${eventType}`, inventoryData, additionalData);
  }

  // Configuration management

  updateConfig(newConfig: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Notification configuration updated', newConfig);
  }

  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  // Statistics and monitoring

  async getNotificationStats(days: number = 7): Promise<any> {
    try {
      const stats = await mobilePushNotificationService.getNotificationStats(days);

      // Add scheduler stats
      const schedulerStats = notificationSchedulerService.getJobStatus();

      return {
        ...stats,
        scheduler: {
          totalJobs: schedulerStats.length,
          enabledJobs: schedulerStats.filter(j => j.enabled).length,
          jobs: schedulerStats
        },
        config: this.config,
        isInitialized: this.isInitialized
      };

    } catch (error) {
      logger.error('Failed to get notification stats', error);
      throw error;
    }
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    lastChecked: Date;
  }> {
    try {
      const services = {
        pushNotifications: this.config.enablePushNotifications,
        eventHandler: this.config.enableEventDrivenNotifications,
        scheduler: this.config.enableScheduledNotifications,
        analytics: this.config.enableAnalyticsIntegration
      };

      const healthyServices = Object.values(services).filter(Boolean).length;
      const totalServices = Object.keys(services).length;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyServices === totalServices) {
        status = 'healthy';
      } else if (healthyServices > totalServices / 2) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        services,
        lastChecked: new Date()
      };

    } catch (error) {
      logger.error('Failed to get system health', error);
      return {
        status: 'unhealthy',
        services: {},
        lastChecked: new Date()
      };
    }
  }

  // Test methods

  async sendTestNotification(userId: string): Promise<any> {
    try {
      return await this.sendNotification(
        userId,
        'test_notification',
        {
          timestamp: new Date().toISOString(),
          testId: Math.random().toString(36).substr(2, 9)
        },
        { priority: 'normal', category: 'test' }
      );

    } catch (error) {
      logger.error('Failed to send test notification', error);
      throw error;
    }
  }

  async runScheduledJobNow(jobId: string): Promise<boolean> {
    try {
      if (!this.config.enableScheduledNotifications) {
        throw new Error('Scheduled notifications are disabled');
      }

      return await notificationSchedulerService.runJobNow(jobId);

    } catch (error) {
      logger.error('Failed to run scheduled job', error);
      throw error;
    }
  }

  // Cleanup and shutdown

  async stop(): Promise<void> {
    try {
      if (this.config.enableScheduledNotifications) {
        await notificationSchedulerService.stop();
      }

      this.removeAllListeners();
      this.isInitialized = false;

      logger.info('Notification integration service stopped');

    } catch (error) {
      logger.error('Failed to stop notification integration service', error);
      throw error;
    }
  }
}

export const notificationIntegrationService = new NotificationIntegrationService();
