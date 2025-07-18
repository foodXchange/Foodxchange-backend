import { Logger } from '../../core/logging/logger';
import { cacheService } from '../../config/redis';
import { metricsService } from '../../core/metrics/MetricsService';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';

const logger = new Logger('NotificationService');
const metrics = metricsService;

export interface Notification {
  id: string;
  userId: string;
  type: 'rfq_created' | 'proposal_submitted' | 'proposal_accepted' | 'proposal_rejected' | 'compliance_update' | 'system_alert';
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channels: NotificationChannel[];
  status: 'pending' | 'sent' | 'failed' | 'read';
  createdAt: Date;
  sentAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'push' | 'websocket' | 'in_app';
  enabled: boolean;
  address?: string;
  status: 'pending' | 'sent' | 'failed';
  error?: string;
  sentAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  type: string;
  title: string;
  bodyTemplate: string;
  emailTemplate?: string;
  smsTemplate?: string;
  pushTemplate?: string;
  variables: string[];
  isActive: boolean;
}

export interface NotificationPreference {
  userId: string;
  type: string;
  channels: {
    email: boolean;
    sms: boolean;
    push: boolean;
    websocket: boolean;
    in_app: boolean;
  };
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
  quietHours?: {
    start: string;
    end: string;
    timezone: string;
  };
}

export class NotificationService extends EventEmitter {
  private static instance: NotificationService;
  private cache: typeof cacheService;

  private constructor() {
    super();
    this.cache = cacheService;
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async notify(notificationData: Omit<Notification, 'id' | 'channels' | 'status' | 'createdAt'>): Promise<void> {
    try {
      // Get user preferences
      const preferences = await this.getUserPreferences(notificationData.userId);
      
      // Get notification template
      const template = await this.getNotificationTemplate(notificationData.type);
      
      // Build notification
      const notification: Notification = {
        id: new mongoose.Types.ObjectId().toString(),
        ...notificationData,
        channels: this.buildChannels(preferences, notificationData.type),
        status: 'pending',
        createdAt: new Date(),
      };

      // Save notification
      await this.saveNotification(notification);

      // Send notification
      await this.sendNotification(notification, template);

      metrics.increment('notifications_sent');
      
      logger.info('Notification sent', { 
        id: notification.id, 
        type: notification.type,
        userId: notification.userId 
      });
    } catch (error) {
      logger.error('Failed to send notification', { notificationData, error });
    }
  }

  private buildChannels(preferences: NotificationPreference, type: string): NotificationChannel[] {
    const channels: NotificationChannel[] = [];
    
    if (preferences.channels.email) {
      channels.push({
        type: 'email',
        enabled: true,
        status: 'pending',
      });
    }
    
    if (preferences.channels.websocket) {
      channels.push({
        type: 'websocket',
        enabled: true,
        status: 'pending',
      });
    }
    
    return channels;
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreference> {
    // Get user preferences from database
    return {
      userId,
      type: 'default',
      channels: {
        email: true,
        sms: false,
        push: false,
        websocket: true,
        in_app: true,
      },
      frequency: 'immediate',
    };
  }

  private async getNotificationTemplate(type: string): Promise<NotificationTemplate | null> {
    // Get notification template from database
    return null;
  }

  private async saveNotification(notification: Notification): Promise<void> {
    // Save notification to database
  }

  private async sendNotification(notification: Notification, template: NotificationTemplate | null): Promise<void> {
    // Send notification through various channels
  }
}

export default NotificationService.getInstance();