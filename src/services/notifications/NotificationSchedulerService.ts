import cron from 'node-cron';

import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

import { mobilePushNotificationService } from './MobilePushNotificationService';
import { notificationEventHandler } from './NotificationEventHandler';

const logger = new Logger('NotificationSchedulerService');

export interface ScheduledJob {
  id: string;
  name: string;
  schedule: string; // cron expression
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  task: () => Promise<void>;
}

export class NotificationSchedulerService {
  private readonly jobs: Map<string, ScheduledJob> = new Map();
  private readonly cronTasks: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    this.setupDefaultJobs();
  }

  async initialize(): Promise<void> {
    try {
      this.startScheduledJobs();
      this.isInitialized = true;
      logger.info('Notification scheduler service initialized');
    } catch (error) {
      logger.error('Failed to initialize notification scheduler service', error);
      throw error;
    }
  }

  private setupDefaultJobs(): void {
    const defaultJobs: ScheduledJob[] = [
      {
        id: 'payment_reminders',
        name: 'Payment Due Reminders',
        schedule: '0 9 * * *', // Daily at 9 AM
        enabled: true,
        task: this.sendPaymentReminders.bind(this)
      },
      {
        id: 'order_follow_ups',
        name: 'Order Follow-ups',
        schedule: '0 10 * * *', // Daily at 10 AM
        enabled: true,
        task: this.sendOrderFollowUps.bind(this)
      },
      {
        id: 'inventory_alerts',
        name: 'Low Inventory Alerts',
        schedule: '0 8 * * MON,WED,FRI', // Mon, Wed, Fri at 8 AM
        enabled: true,
        task: this.sendInventoryAlerts.bind(this)
      },
      {
        id: 'rfq_reminders',
        name: 'RFQ Expiration Reminders',
        schedule: '0 11 * * *', // Daily at 11 AM
        enabled: true,
        task: this.sendRFQReminders.bind(this)
      },
      {
        id: 'inactive_user_reengagement',
        name: 'Inactive User Re-engagement',
        schedule: '0 14 * * SUN', // Sundays at 2 PM
        enabled: true,
        task: this.sendReengagementNotifications.bind(this)
      },
      {
        id: 'weekly_summary',
        name: 'Weekly Activity Summary',
        schedule: '0 17 * * FRI', // Fridays at 5 PM
        enabled: true,
        task: this.sendWeeklySummary.bind(this)
      },
      {
        id: 'price_drop_alerts',
        name: 'Price Drop Alerts',
        schedule: '0 */4 * * *', // Every 4 hours
        enabled: true,
        task: this.sendPriceDropAlerts.bind(this)
      },
      {
        id: 'abandoned_cart_reminders',
        name: 'Abandoned Cart Reminders',
        schedule: '0 */6 * * *', // Every 6 hours
        enabled: true,
        task: this.sendAbandonedCartReminders.bind(this)
      },
      {
        id: 'delivery_confirmations',
        name: 'Delivery Confirmation Requests',
        schedule: '0 12 * * *', // Daily at noon
        enabled: true,
        task: this.sendDeliveryConfirmationRequests.bind(this)
      },
      {
        id: 'quality_feedback_requests',
        name: 'Quality Feedback Requests',
        schedule: '0 16 * * *', // Daily at 4 PM
        enabled: true,
        task: this.sendQualityFeedbackRequests.bind(this)
      }
    ];

    defaultJobs.forEach(job => {
      this.jobs.set(job.id, job);
    });

    logger.info(`Loaded ${defaultJobs.length} scheduled notification jobs`);
  }

  private startScheduledJobs(): void {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.enabled) {
        this.scheduleJob(jobId, job);
      }
    }
  }

  private scheduleJob(jobId: string, job: ScheduledJob): void {
    try {
      const task = cron.schedule(job.schedule, async () => {
        logger.info(`Starting scheduled job: ${job.name}`);

        try {
          await job.task();

          // Update last run time
          job.lastRun = new Date();
          await this.saveJobStatus(jobId, job);

          logger.info(`Completed scheduled job: ${job.name}`);
        } catch (error) {
          logger.error(`Failed to execute scheduled job: ${job.name}`, error);
        }
      }, {
        scheduled: false,
        timezone: process.env.TZ || 'UTC'
      });

      this.cronTasks.set(jobId, task);
      task.start();

      logger.info(`Scheduled job started: ${job.name} (${job.schedule})`);

    } catch (error) {
      logger.error(`Failed to schedule job: ${job.name}`, error);
    }
  }

  // Scheduled notification tasks

  private async sendPaymentReminders(): Promise<void> {
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const oneDayFromNow = new Date();
      oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

      // Find orders with payment due soon
      const ordersDueSoon = await Order.find({
        status: { $in: ['CONFIRMED', 'SHIPPED'] },
        paymentStatus: 'PENDING',
        paymentDueDate: {
          $gte: oneDayFromNow,
          $lte: threeDaysFromNow
        }
      }).populate('buyer');

      for (const order of ordersDueSoon) {
        const daysUntilDue = Math.ceil(
          (order.paymentDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        await notificationEventHandler.triggerPaymentEvent('due_soon', order, daysUntilDue);
      }

      // Find overdue orders
      const overdueOrders = await Order.find({
        status: { $in: ['CONFIRMED', 'SHIPPED', 'DELIVERED'] },
        paymentStatus: 'PENDING',
        paymentDueDate: { $lt: new Date() }
      }).populate('buyer');

      for (const order of overdueOrders) {
        await notificationEventHandler.triggerPaymentEvent('overdue', order);
      }

      logger.info('Payment reminders sent', {
        dueSoon: ordersDueSoon.length,
        overdue: overdueOrders.length
      });

    } catch (error) {
      logger.error('Failed to send payment reminders', error);
      throw error;
    }
  }

  private async sendOrderFollowUps(): Promise<void> {
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Find delivered orders without feedback
      const deliveredOrders = await Order.find({
        status: 'DELIVERED',
        deliveredAt: {
          $gte: oneWeekAgo,
          $lte: twoDaysAgo
        },
        feedbackGiven: { $ne: true }
      }).populate('buyer');

      for (const order of deliveredOrders) {
        await mobilePushNotificationService.createNotificationFromTemplate(
          order.buyer.toString(),
          'order_feedback_request',
          {
            orderId: order._id,
            deliveredDays: Math.floor((Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60 * 24))
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('Order follow-ups sent', { count: deliveredOrders.length });

    } catch (error) {
      logger.error('Failed to send order follow-ups', error);
      throw error;
    }
  }

  private async sendInventoryAlerts(): Promise<void> {
    try {
      // Find products with low inventory
      const lowStockProducts = await Product.find({
        'inventory.current': { $lte: { $field: 'inventory.lowStockThreshold' } },
        status: 'ACTIVE'
      }).populate('supplier');

      for (const product of lowStockProducts) {
        await notificationEventHandler.triggerInventoryEvent(
          'low',
          product,
          product.inventory.current,
          product.inventory.lowStockThreshold || 10
        );
      }

      // Find out of stock products
      const outOfStockProducts = await Product.find({
        'inventory.current': 0,
        status: 'ACTIVE'
      }).populate('supplier');

      for (const product of outOfStockProducts) {
        await notificationEventHandler.triggerInventoryEvent('out_of_stock', product);
      }

      logger.info('Inventory alerts sent', {
        lowStock: lowStockProducts.length,
        outOfStock: outOfStockProducts.length
      });

    } catch (error) {
      logger.error('Failed to send inventory alerts', error);
      throw error;
    }
  }

  private async sendRFQReminders(): Promise<void> {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      // Find RFQs expiring soon
      const expiringSoon = await RFQ.find({
        status: 'ACTIVE',
        expiresAt: {
          $gte: tomorrow,
          $lte: threeDaysFromNow
        }
      }).populate('buyer');

      for (const rfq of expiringSoon) {
        const hoursUntilExpiry = Math.ceil(
          (rfq.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)
        );

        await mobilePushNotificationService.createNotificationFromTemplate(
          rfq.buyer.toString(),
          'rfq_expiring_soon',
          {
            rfqId: rfq._id,
            rfqTitle: rfq.title,
            hoursRemaining: hoursUntilExpiry
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('RFQ reminders sent', { count: expiringSoon.length });

    } catch (error) {
      logger.error('Failed to send RFQ reminders', error);
      throw error;
    }
  }

  private async sendReengagementNotifications(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Find inactive users
      const inactiveUsers = await User.find({
        lastLoginAt: {
          $gte: thirtyDaysAgo,
          $lte: sevenDaysAgo
        },
        active: true
      });

      const reengagementMessages = [
        {
          template: 'comeback_offer',
          variables: { discountPercent: 10 }
        },
        {
          template: 'new_features',
          variables: { featureCount: 3 }
        },
        {
          template: 'missed_opportunities',
          variables: {}
        }
      ];

      for (const user of inactiveUsers) {
        const messageIndex = Math.floor(Math.random() * reengagementMessages.length);
        const message = reengagementMessages[messageIndex];

        await mobilePushNotificationService.createNotificationFromTemplate(
          user._id.toString(),
          message.template,
          {
            userName: user.name,
            ...message.variables
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('Re-engagement notifications sent', { count: inactiveUsers.length });

    } catch (error) {
      logger.error('Failed to send re-engagement notifications', error);
      throw error;
    }
  }

  private async sendWeeklySummary(): Promise<void> {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Find users who had activity this week
      const activeUsers = await User.find({
        lastLoginAt: { $gte: oneWeekAgo },
        active: true
      });

      for (const user of activeUsers) {
        // Get user's weekly stats
        const weeklyStats = await this.getUserWeeklyStats(user._id.toString(), oneWeekAgo);

        if (weeklyStats.hasActivity) {
          await mobilePushNotificationService.createNotificationFromTemplate(
            user._id.toString(),
            'weekly_summary',
            weeklyStats
          ).then(async notification =>
            mobilePushNotificationService.sendNotification(notification)
          );
        }
      }

      logger.info('Weekly summaries sent', { count: activeUsers.length });

    } catch (error) {
      logger.error('Failed to send weekly summaries', error);
      throw error;
    }
  }

  private async sendPriceDropAlerts(): Promise<void> {
    try {
      // This would integrate with a price monitoring system
      // For now, we'll use a simplified approach

      const recentPriceDrops = await this.findRecentPriceDrops();

      for (const priceDrop of recentPriceDrops) {
        const interestedUsers = await this.findUsersInterestedInProduct(priceDrop.productId);

        await mobilePushNotificationService.sendBulkNotification(
          interestedUsers,
          'price_alert',
          {
            productName: priceDrop.productName,
            oldPrice: priceDrop.oldPrice,
            newPrice: priceDrop.newPrice,
            discount: priceDrop.discountPercentage
          }
        );
      }

      logger.info('Price drop alerts sent', { drops: recentPriceDrops.length });

    } catch (error) {
      logger.error('Failed to send price drop alerts', error);
      throw error;
    }
  }

  private async sendAbandonedCartReminders(): Promise<void> {
    try {
      // Find abandoned carts (this would require cart tracking implementation)
      const abandonedCarts = await this.findAbandonedCarts();

      for (const cart of abandonedCarts) {
        await mobilePushNotificationService.createNotificationFromTemplate(
          cart.userId,
          'abandoned_cart',
          {
            itemCount: cart.itemCount,
            totalValue: cart.totalValue,
            hoursAbandoned: cart.hoursAbandoned
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('Abandoned cart reminders sent', { count: abandonedCarts.length });

    } catch (error) {
      logger.error('Failed to send abandoned cart reminders', error);
      throw error;
    }
  }

  private async sendDeliveryConfirmationRequests(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Find orders marked as shipped but not yet delivered
      const shippedOrders = await Order.find({
        status: 'SHIPPED',
        shippedAt: { $lte: yesterday },
        estimatedDeliveryDate: { $lte: new Date() }
      }).populate('buyer');

      for (const order of shippedOrders) {
        await mobilePushNotificationService.createNotificationFromTemplate(
          order.buyer.toString(),
          'delivery_confirmation_request',
          {
            orderId: order._id,
            estimatedDeliveryDate: order.estimatedDeliveryDate
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('Delivery confirmation requests sent', { count: shippedOrders.length });

    } catch (error) {
      logger.error('Failed to send delivery confirmation requests', error);
      throw error;
    }
  }

  private async sendQualityFeedbackRequests(): Promise<void> {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      // Find delivered orders without quality feedback
      const ordersNeedingFeedback = await Order.find({
        status: 'DELIVERED',
        deliveredAt: {
          $gte: oneWeekAgo,
          $lte: threeDaysAgo
        },
        qualityFeedbackGiven: { $ne: true }
      }).populate('buyer');

      for (const order of ordersNeedingFeedback) {
        await mobilePushNotificationService.createNotificationFromTemplate(
          order.buyer.toString(),
          'quality_feedback_request',
          {
            orderId: order._id,
            deliveredDays: Math.floor((Date.now() - order.deliveredAt.getTime()) / (1000 * 60 * 60 * 24))
          }
        ).then(async notification =>
          mobilePushNotificationService.sendNotification(notification)
        );
      }

      logger.info('Quality feedback requests sent', { count: ordersNeedingFeedback.length });

    } catch (error) {
      logger.error('Failed to send quality feedback requests', error);
      throw error;
    }
  }

  // Helper methods

  private async getUserWeeklyStats(userId: string, weekStart: Date): Promise<any> {
    try {
      const orders = await Order.countDocuments({
        buyer: userId,
        createdAt: { $gte: weekStart }
      });

      const rfqs = await RFQ.countDocuments({
        buyer: userId,
        createdAt: { $gte: weekStart }
      });

      return {
        hasActivity: orders > 0 || rfqs > 0,
        ordersCount: orders,
        rfqsCount: rfqs,
        weekStart: weekStart.toISOString().split('T')[0]
      };

    } catch (error) {
      return { hasActivity: false };
    }
  }

  private async findRecentPriceDrops(): Promise<Array<{
    productId: string;
    productName: string;
    oldPrice: number;
    newPrice: number;
    discountPercentage: number;
  }>> {
    // This would require price history tracking
    // For now, return empty array
    return [];
  }

  private async findUsersInterestedInProduct(productId: string): Promise<string[]> {
    try {
      // Find users who have previously ordered this product
      const orders = await Order.find({
        'items.product': productId
      }).distinct('buyer');

      const users = await User.find({
        company: { $in: orders },
        role: { $in: ['BUYER', 'ADMIN'] }
      });

      return users.map(u => u._id.toString());

    } catch (error) {
      return [];
    }
  }

  private async findAbandonedCarts(): Promise<Array<{
    userId: string;
    itemCount: number;
    totalValue: number;
    hoursAbandoned: number;
  }>> {
    // This would require cart tracking implementation
    // For now, return empty array
    return [];
  }

  private async saveJobStatus(jobId: string, job: ScheduledJob): Promise<void> {
    try {
      await optimizedCache.set(
        `scheduler_job_status:${jobId}`,
        {
          lastRun: job.lastRun,
          enabled: job.enabled
        },
        { ttl: 86400 * 7 } // 7 days
      );
    } catch (error) {
      logger.error('Failed to save job status', error);
    }
  }

  // Public methods for job management

  enableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = true;

    if (!this.cronTasks.has(jobId)) {
      this.scheduleJob(jobId, job);
    }

    logger.info('Scheduled job enabled', { jobId, name: job.name });
    return true;
  }

  disableJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = false;

    const task = this.cronTasks.get(jobId);
    if (task) {
      task.stop();
      this.cronTasks.delete(jobId);
    }

    logger.info('Scheduled job disabled', { jobId, name: job.name });
    return true;
  }

  getJobStatus(): Array<{
    id: string;
    name: string;
    schedule: string;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
  }> {
    return Array.from(this.jobs.values()).map(job => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      enabled: job.enabled,
      lastRun: job.lastRun,
      nextRun: job.nextRun
    }));
  }

  async runJobNow(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    try {
      logger.info(`Manually running job: ${job.name}`);
      await job.task();
      job.lastRun = new Date();
      await this.saveJobStatus(jobId, job);
      logger.info(`Manually completed job: ${job.name}`);
      return true;
    } catch (error) {
      logger.error(`Failed to manually run job: ${job.name}`, error);
      return false;
    }
  }

  async stop(): Promise<void> {
    try {
      for (const task of this.cronTasks.values()) {
        task.stop();
      }

      this.cronTasks.clear();
      this.isInitialized = false;

      logger.info('Notification scheduler service stopped');

    } catch (error) {
      logger.error('Failed to stop notification scheduler service', error);
      throw error;
    }
  }
}

export const notificationSchedulerService = new NotificationSchedulerService();
