import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService';
import { RealTimeStatusService } from './RealTimeStatusService';
import { config } from '../config';

const logger = new Logger('NotificationService');

export interface NotificationTemplate {
  id: string;
  name: string;
  category: 'expert' | 'agent' | 'client' | 'admin';
  type: 'email' | 'sms' | 'push' | 'in_app' | 'whatsapp';
  subject: string;
  content: string;
  variables: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  triggers: string[];
  localizations: Record<string, { subject: string; content: string }>;
}

export interface NotificationData {
  templateId: string;
  userId: string;
  userType: 'expert' | 'agent' | 'client';
  channels: ('email' | 'sms' | 'push' | 'in_app' | 'whatsapp')[];
  variables: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scheduleFor?: Date;
  metadata?: Record<string, any>;
}

export interface NotificationPreferences {
  userId: string;
  userType: 'expert' | 'agent' | 'client';
  email: {
    enabled: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
    categories: string[];
  };
  sms: {
    enabled: boolean;
    emergencyOnly: boolean;
  };
  push: {
    enabled: boolean;
    quietHours: { start: string; end: string };
  };
  inApp: {
    enabled: boolean;
    soundEnabled: boolean;
  };
  whatsapp: {
    enabled: boolean;
    businessHoursOnly: boolean;
  };
  language: string;
  timezone: string;
}

export interface NotificationHistory {
  id: string;
  userId: string;
  templateId: string;
  channel: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  error?: string;
  metadata: Record<string, any>;
}

export class NotificationService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private preferences: Map<string, NotificationPreferences> = new Map();
  private realTimeService?: RealTimeStatusService;

  constructor(realTimeService?: RealTimeStatusService) {
    this.realTimeService = realTimeService;
    this.loadNotificationTemplates();
  }

  private loadNotificationTemplates(): void {
    const templates: NotificationTemplate[] = [
      // Expert notifications
      {
        id: 'expert_booking_request',
        name: 'New Booking Request',
        category: 'expert',
        type: 'email',
        subject: 'New Booking Request - {{clientName}}',
        content: `Hello {{expertName}},

You have received a new booking request from {{clientName}} for {{serviceName}}.

Project Details:
- Duration: {{duration}}
- Start Date: {{startDate}}
- Budget: {{budget}}

Please review and respond within 24 hours.

Best regards,
FoodXchange Team`,
        variables: ['expertName', 'clientName', 'serviceName', 'duration', 'startDate', 'budget'],
        priority: 'high',
        triggers: ['booking_created'],
        localizations: {}
      },
      {
        id: 'expert_payment_received',
        name: 'Payment Received',
        category: 'expert',
        type: 'email',
        subject: 'Payment Received - ${{amount}}',
        content: `Hello {{expertName}},

Great news! You have received a payment of ${{amount}} for project "{{projectName}}".

Payment Details:
- Amount: ${{amount}}
- Project: {{projectName}}
- Client: {{clientName}}
- Payment Date: {{paymentDate}}

The funds will be available in your account within 2-3 business days.

Best regards,
FoodXchange Team`,
        variables: ['expertName', 'amount', 'projectName', 'clientName', 'paymentDate'],
        priority: 'medium',
        triggers: ['payment_received'],
        localizations: {}
      },
      
      // Agent notifications
      {
        id: 'agent_lead_assigned',
        name: 'New Lead Assigned',
        category: 'agent',
        type: 'push',
        subject: 'New Lead: {{companyName}}',
        content: `You have been assigned a new lead from {{companyName}}.

Lead Details:
- Company: {{companyName}}
- Contact: {{contactPerson}}
- Product Interest: {{productCategories}}
- Estimated Value: ${{estimatedValue}}
- Urgency: {{urgency}}

Please contact within {{responseTime}}.`,
        variables: ['companyName', 'contactPerson', 'productCategories', 'estimatedValue', 'urgency', 'responseTime'],
        priority: 'high',
        triggers: ['lead_assigned'],
        localizations: {}
      },
      {
        id: 'agent_commission_earned',
        name: 'Commission Earned',
        category: 'agent',
        type: 'whatsapp',
        subject: 'Commission Earned - ${{commission}}',
        content: `🎉 Congratulations {{agentName}}!

You've earned a commission of ${{commission}} for converting lead {{leadId}}.

Transaction Details:
- Lead: {{companyName}}
- Transaction Value: ${{transactionValue}}
- Your Commission: ${{commission}}
- Commission Rate: {{commissionRate}}%

Keep up the excellent work!`,
        variables: ['agentName', 'commission', 'leadId', 'companyName', 'transactionValue', 'commissionRate'],
        priority: 'medium',
        triggers: ['commission_calculated'],
        localizations: {}
      },
      
      // Client notifications
      {
        id: 'client_expert_matched',
        name: 'Expert Match Found',
        category: 'client',
        type: 'email',
        subject: 'We found {{matchCount}} expert matches for your project',
        content: `Hello {{clientName}},

Great news! We found {{matchCount}} expert matches for your project "{{projectName}}".

Top Match:
- Expert: {{topExpertName}}
- Specialization: {{specialization}}
- Rating: {{rating}}/5
- Hourly Rate: ${{hourlyRate}}

You can review all matches and book your preferred expert through your dashboard.

Best regards,
FoodXchange Team`,
        variables: ['clientName', 'matchCount', 'projectName', 'topExpertName', 'specialization', 'rating', 'hourlyRate'],
        priority: 'medium',
        triggers: ['expert_matches_found'],
        localizations: {}
      },
      
      // System notifications
      {
        id: 'system_maintenance',
        name: 'System Maintenance Notice',
        category: 'admin',
        type: 'in_app',
        subject: 'Scheduled Maintenance - {{maintenanceDate}}',
        content: `System maintenance is scheduled for {{maintenanceDate}} from {{startTime}} to {{endTime}}.

During this time, some features may be temporarily unavailable.

We appreciate your patience.`,
        variables: ['maintenanceDate', 'startTime', 'endTime'],
        priority: 'low',
        triggers: ['maintenance_scheduled'],
        localizations: {}
      }
    ];

    templates.forEach(template => {
      this.templates.set(template.id, template);
    });

    logger.info(`Loaded ${templates.length} notification templates`);
  }

  /**
   * Send notification to user
   */
  async sendNotification(data: NotificationData): Promise<boolean> {
    try {
      const template = this.templates.get(data.templateId);
      if (!template) {
        logger.error('Template not found:', data.templateId);
        return false;
      }

      // Get user preferences
      const preferences = await this.getUserPreferences(data.userId);
      
      // Filter channels based on preferences
      const enabledChannels = this.filterChannelsByPreferences(data.channels, preferences);
      
      if (enabledChannels.length === 0) {
        logger.info('No enabled channels for notification', { userId: data.userId });
        return true; // Not an error, user has disabled notifications
      }

      // Process each channel
      const results = await Promise.allSettled(
        enabledChannels.map(channel => this.sendToChannel(channel, template, data, preferences))
      );

      const successCount = results.filter(result => result.status === 'fulfilled').length;
      const success = successCount > 0;

      // Log notification attempt
      await this.logNotificationHistory({
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: data.userId,
        templateId: data.templateId,
        channel: enabledChannels.join(','),
        status: success ? 'sent' : 'failed',
        sentAt: new Date(),
        metadata: {
          channels: enabledChannels,
          successCount,
          variables: data.variables
        }
      });

      return success;
    } catch (error) {
      logger.error('Notification sending failed:', error);
      return false;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(notifications: NotificationData[]): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      notifications.map(notification => this.sendNotification(notification))
    );

    const success = results.filter(result => result.status === 'fulfilled' && result.value).length;
    const failed = results.length - success;

    logger.info('Bulk notifications completed', { total: results.length, success, failed });

    return { success, failed };
  }

  private async sendToChannel(
    channel: string,
    template: NotificationTemplate,
    data: NotificationData,
    preferences: NotificationPreferences
  ): Promise<void> {
    const content = this.processTemplate(template, data.variables, preferences.language);

    switch (channel) {
      case 'email':
        await this.sendEmail(data.userId, content.subject, content.content, data.priority);
        break;
      case 'sms':
        await this.sendSMS(data.userId, content.content, data.priority);
        break;
      case 'push':
        await this.sendPushNotification(data.userId, content.subject, content.content, data.priority);
        break;
      case 'in_app':
        await this.sendInAppNotification(data.userId, content.subject, content.content, data.priority);
        break;
      case 'whatsapp':
        await this.sendWhatsAppMessage(data.userId, content.content, data.priority);
        break;
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }
  }

  private processTemplate(
    template: NotificationTemplate,
    variables: Record<string, any>,
    language: string = 'en'
  ): { subject: string; content: string } {
    // Get localized template if available
    const localized = template.localizations[language];
    let subject = localized?.subject || template.subject;
    let content = localized?.content || template.content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
      content = content.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return { subject, content };
  }

  private async sendEmail(userId: string, subject: string, content: string, priority: string): Promise<void> {
    // Integrate with your email service (Azure Communication Services, SendGrid, etc.)
    logger.info('Sending email notification', { userId, subject, priority });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In real implementation:
    // await emailService.send({ to: userEmail, subject, content, priority });
  }

  private async sendSMS(userId: string, content: string, priority: string): Promise<void> {
    // Integrate with SMS service (Twilio, Azure Communication Services, etc.)
    logger.info('Sending SMS notification', { userId, priority });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendPushNotification(userId: string, title: string, content: string, priority: string): Promise<void> {
    // Integrate with push notification service (Firebase, Apple Push Notification, etc.)
    logger.info('Sending push notification', { userId, title, priority });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendInAppNotification(userId: string, title: string, content: string, priority: string): Promise<void> {
    // Send real-time notification via WebSocket
    if (this.realTimeService) {
      await this.realTimeService.sendNotificationToUser(userId, {
        type: 'in_app_notification',
        title,
        content,
        priority,
        timestamp: new Date()
      });
    }
    
    // Store for later retrieval
    await this.storeInAppNotification(userId, title, content, priority);
  }

  private async sendWhatsAppMessage(userId: string, content: string, priority: string): Promise<void> {
    // Integrate with WhatsApp Business API
    logger.info('Sending WhatsApp notification', { userId, priority });
    
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async storeInAppNotification(userId: string, title: string, content: string, priority: string): Promise<void> {
    const notification = {
      id: `inapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      title,
      content,
      priority,
      read: false,
      createdAt: new Date()
    };

    // Store in cache for quick retrieval
    await advancedCacheService.set(
      `in_app_notifications:${userId}:${notification.id}`,
      notification,
      { ttl: 86400 * 30, tags: ['notifications', `user:${userId}`] } // 30 days
    );

    // Add to user's notification list
    const userNotifications = await this.getInAppNotifications(userId);
    userNotifications.unshift(notification);
    
    // Keep only last 100 notifications
    const trimmedNotifications = userNotifications.slice(0, 100);
    
    await advancedCacheService.set(
      `in_app_notifications_list:${userId}`,
      trimmedNotifications,
      { ttl: 86400 * 30, tags: ['notifications', `user:${userId}`] }
    );
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      // Try cache first
      const cached = await advancedCacheService.get<NotificationPreferences>(`notification_prefs:${userId}`);
      if (cached) return cached;

      // Default preferences if not found
      const defaultPreferences: NotificationPreferences = {
        userId,
        userType: 'expert', // This should be fetched from user profile
        email: {
          enabled: true,
          frequency: 'immediate',
          categories: ['booking', 'payment', 'system']
        },
        sms: {
          enabled: false,
          emergencyOnly: true
        },
        push: {
          enabled: true,
          quietHours: { start: '22:00', end: '08:00' }
        },
        inApp: {
          enabled: true,
          soundEnabled: true
        },
        whatsapp: {
          enabled: false,
          businessHoursOnly: true
        },
        language: 'en',
        timezone: 'UTC'
      };

      // Cache for 1 hour
      await advancedCacheService.set(
        `notification_prefs:${userId}`,
        defaultPreferences,
        { ttl: 3600, tags: ['preferences', `user:${userId}`] }
      );

      return defaultPreferences;
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    try {
      const currentPreferences = await this.getUserPreferences(userId);
      const updatedPreferences = { ...currentPreferences, ...preferences };

      // Update in database (implement based on your data layer)
      // await UserPreferences.findOneAndUpdate({ userId }, updatedPreferences, { upsert: true });

      // Update cache
      await advancedCacheService.set(
        `notification_prefs:${userId}`,
        updatedPreferences,
        { ttl: 3600, tags: ['preferences', `user:${userId}`] }
      );

      logger.info('User notification preferences updated', { userId });
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  private filterChannelsByPreferences(
    channels: string[],
    preferences: NotificationPreferences
  ): string[] {
    return channels.filter(channel => {
      switch (channel) {
        case 'email':
          return preferences.email.enabled;
        case 'sms':
          return preferences.sms.enabled;
        case 'push':
          return preferences.push.enabled && this.isWithinActiveHours(preferences);
        case 'in_app':
          return preferences.inApp.enabled;
        case 'whatsapp':
          return preferences.whatsapp.enabled && this.isBusinessHours(preferences);
        default:
          return false;
      }
    });
  }

  private isWithinActiveHours(preferences: NotificationPreferences): boolean {
    if (!preferences.push.quietHours) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = preferences.push.quietHours.start.split(':').map(Number);
    const [endHour, endMinute] = preferences.push.quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    if (startTime <= endTime) {
      return currentTime < startTime || currentTime > endTime;
    } else {
      return currentTime < startTime && currentTime > endTime;
    }
  }

  private isBusinessHours(preferences: NotificationPreferences): boolean {
    if (!preferences.whatsapp.businessHoursOnly) return true;

    const now = new Date();
    const currentHour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Business hours: Monday-Friday, 9 AM - 6 PM
    return dayOfWeek >= 1 && dayOfWeek <= 5 && currentHour >= 9 && currentHour < 18;
  }

  /**
   * Get in-app notifications for user
   */
  async getInAppNotifications(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const notifications = await advancedCacheService.get<any[]>(`in_app_notifications_list:${userId}`);
      return notifications ? notifications.slice(0, limit) : [];
    } catch (error) {
      logger.error('Error getting in-app notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
    try {
      const notification = await advancedCacheService.get(`in_app_notifications:${userId}:${notificationId}`);
      if (notification) {
        notification.read = true;
        notification.readAt = new Date();

        await advancedCacheService.set(
          `in_app_notifications:${userId}:${notificationId}`,
          notification,
          { ttl: 86400 * 30, tags: ['notifications', `user:${userId}`] }
        );

        // Update notification list
        const notifications = await this.getInAppNotifications(userId);
        const updatedNotifications = notifications.map(n => 
          n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n
        );

        await advancedCacheService.set(
          `in_app_notifications_list:${userId}`,
          updatedNotifications,
          { ttl: 86400 * 30, tags: ['notifications', `user:${userId}`] }
        );
      }
    } catch (error) {
      logger.error('Error marking notification as read:', error);
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const notifications = await this.getInAppNotifications(userId);
      return notifications.filter(n => !n.read).length;
    } catch (error) {
      logger.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Schedule notification for future delivery
   */
  async scheduleNotification(data: NotificationData): Promise<void> {
    if (!data.scheduleFor) {
      await this.sendNotification(data);
      return;
    }

    const delay = data.scheduleFor.getTime() - Date.now();
    if (delay <= 0) {
      await this.sendNotification(data);
      return;
    }

    // Store scheduled notification
    const scheduledNotification = {
      ...data,
      id: `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      scheduledAt: new Date()
    };

    await advancedCacheService.set(
      `scheduled_notification:${scheduledNotification.id}`,
      scheduledNotification,
      { ttl: Math.ceil(delay / 1000) + 3600, tags: ['scheduled_notifications'] } // TTL with 1 hour buffer
    );

    // Schedule delivery
    setTimeout(async () => {
      try {
        const notification = await advancedCacheService.get(`scheduled_notification:${scheduledNotification.id}`);
        if (notification) {
          await this.sendNotification(notification);
          await advancedCacheService.delete(`scheduled_notification:${scheduledNotification.id}`);
        }
      } catch (error) {
        logger.error('Error sending scheduled notification:', error);
      }
    }, delay);

    logger.info('Notification scheduled', { 
      notificationId: scheduledNotification.id, 
      deliveryTime: data.scheduleFor 
    });
  }

  /**
   * Log notification history
   */
  private async logNotificationHistory(history: NotificationHistory): Promise<void> {
    try {
      // Store in database for analytics and audit trail
      // await NotificationHistory.create(history);

      // Also cache recent history for quick access
      await advancedCacheService.set(
        `notification_history:${history.id}`,
        history,
        { ttl: 86400 * 7, tags: ['notification_history', `user:${history.userId}`] } // 7 days
      );
    } catch (error) {
      logger.error('Error logging notification history:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string, days: number = 30): Promise<any> {
    try {
      // This would typically query your database
      // For now, return mock data
      return {
        totalSent: 150,
        delivered: 145,
        read: 120,
        failed: 5,
        deliveryRate: 96.7,
        readRate: 82.8,
        channelBreakdown: {
          email: 80,
          push: 40,
          inApp: 25,
          sms: 5
        },
        categoryBreakdown: {
          booking: 60,
          payment: 30,
          system: 35,
          marketing: 25
        }
      };
    } catch (error) {
      logger.error('Error getting notification stats:', error);
      return null;
    }
  }

  /**
   * Create notification template
   */
  async createTemplate(template: NotificationTemplate): Promise<void> {
    this.templates.set(template.id, template);
    
    // Store in database for persistence
    // await NotificationTemplate.create(template);
    
    logger.info('Notification template created', { templateId: template.id });
  }

  /**
   * Get all templates
   */
  getTemplates(category?: string): NotificationTemplate[] {
    const templates = Array.from(this.templates.values());
    return category ? templates.filter(t => t.category === category) : templates;
  }

  /**
   * Test notification (for development/testing)
   */
  async testNotification(templateId: string, userId: string, testVariables: Record<string, any>): Promise<boolean> {
    logger.info('Sending test notification', { templateId, userId });
    
    return await this.sendNotification({
      templateId,
      userId,
      userType: 'expert',
      channels: ['in_app'],
      variables: testVariables,
      priority: 'low',
      metadata: { test: true }
    });
  }
}

export const notificationService = new NotificationService();