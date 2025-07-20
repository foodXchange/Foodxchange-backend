import { EventEmitter } from 'events';

import { ServiceBusClient, ServiceBusMessage, ServiceBusReceiver, ServiceBusReceivedMessage } from '@azure/service-bus';

import { Logger } from '../../core/logging/logger';

const logger = new Logger('ServiceBusService');

export interface ServiceBusEvent {
  eventType: string;
  tenantId: string;
  userId?: string;
  entityId: string;
  entityType: 'order' | 'rfq' | 'product' | 'user' | 'company' | 'compliance';
  data: any;
  timestamp: Date;
  correlationId?: string;
  sessionId?: string;
  version: string;
}

export interface ServiceBusQueue {
  name: string;
  description: string;
  maxRetries: number;
  retryDelay: number;
}

export interface ServiceBusTopic {
  name: string;
  description: string;
  subscriptions: string[];
}

export class ServiceBusService extends EventEmitter {
  private readonly client: ServiceBusClient | null = null;
  private readonly receivers: Map<string, ServiceBusReceiver> = new Map();
  private isProcessing = false;

  // Predefined queues for different event types
  private readonly queues: ServiceBusQueue[] = [
    { name: 'order-events', description: 'Order lifecycle events', maxRetries: 3, retryDelay: 5000 },
    { name: 'rfq-events', description: 'RFQ lifecycle events', maxRetries: 3, retryDelay: 5000 },
    { name: 'product-events', description: 'Product catalog events', maxRetries: 2, retryDelay: 3000 },
    { name: 'user-events', description: 'User management events', maxRetries: 2, retryDelay: 3000 },
    { name: 'compliance-events', description: 'Compliance monitoring events', maxRetries: 5, retryDelay: 10000 },
    { name: 'notification-events', description: 'Notification delivery events', maxRetries: 3, retryDelay: 2000 },
    { name: 'analytics-events', description: 'Analytics and reporting events', maxRetries: 1, retryDelay: 1000 },
    { name: 'integration-events', description: 'External system integration events', maxRetries: 3, retryDelay: 15000 }
  ];

  // Predefined topics for pub/sub patterns
  private readonly topics: ServiceBusTopic[] = [
    {
      name: 'order-lifecycle',
      description: 'Order lifecycle topic',
      subscriptions: ['order-analytics', 'order-notifications', 'order-compliance']
    },
    {
      name: 'rfq-lifecycle',
      description: 'RFQ lifecycle topic',
      subscriptions: ['rfq-analytics', 'rfq-notifications', 'rfq-matching']
    },
    {
      name: 'compliance-alerts',
      description: 'Compliance monitoring topic',
      subscriptions: ['compliance-notifications', 'compliance-analytics', 'compliance-reporting']
    },
    {
      name: 'system-events',
      description: 'System-wide events topic',
      subscriptions: ['system-monitoring', 'system-analytics', 'system-notifications']
    }
  ];

  constructor() {
    super();
    const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;

    if (connectionString) {
      this.client = new ServiceBusClient(connectionString);
    } else {
      logger.warn('Azure Service Bus connection string not configured');
    }
  }

  /**
   * Initialize message processing
   */
  async initialize(): Promise<void> {
    if (!this.client) {
      logger.warn('Service Bus not configured, skipping initialization');
      return;
    }

    try {
      // Start processing messages from all queues
      await this.startMessageProcessing();
      logger.info('Service Bus initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Service Bus:', error);
      throw error;
    }
  }

  /**
   * Start message processing for all queues
   */
  private async startMessageProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    for (const queue of this.queues) {
      try {
        await this.startQueueProcessor(queue.name);
      } catch (error) {
        logger.error(`Failed to start processor for queue ${queue.name}:`, error);
      }
    }
  }

  /**
   * Start processing messages from a specific queue
   */
  private async startQueueProcessor(queueName: string): Promise<void> {
    if (!this.client) return;

    try {
      const receiver = this.client.createReceiver(queueName);
      this.receivers.set(queueName, receiver);

      receiver.subscribe({
        processMessage: async (message: ServiceBusReceivedMessage) => {
          await this.processMessage(queueName, message);
        },
        processError: async (args) => {
          logger.error(`Error processing message from queue ${queueName}:`, args.error);
        }
      });

      logger.info(`Started processing messages from queue: ${queueName}`);
    } catch (error) {
      logger.error(`Failed to start queue processor for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Process received message
   */
  private async processMessage(queueName: string, message: ServiceBusReceivedMessage): Promise<void> {
    try {
      const eventData = message.body as ServiceBusEvent;

      logger.debug('Processing message', {
        queueName,
        eventType: eventData.eventType,
        entityType: eventData.entityType,
        entityId: eventData.entityId
      });

      // Emit event for local processing
      this.emit('message', {
        queueName,
        eventData,
        message
      });

      // Emit specific event type
      this.emit(eventData.eventType, eventData);

      // Complete the message
      await message.complete();

      logger.debug('Message processed successfully', {
        queueName,
        eventType: eventData.eventType,
        messageId: message.messageId
      });
    } catch (error) {
      logger.error('Error processing message:', error);

      // Abandon the message for retry
      await message.abandon();
      throw error;
    }
  }

  /**
   * Send structured event to queue
   */
  async sendEvent(queueName: string, event: ServiceBusEvent): Promise<void> {
    if (!this.client) {
      logger.warn('Service Bus not configured, skipping event');
      return;
    }

    try {
      const sender = this.client.createSender(queueName);

      const sbMessage: ServiceBusMessage = {
        body: event,
        contentType: 'application/json',
        messageId: `${event.entityType}-${event.entityId}-${Date.now()}`,
        correlationId: event.correlationId,
        sessionId: event.sessionId,
        subject: event.eventType,
        timeToLive: 24 * 60 * 60 * 1000, // 24 hours
        applicationProperties: {
          eventType: event.eventType,
          entityType: event.entityType,
          tenantId: event.tenantId,
          version: event.version
        }
      };

      await sender.sendMessages(sbMessage);
      await sender.close();

      logger.debug('Event sent to Service Bus queue', {
        queueName,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId
      });
    } catch (error) {
      logger.error('Failed to send event to Service Bus:', error);
      throw error;
    }
  }

  /**
   * Send message to Service Bus queue (legacy method)
   */
  async sendToQueue(queueName: string, message: any): Promise<void> {
    if (!this.client) {
      logger.warn('Service Bus not configured, skipping message');
      return;
    }

    try {
      const sender = this.client.createSender(queueName);

      const sbMessage: ServiceBusMessage = {
        body: message,
        contentType: 'application/json',
        messageId: `${Date.now()}-${Math.random()}`
      };

      await sender.sendMessages(sbMessage);
      await sender.close();

      logger.debug('Message sent to Service Bus queue', { queueName });
    } catch (error) {
      logger.error('Failed to send message to Service Bus:', error);
      throw error;
    }
  }

  /**
   * Send message to Service Bus topic
   */
  async sendToTopic(topicName: string, message: any): Promise<void> {
    if (!this.client) {
      logger.warn('Service Bus not configured, skipping message');
      return;
    }

    try {
      const sender = this.client.createSender(topicName);

      const sbMessage: ServiceBusMessage = {
        body: message,
        contentType: 'application/json',
        messageId: `${Date.now()}-${Math.random()}`
      };

      await sender.sendMessages(sbMessage);
      await sender.close();

      logger.debug('Message sent to Service Bus topic', { topicName });
    } catch (error) {
      logger.error('Failed to send message to Service Bus:', error);
      throw error;
    }
  }

  /**
   * Send event to topic
   */
  async sendEventToTopic(topicName: string, event: ServiceBusEvent): Promise<void> {
    if (!this.client) {
      logger.warn('Service Bus not configured, skipping event');
      return;
    }

    try {
      const sender = this.client.createSender(topicName);

      const sbMessage: ServiceBusMessage = {
        body: event,
        contentType: 'application/json',
        messageId: `${event.entityType}-${event.entityId}-${Date.now()}`,
        correlationId: event.correlationId,
        sessionId: event.sessionId,
        subject: event.eventType,
        timeToLive: 24 * 60 * 60 * 1000,
        applicationProperties: {
          eventType: event.eventType,
          entityType: event.entityType,
          tenantId: event.tenantId,
          version: event.version
        }
      };

      await sender.sendMessages(sbMessage);
      await sender.close();

      logger.debug('Event sent to Service Bus topic', {
        topicName,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId
      });
    } catch (error) {
      logger.error('Failed to send event to Service Bus topic:', error);
      throw error;
    }
  }

  /**
   * Send order event
   */
  async sendOrderEvent(eventType: string, orderId: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `order.${eventType}`,
      tenantId,
      userId,
      entityId: orderId,
      entityType: 'order',
      data,
      timestamp: new Date(),
      correlationId: `order-${orderId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('order-events', event);
    await this.sendEventToTopic('order-lifecycle', event);
  }

  /**
   * Send RFQ event
   */
  async sendRFQEvent(eventType: string, rfqId: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `rfq.${eventType}`,
      tenantId,
      userId,
      entityId: rfqId,
      entityType: 'rfq',
      data,
      timestamp: new Date(),
      correlationId: `rfq-${rfqId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('rfq-events', event);
    await this.sendEventToTopic('rfq-lifecycle', event);
  }

  /**
   * Send compliance event
   */
  async sendComplianceEvent(eventType: string, entityId: string, entityType: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `compliance.${eventType}`,
      tenantId,
      userId,
      entityId,
      entityType: entityType as any,
      data,
      timestamp: new Date(),
      correlationId: `compliance-${entityId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('compliance-events', event);
    await this.sendEventToTopic('compliance-alerts', event);
  }

  /**
   * Send product event
   */
  async sendProductEvent(eventType: string, productId: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `product.${eventType}`,
      tenantId,
      userId,
      entityId: productId,
      entityType: 'product',
      data,
      timestamp: new Date(),
      correlationId: `product-${productId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('product-events', event);
  }

  /**
   * Send user event
   */
  async sendUserEvent(eventType: string, userId: string, tenantId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `user.${eventType}`,
      tenantId,
      userId,
      entityId: userId,
      entityType: 'user',
      data,
      timestamp: new Date(),
      correlationId: `user-${userId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('user-events', event);
  }

  /**
   * Send notification event
   */
  async sendNotificationEvent(eventType: string, notificationId: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `notification.${eventType}`,
      tenantId,
      userId,
      entityId: notificationId,
      entityType: 'user',
      data,
      timestamp: new Date(),
      correlationId: `notification-${notificationId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('notification-events', event);
  }

  /**
   * Send analytics event
   */
  async sendAnalyticsEvent(eventType: string, entityId: string, entityType: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `analytics.${eventType}`,
      tenantId,
      userId,
      entityId,
      entityType: entityType as any,
      data,
      timestamp: new Date(),
      correlationId: `analytics-${entityId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('analytics-events', event);
  }

  /**
   * Send integration event
   */
  async sendIntegrationEvent(eventType: string, entityId: string, entityType: string, tenantId: string, userId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `integration.${eventType}`,
      tenantId,
      userId,
      entityId,
      entityType: entityType as any,
      data,
      timestamp: new Date(),
      correlationId: `integration-${entityId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEvent('integration-events', event);
  }

  /**
   * Send system event
   */
  async sendSystemEvent(eventType: string, entityId: string, tenantId: string, data: any): Promise<void> {
    const event: ServiceBusEvent = {
      eventType: `system.${eventType}`,
      tenantId,
      entityId,
      entityType: 'user',
      data,
      timestamp: new Date(),
      correlationId: `system-${entityId}-${Date.now()}`,
      version: '1.0'
    };

    await this.sendEventToTopic('system-events', event);
  }

  /**
   * Get queue information
   */
  getQueues(): ServiceBusQueue[] {
    return this.queues;
  }

  /**
   * Get topic information
   */
  getTopics(): ServiceBusTopic[] {
    return this.topics;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string; queueCount: number; receiverCount: number }> {
    try {
      if (!this.client) {
        return {
          healthy: false,
          message: 'Service Bus not configured',
          queueCount: 0,
          receiverCount: 0
        };
      }

      return {
        healthy: true,
        message: 'Service Bus healthy',
        queueCount: this.queues.length,
        receiverCount: this.receivers.size
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Service Bus health check failed: ${error.message}`,
        queueCount: this.queues.length,
        receiverCount: this.receivers.size
      };
    }
  }

  /**
   * Stop message processing
   */
  async stopProcessing(): Promise<void> {
    this.isProcessing = false;

    for (const [queueName, receiver] of this.receivers) {
      try {
        await receiver.close();
        logger.info(`Stopped processing messages from queue: ${queueName}`);
      } catch (error) {
        logger.error(`Error stopping receiver for queue ${queueName}:`, error);
      }
    }

    this.receivers.clear();
  }

  /**
   * Close Service Bus connection
   */
  async close(): Promise<void> {
    await this.stopProcessing();

    if (this.client) {
      await this.client.close();
      logger.info('Service Bus connection closed');
    }
  }
}

// Singleton instance
let serviceBusService: ServiceBusService;

export const getServiceBusService = (): ServiceBusService => {
  if (!serviceBusService) {
    serviceBusService = new ServiceBusService();
  }
  return serviceBusService;
};

/**
 * Helper function to publish to Service Bus
 */
export const publishToServiceBus = async (queueOrTopic: string, message: any): Promise<void> => {
  const service = getServiceBusService();
  // Assuming queues for now, can be extended to support topics
  await service.sendToQueue(queueOrTopic, message);
};
