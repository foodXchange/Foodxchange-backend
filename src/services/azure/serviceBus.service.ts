import { ServiceBusClient, ServiceBusSender, ServiceBusReceiver, ServiceBusMessage } from '@azure/service-bus';

import { trackAzureServiceCall } from '../../config/applicationInsights';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('ServiceBusService');

export interface FoodXchangeMessage {
  eventType: string;
  entityId: string;
  entityType: 'sample' | 'order' | 'shipment' | 'compliance';
  timestamp: Date;
  data: Record<string, any>;
  metadata?: {
    source: string;
    version: string;
    correlationId?: string;
  };
}

export interface MessageHandler {
  (message: FoodXchangeMessage): Promise<void>;
}

class ServiceBusService {
  private client: ServiceBusClient | null = null;
  private readonly senders: Map<string, ServiceBusSender> = new Map();
  private readonly receivers: Map<string, ServiceBusReceiver> = new Map();
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;

      if (!connectionString) {
        logger.warn('Azure Service Bus not configured - missing connection string');
        return;
      }

      this.client = new ServiceBusClient(connectionString);
      this.isInitialized = true;

      logger.info('✅ Azure Service Bus client initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Azure Service Bus', error);
    }
  }

  public async sendMessage(
    topicName: string,
    message: FoodXchangeMessage,
    subject?: string
  ): Promise<void> {
    if (!this.isInitialized || !this.client) {
      logger.warn('Service Bus not initialized, skipping message send');
      return;
    }

    const startTime = Date.now();
    let success = false;

    try {
      let sender = this.senders.get(topicName);
      if (!sender) {
        sender = this.client.createSender(topicName);
        this.senders.set(topicName, sender);
      }

      const sbMessage: ServiceBusMessage = {
        body: message,
        contentType: 'application/json',
        subject: subject || message.eventType,
        messageId: `${message.entityType}-${message.entityId}-${Date.now()}`,
        sessionId: message.entityId, // Group messages by entity
        applicationProperties: {
          timestamp: message.timestamp.toISOString(),
          source: message.metadata?.source || 'foodxchange-backend',
          version: message.metadata?.version || '1.0.0',
          eventType: message.eventType,
          entityType: message.entityType,
          correlationId: message.metadata?.correlationId
        },
        timeToLive: 7 * 24 * 60 * 60 * 1000 // 7 days
      };

      await sender.sendMessages(sbMessage);
      success = true;

      logger.debug(`Message sent to topic ${topicName}`, {
        eventType: message.eventType,
        entityId: message.entityId,
        messageId: sbMessage.messageId
      });
    } catch (error) {
      logger.error('Error sending message to Service Bus', error, {
        topicName,
        eventType: message.eventType,
        entityId: message.entityId
      });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('ServiceBus', `SendMessage.${topicName}`, duration, success);
    }
  }

  public async sendBatchMessages(
    topicName: string,
    messages: FoodXchangeMessage[]
  ): Promise<void> {
    if (!this.isInitialized || !this.client || messages.length === 0) {
      return;
    }

    const startTime = Date.now();
    let success = false;

    try {
      let sender = this.senders.get(topicName);
      if (!sender) {
        sender = this.client.createSender(topicName);
        this.senders.set(topicName, sender);
      }

      const batch = await sender.createMessageBatch();

      for (const message of messages) {
        const sbMessage: ServiceBusMessage = {
          body: message,
          contentType: 'application/json',
          subject: message.eventType,
          messageId: `${message.entityType}-${message.entityId}-${Date.now()}`,
          sessionId: message.entityId,
          applicationProperties: {
            timestamp: message.timestamp.toISOString(),
            source: message.metadata?.source || 'foodxchange-backend',
            eventType: message.eventType,
            entityType: message.entityType
          }
        };

        if (!batch.tryAddMessage(sbMessage)) {
          // Send current batch if it's full
          if (batch.count > 0) {
            await sender.sendMessages(batch);
          }

          // Create new batch and add the message
          const newBatch = await sender.createMessageBatch();
          if (!newBatch.tryAddMessage(sbMessage)) {
            throw new Error(`Message too large for batch: ${message.entityId}`);
          }
          await sender.sendMessages(newBatch);
        }
      }

      // Send remaining messages in batch
      if (batch.count > 0) {
        await sender.sendMessages(batch);
      }

      success = true;
      logger.info(`Batch of ${messages.length} messages sent to topic ${topicName}`);
    } catch (error) {
      logger.error('Error sending batch messages to Service Bus', error, {
        topicName,
        messageCount: messages.length
      });
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      trackAzureServiceCall('ServiceBus', `SendBatch.${topicName}`, duration, success);
    }
  }

  public async createReceiver(
    topicName: string,
    subscriptionName: string,
    messageHandler: MessageHandler,
    options?: {
      maxConcurrentCalls?: number;
      autoCompleteMessages?: boolean;
    }
  ): Promise<void> {
    if (!this.isInitialized || !this.client) {
      logger.warn('Service Bus not initialized, cannot create receiver');
      return;
    }

    const receiverKey = `${topicName}/${subscriptionName}`;

    try {
      if (this.receivers.has(receiverKey)) {
        logger.warn(`Receiver already exists for ${receiverKey}`);
        return;
      }

      const receiver = this.client.createReceiver(topicName, subscriptionName, {
        receiveMode: 'peekLock'
      });

      this.receivers.set(receiverKey, receiver);

      const messageProcessor = {
        processMessage: async (brokeredMessage: ServiceBusMessage) => {
          const startTime = Date.now();
          let success = false;

          try {
            const message = brokeredMessage.body as FoodXchangeMessage;

            logger.debug('Processing message', {
              messageId: brokeredMessage.messageId,
              eventType: message.eventType,
              entityId: message.entityId
            });

            await messageHandler(message);
            await receiver.completeMessage(brokeredMessage);
            success = true;

            logger.debug('Message processed successfully', {
              messageId: brokeredMessage.messageId,
              processingTime: Date.now() - startTime
            });
          } catch (error) {
            logger.error('Error processing message', error, {
              messageId: brokeredMessage.messageId,
              topic: topicName,
              subscription: subscriptionName
            });

            // Dead letter the message after 3 delivery attempts
            if ((brokeredMessage.deliveryCount || 0) >= 3) {
              await receiver.deadLetterMessage(brokeredMessage, {
                reason: 'MaxDeliveryCountExceeded',
                errorDescription: error instanceof Error ? error.message : 'Unknown error'
              });
            } else {
              await receiver.abandonMessage(brokeredMessage);
            }
          } finally {
            const duration = Date.now() - startTime;
            trackAzureServiceCall('ServiceBus', `ProcessMessage.${topicName}`, duration, success);
          }
        },

        processError: async (args: any) => {
          logger.error('Service Bus receiver error', args.error, {
            topic: topicName,
            subscription: subscriptionName,
            errorSource: args.errorSource
          });
        }
      };

      receiver.subscribe(messageProcessor, {
        maxConcurrentCalls: options?.maxConcurrentCalls || 1,
        autoCompleteMessages: options?.autoCompleteMessages || false
      });

      logger.info(`✅ Service Bus receiver started for ${receiverKey}`, {
        maxConcurrentCalls: options?.maxConcurrentCalls || 1
      });
    } catch (error) {
      logger.error(`❌ Failed to create Service Bus receiver for ${receiverKey}`, error);
      throw error;
    }
  }

  public async closeReceiver(topicName: string, subscriptionName: string): Promise<void> {
    const receiverKey = `${topicName}/${subscriptionName}`;
    const receiver = this.receivers.get(receiverKey);

    if (receiver) {
      try {
        await receiver.close();
        this.receivers.delete(receiverKey);
        logger.info(`Service Bus receiver closed for ${receiverKey}`);
      } catch (error) {
        logger.error(`Error closing Service Bus receiver for ${receiverKey}`, error);
      }
    }
  }

  public async closeSender(topicName: string): Promise<void> {
    const sender = this.senders.get(topicName);

    if (sender) {
      try {
        await sender.close();
        this.senders.delete(topicName);
        logger.info(`Service Bus sender closed for ${topicName}`);
      } catch (error) {
        logger.error(`Error closing Service Bus sender for ${topicName}`, error);
      }
    }
  }

  public async close(): Promise<void> {
    try {
      // Close all receivers
      for (const [key, receiver] of this.receivers) {
        await receiver.close();
        logger.debug(`Closed receiver: ${key}`);
      }
      this.receivers.clear();

      // Close all senders
      for (const [key, sender] of this.senders) {
        await sender.close();
        logger.debug(`Closed sender: ${key}`);
      }
      this.senders.clear();

      // Close client
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.isInitialized = false;
      }

      logger.info('✅ Service Bus service closed');
    } catch (error) {
      logger.error('❌ Error closing Service Bus service', error);
    }
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, any> } {
    return {
      healthy: this.isInitialized,
      details: {
        initialized: this.isInitialized,
        activeReceivers: this.receivers.size,
        activeSenders: this.senders.size,
        connectionString: process.env.AZURE_SERVICE_BUS_CONNECTION_STRING ? 'configured' : 'missing'
      }
    };
  }

  // Helper methods for common FoodXchange events
  public async publishSampleEvent(
    sampleId: string,
    eventType: string,
    data: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    const message: FoodXchangeMessage = {
      eventType,
      entityId: sampleId,
      entityType: 'sample',
      timestamp: new Date(),
      data,
      metadata: {
        source: 'foodxchange-backend',
        version: '1.0.0',
        correlationId
      }
    };

    await this.sendMessage('sample-events', message, eventType);
  }

  public async publishOrderEvent(
    orderId: string,
    eventType: string,
    data: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    const message: FoodXchangeMessage = {
      eventType,
      entityId: orderId,
      entityType: 'order',
      timestamp: new Date(),
      data,
      metadata: {
        source: 'foodxchange-backend',
        version: '1.0.0',
        correlationId
      }
    };

    await this.sendMessage('order-events', message, eventType);
  }

  public async publishShipmentEvent(
    shipmentId: string,
    eventType: string,
    data: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    const message: FoodXchangeMessage = {
      eventType,
      entityId: shipmentId,
      entityType: 'shipment',
      timestamp: new Date(),
      data,
      metadata: {
        source: 'foodxchange-backend',
        version: '1.0.0',
        correlationId
      }
    };

    await this.sendMessage('shipment-events', message, eventType);
  }

  public async publishComplianceEvent(
    complianceId: string,
    eventType: string,
    data: Record<string, any>,
    correlationId?: string
  ): Promise<void> {
    const message: FoodXchangeMessage = {
      eventType,
      entityId: complianceId,
      entityType: 'compliance',
      timestamp: new Date(),
      data,
      metadata: {
        source: 'foodxchange-backend',
        version: '1.0.0',
        correlationId
      }
    };

    await this.sendMessage('compliance-events', message, eventType);
  }
}

// Export singleton instance
export const serviceBusService = new ServiceBusService();
export default serviceBusService;
