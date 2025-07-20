import { NotificationHubService } from '@azure/notification-hubs';
import admin from 'firebase-admin';
import apn from 'node-apn';
import webpush from 'web-push';

import { Logger } from '../../core/logging/logger';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('MobilePushNotificationService');

export interface PushNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: 'low' | 'normal' | 'high';
  category?: string;
  badge?: number;
  sound?: string;
  image?: string;
  actions?: Array<{
    id: string;
    title: string;
    icon?: string;
  }>;
  scheduledAt?: Date;
  expiresAt?: Date;
  deepLink?: string;
  silent?: boolean;
}

export interface DeviceToken {
  userId: string;
  platform: 'ios' | 'android' | 'web';
  token: string;
  active: boolean;
  createdAt: Date;
  lastUsed: Date;
  appVersion?: string;
  deviceModel?: string;
  osVersion?: string;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  category: string;
  priority: 'low' | 'normal' | 'high';
  data?: Record<string, any>;
  localization?: Record<string, {
    title: string;
    body: string;
  }>;
}

export interface NotificationStats {
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
  platform: Record<string, number>;
  categories: Record<string, number>;
}

export class MobilePushNotificationService {
  private firebaseApp?: admin.app.App;
  private apnProvider?: apn.Provider;
  private notificationHubService?: NotificationHubService;
  private deviceTokens: Map<string, DeviceToken[]> = new Map();
  private readonly templates: Map<string, NotificationTemplate> = new Map();

  constructor() {
    this.initializeServices();
    this.loadDefaultTemplates();
  }

  private async initializeServices() {
    try {
      // Initialize Firebase Admin for FCM (Android & iOS)
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        logger.info('Firebase Admin initialized for FCM');
      }

      // Initialize APNs for iOS
      if (process.env.APN_KEY_PATH && process.env.APN_KEY_ID && process.env.APN_TEAM_ID) {
        this.apnProvider = new apn.Provider({
          token: {
            key: process.env.APN_KEY_PATH,
            keyId: process.env.APN_KEY_ID,
            teamId: process.env.APN_TEAM_ID
          },
          production: process.env.NODE_ENV === 'production'
        });
        logger.info('APNs provider initialized');
      }

      // Initialize Azure Notification Hubs
      if (process.env.AZURE_NOTIFICATION_HUB_CONNECTION_STRING && process.env.AZURE_NOTIFICATION_HUB_NAME) {
        this.notificationHubService = new NotificationHubService(
          process.env.AZURE_NOTIFICATION_HUB_CONNECTION_STRING,
          process.env.AZURE_NOTIFICATION_HUB_NAME
        );
        logger.info('Azure Notification Hubs initialized');
      }

      // Initialize Web Push for PWA
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:notifications@foodxchange.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        logger.info('Web Push initialized');
      }

      // Load device tokens from cache
      await this.loadDeviceTokens();

    } catch (error) {
      logger.error('Failed to initialize push notification services', error);
    }
  }

  private loadDefaultTemplates() {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'order_created',
        name: 'Order Created',
        title: 'Order Confirmed',
        body: 'Your order #{orderId} has been confirmed and is being processed.',
        category: 'order',
        priority: 'normal',
        data: { type: 'order', action: 'view' }
      },
      {
        id: 'order_shipped',
        name: 'Order Shipped',
        title: 'Order Shipped',
        body: 'Your order #{orderId} has been shipped and is on its way!',
        category: 'order',
        priority: 'normal',
        data: { type: 'order', action: 'track' }
      },
      {
        id: 'order_delivered',
        name: 'Order Delivered',
        title: 'Order Delivered',
        body: 'Your order #{orderId} has been delivered. Enjoy your purchase!',
        category: 'order',
        priority: 'high',
        data: { type: 'order', action: 'review' }
      },
      {
        id: 'rfq_response',
        name: 'RFQ Response',
        title: 'New Proposal Received',
        body: 'You have received a new proposal for your RFQ #{rfqId}.',
        category: 'rfq',
        priority: 'high',
        data: { type: 'rfq', action: 'view_proposals' }
      },
      {
        id: 'price_alert',
        name: 'Price Alert',
        title: 'Price Drop Alert',
        body: 'The price for {productName} has dropped by {discount}%!',
        category: 'promotion',
        priority: 'normal',
        data: { type: 'product', action: 'view' }
      },
      {
        id: 'inventory_low',
        name: 'Low Inventory',
        title: 'Low Stock Alert',
        body: 'Your product {productName} is running low on inventory.',
        category: 'inventory',
        priority: 'high',
        data: { type: 'inventory', action: 'restock' }
      },
      {
        id: 'payment_reminder',
        name: 'Payment Reminder',
        title: 'Payment Due',
        body: 'Payment for order #{orderId} is due in {days} days.',
        category: 'payment',
        priority: 'high',
        data: { type: 'payment', action: 'pay' }
      },
      {
        id: 'welcome',
        name: 'Welcome',
        title: 'Welcome to Foodxchange!',
        body: 'Thank you for joining our marketplace. Start exploring fresh opportunities!',
        category: 'welcome',
        priority: 'normal',
        data: { type: 'onboarding', action: 'explore' }
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });

    logger.info(`Loaded ${defaultTemplates.length} notification templates`);
  }

  async registerDeviceToken(
    userId: string,
    platform: 'ios' | 'android' | 'web',
    token: string,
    metadata?: Partial<DeviceToken>
  ): Promise<void> {
    try {
      const deviceToken: DeviceToken = {
        userId,
        platform,
        token,
        active: true,
        createdAt: new Date(),
        lastUsed: new Date(),
        ...metadata
      };

      // Get existing tokens for user
      let userTokens = this.deviceTokens.get(userId) || [];

      // Remove existing token for same platform if exists
      userTokens = userTokens.filter(t => !(t.platform === platform && t.token === token));

      // Add new token
      userTokens.push(deviceToken);

      // Keep only the 5 most recent tokens per platform
      const platformTokens = userTokens.filter(t => t.platform === platform);
      if (platformTokens.length > 5) {
        platformTokens.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
        userTokens = userTokens.filter(t => t.platform !== platform);
        userTokens.push(...platformTokens.slice(0, 5));
      }

      this.deviceTokens.set(userId, userTokens);

      // Cache device tokens
      await this.cacheDeviceTokens();

      logger.info('Device token registered', {
        userId,
        platform,
        tokenLength: token.length
      });

    } catch (error) {
      logger.error('Failed to register device token', error);
      throw error;
    }
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    try {
      const userTokens = this.deviceTokens.get(userId) || [];
      const updatedTokens = userTokens.filter(t => t.token !== token);

      this.deviceTokens.set(userId, updatedTokens);
      await this.cacheDeviceTokens();

      logger.info('Device token unregistered', { userId, tokenLength: token.length });

    } catch (error) {
      logger.error('Failed to unregister device token', error);
      throw error;
    }
  }

  async sendNotification(notification: PushNotification): Promise<{
    success: boolean;
    results: Array<{
      platform: string;
      token: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    try {
      const userTokens = this.deviceTokens.get(notification.userId) || [];

      if (userTokens.length === 0) {
        logger.warn('No device tokens found for user', { userId: notification.userId });
        return { success: false, results: [] };
      }

      const results = await Promise.allSettled(
        userTokens.map(async token => this.sendToDevice(notification, token))
      );

      const processedResults = results.map((result, index) => ({
        platform: userTokens[index].platform,
        token: userTokens[index].token,
        success: result.status === 'fulfilled' && result.value.success,
        error: result.status === 'rejected' ? result.reason.message :
          (result.status === 'fulfilled' && !result.value.success ? result.value.error : undefined)
      }));

      const successCount = processedResults.filter(r => r.success).length;

      // Update notification stats
      await this.updateNotificationStats(notification, processedResults);

      // Remove invalid tokens
      await this.cleanupInvalidTokens(notification.userId, processedResults);

      logger.info('Notification sent', {
        notificationId: notification.id,
        userId: notification.userId,
        totalTokens: userTokens.length,
        successCount,
        failureCount: userTokens.length - successCount
      });

      return {
        success: successCount > 0,
        results: processedResults
      };

    } catch (error) {
      logger.error('Failed to send notification', error);
      throw error;
    }
  }

  private async sendToDevice(
    notification: PushNotification,
    deviceToken: DeviceToken
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (deviceToken.platform) {
        case 'ios':
          return await this.sendToiOS(notification, deviceToken);
        case 'android':
          return await this.sendToAndroid(notification, deviceToken);
        case 'web':
          return await this.sendToWeb(notification, deviceToken);
        default:
          throw new Error(`Unsupported platform: ${deviceToken.platform}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async sendToiOS(
    notification: PushNotification,
    deviceToken: DeviceToken
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.apnProvider) {
        throw new Error('APNs provider not initialized');
      }

      const apnNotification = new apn.Notification({
        alert: {
          title: notification.title,
          body: notification.body
        },
        badge: notification.badge,
        sound: notification.sound || 'default',
        category: notification.category,
        priority: notification.priority === 'high' ? 10 : 5,
        payload: notification.data || {},
        topic: process.env.APN_BUNDLE_ID
      });

      if (notification.expiresAt) {
        apnNotification.expiry = Math.floor(notification.expiresAt.getTime() / 1000);
      }

      const result = await this.apnProvider.send(apnNotification, deviceToken.token);

      if (result.failed && result.failed.length > 0) {
        const {error} = result.failed[0];
        return { success: false, error: error?.message || 'APNs delivery failed' };
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async sendToAndroid(
    notification: PushNotification,
    deviceToken: DeviceToken
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.firebaseApp) {
        throw new Error('Firebase Admin not initialized');
      }

      const message = {
        token: deviceToken.token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.image
        },
        data: notification.data ?
          Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)])) :
          {},
        android: {
          priority: notification.priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: notification.sound || 'default',
            channelId: notification.category || 'default',
            priority: notification.priority === 'high' ? 'high' : 'default',
            clickAction: notification.deepLink
          }
        },
        apns: {
          payload: {
            aps: {
              badge: notification.badge,
              sound: notification.sound || 'default',
              category: notification.category
            }
          }
        }
      };

      if (notification.expiresAt) {
        const ttl = Math.floor((notification.expiresAt.getTime() - Date.now()) / 1000);
        (message as any).android.ttl = `${ttl}s`;
      }

      const response = await admin.messaging().send(message);

      return { success: true };

    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token') {
        return { success: false, error: 'Invalid token' };
      }
      return { success: false, error: error.message };
    }
  }

  private async sendToWeb(
    notification: PushNotification,
    deviceToken: DeviceToken
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.image || '/icon-192x192.png',
        badge: '/badge-72x72.png',
        data: {
          ...notification.data,
          url: notification.deepLink
        },
        actions: notification.actions || [],
        requireInteraction: notification.priority === 'high',
        silent: notification.silent || false
      });

      const options = {
        TTL: notification.expiresAt ?
          Math.floor((notification.expiresAt.getTime() - Date.now()) / 1000) :
          24 * 60 * 60, // 24 hours default
        urgency: notification.priority === 'high' ? 'high' : 'normal'
      };

      await webpush.sendNotification(
        JSON.parse(deviceToken.token), // Web push subscription object
        payload,
        options
      );

      return { success: true };

    } catch (error) {
      if (error.statusCode === 410) {
        return { success: false, error: 'Invalid token' };
      }
      return { success: false, error: error.message };
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
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      const failures: Array<{ userId: string; error: string }> = [];
      let totalSent = 0;

      // Process in batches to avoid overwhelming the services
      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (userId) => {
          try {
            const notification = await this.createNotificationFromTemplate(
              userId,
              templateId,
              variables
            );

            const result = await this.sendNotification(notification);
            if (result.success) {
              totalSent++;
            } else {
              failures.push({ userId, error: 'No valid tokens' });
            }
          } catch (error) {
            failures.push({ userId, error: error.message });
          }
        });

        await Promise.allSettled(batchPromises);

        // Rate limiting - wait between batches
        if (i + batchSize < userIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Bulk notification sent', {
        templateId,
        totalUsers: userIds.length,
        totalSent,
        failures: failures.length
      });

      return {
        success: totalSent > 0,
        totalSent,
        failures
      };

    } catch (error) {
      logger.error('Failed to send bulk notification', error);
      throw error;
    }
  }

  async createNotificationFromTemplate(
    userId: string,
    templateId: string,
    variables: Record<string, any> = {}
  ): Promise<PushNotification> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Replace variables in title and body
    const title = this.replaceVariables(template.title, variables);
    const body = this.replaceVariables(template.body, variables);

    return {
      id: `${templateId}_${userId}_${Date.now()}`,
      userId,
      title,
      body,
      priority: template.priority,
      category: template.category,
      data: {
        ...template.data,
        templateId,
        ...variables
      }
    };
  }

  private replaceVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  async scheduleNotification(
    notification: PushNotification,
    scheduledAt: Date
  ): Promise<string> {
    try {
      const scheduleId = `scheduled_${notification.id}_${Date.now()}`;

      // Store scheduled notification in cache
      await optimizedCache.set(
        `scheduled_notification:${scheduleId}`,
        { ...notification, scheduledAt },
        { ttl: Math.floor((scheduledAt.getTime() - Date.now()) / 1000) + 60 }
      );

      // Set timeout to send notification
      const delay = scheduledAt.getTime() - Date.now();
      setTimeout(async () => {
        try {
          await this.sendNotification(notification);
          await optimizedCache.delete(`scheduled_notification:${scheduleId}`);
        } catch (error) {
          logger.error('Failed to send scheduled notification', error);
        }
      }, delay);

      logger.info('Notification scheduled', {
        scheduleId,
        userId: notification.userId,
        scheduledAt
      });

      return scheduleId;

    } catch (error) {
      logger.error('Failed to schedule notification', error);
      throw error;
    }
  }

  async cancelScheduledNotification(scheduleId: string): Promise<boolean> {
    try {
      const deleted = await optimizedCache.delete(`scheduled_notification:${scheduleId}`);

      logger.info('Scheduled notification cancelled', { scheduleId, deleted });

      return deleted;

    } catch (error) {
      logger.error('Failed to cancel scheduled notification', error);
      throw error;
    }
  }

  private async updateNotificationStats(
    notification: PushNotification,
    results: Array<{ platform: string; success: boolean }>
  ): Promise<void> {
    try {
      const statsKey = `notification_stats:${new Date().toISOString().split('T')[0]}`;
      const stats = await optimizedCache.get(statsKey) || {
        sent: 0,
        delivered: 0,
        failed: 0,
        platform: {},
        categories: {}
      };

      stats.sent += results.length;
      stats.delivered += results.filter(r => r.success).length;
      stats.failed += results.filter(r => !r.success).length;

      // Platform stats
      results.forEach(result => {
        stats.platform[result.platform] = (stats.platform[result.platform] || 0) + 1;
      });

      // Category stats
      if (notification.category) {
        stats.categories[notification.category] = (stats.categories[notification.category] || 0) + 1;
      }

      await optimizedCache.set(statsKey, stats, { ttl: 86400 * 7 }); // 7 days

    } catch (error) {
      logger.error('Failed to update notification stats', error);
    }
  }

  private async cleanupInvalidTokens(
    userId: string,
    results: Array<{ token: string; success: boolean; error?: string }>
  ): Promise<void> {
    try {
      const invalidTokens = results
        .filter(r => !r.success && (r.error === 'Invalid token' || r.error?.includes('not-registered')))
        .map(r => r.token);

      if (invalidTokens.length === 0) return;

      const userTokens = this.deviceTokens.get(userId) || [];
      const validTokens = userTokens.filter(t => !invalidTokens.includes(t.token));

      this.deviceTokens.set(userId, validTokens);
      await this.cacheDeviceTokens();

      logger.info('Invalid tokens cleaned up', {
        userId,
        removedTokens: invalidTokens.length
      });

    } catch (error) {
      logger.error('Failed to cleanup invalid tokens', error);
    }
  }

  private async loadDeviceTokens(): Promise<void> {
    try {
      const cached = await optimizedCache.get('device_tokens');
      if (cached) {
        this.deviceTokens = new Map(cached);
        logger.info('Device tokens loaded from cache');
      }
    } catch (error) {
      logger.error('Failed to load device tokens', error);
    }
  }

  private async cacheDeviceTokens(): Promise<void> {
    try {
      await optimizedCache.set(
        'device_tokens',
        Array.from(this.deviceTokens.entries()),
        { ttl: 86400 * 30 } // 30 days
      );
    } catch (error) {
      logger.error('Failed to cache device tokens', error);
    }
  }

  async getNotificationStats(days: number = 7): Promise<NotificationStats> {
    try {
      const stats: NotificationStats = {
        sent: 0,
        delivered: 0,
        opened: 0,
        failed: 0,
        platform: {},
        categories: {}
      };

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const statsKey = `notification_stats:${date.toISOString().split('T')[0]}`;

        const dayStats = await optimizedCache.get(statsKey);
        if (dayStats) {
          stats.sent += dayStats.sent || 0;
          stats.delivered += dayStats.delivered || 0;
          stats.failed += dayStats.failed || 0;

          // Merge platform stats
          Object.entries(dayStats.platform || {}).forEach(([platform, count]) => {
            stats.platform[platform] = (stats.platform[platform] || 0) + (count as number);
          });

          // Merge category stats
          Object.entries(dayStats.categories || {}).forEach(([category, count]) => {
            stats.categories[category] = (stats.categories[category] || 0) + (count as number);
          });
        }
      }

      return stats;

    } catch (error) {
      logger.error('Failed to get notification stats', error);
      throw error;
    }
  }

  async getUserNotificationPreferences(userId: string): Promise<{
    enabled: boolean;
    categories: Record<string, boolean>;
    quietHours?: { start: string; end: string };
    timezone?: string;
  }> {
    try {
      const preferences = await optimizedCache.get(`notification_preferences:${userId}`) || {
        enabled: true,
        categories: {
          order: true,
          rfq: true,
          promotion: true,
          inventory: true,
          payment: true,
          welcome: true
        }
      };

      return preferences;

    } catch (error) {
      logger.error('Failed to get notification preferences', error);
      throw error;
    }
  }

  async updateUserNotificationPreferences(
    userId: string,
    preferences: {
      enabled?: boolean;
      categories?: Record<string, boolean>;
      quietHours?: { start: string; end: string };
      timezone?: string;
    }
  ): Promise<void> {
    try {
      const current = await this.getUserNotificationPreferences(userId);
      const updated = { ...current, ...preferences };

      await optimizedCache.set(
        `notification_preferences:${userId}`,
        updated,
        { ttl: 86400 * 365 } // 1 year
      );

      logger.info('Notification preferences updated', { userId });

    } catch (error) {
      logger.error('Failed to update notification preferences', error);
      throw error;
    }
  }
}

export const mobilePushNotificationService = new MobilePushNotificationService();
