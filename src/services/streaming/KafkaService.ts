import { Kafka, Producer, Consumer, EachMessagePayload, ConsumerConfig, ProducerConfig } from 'kafkajs';

import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';

interface KafkaMessage {
  topic: string;
  partition?: number;
  key?: string;
  value: any;
  headers?: Record<string, string>;
  timestamp?: Date;
}

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

interface ConsumerHandler {
  topic: string;
  groupId: string;
  handler: (message: StreamEvent) => Promise<void>;
  options?: {
    autoCommit?: boolean;
    maxBatchSize?: number;
    timeout?: number;
  };
}

interface ProducerOptions {
  retries?: number;
  timeout?: number;
  compression?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
  batch?: boolean;
}

export class KafkaService {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly consumers: Map<string, Consumer> = new Map();
  private readonly logger: Logger;
  private isConnected = false;
  private readonly messageBuffer: Map<string, KafkaMessage[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_TIMEOUT = 5000; // 5 seconds

  constructor() {
    this.logger = new Logger('KafkaService');

    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'foodxchange-backend',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_USERNAME && process.env.KAFKA_PASSWORD ? {
        mechanism: 'plain',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD
      } : undefined,
      connectionTimeout: 3000,
      requestTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
  }

  /**
   * Initialize Kafka service
   */
  async initialize(): Promise<void> {
    try {
      await this.initializeProducer();
      this.isConnected = true;
      this.logger.info('Kafka service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Kafka service:', error);
      throw error;
    }
  }

  /**
   * Initialize producer
   */
  private async initializeProducer(): Promise<void> {
    const producerConfig: ProducerConfig = {
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
      retry: {
        initialRetryTime: 100,
        retries: 3
      }
    };

    this.producer = this.kafka.producer(producerConfig);
    await this.producer.connect();
    this.logger.info('Kafka producer connected');
  }

  /**
   * Publish a message to a topic
   */
  async publishMessage(
    topic: string,
    message: any,
    options: ProducerOptions = {}
  ): Promise<void> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka service not initialized');
    }

    try {
      const kafkaMessage: KafkaMessage = {
        topic,
        value: JSON.stringify(message),
        timestamp: new Date(),
        ...options
      };

      if (options.batch) {
        await this.addToBatch(kafkaMessage);
      } else {
        await this.sendMessage(kafkaMessage);
      }
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish a stream event
   */
  async publishEvent(event: Omit<StreamEvent, 'id' | 'timestamp'>): Promise<void> {
    const streamEvent: StreamEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event
    };

    const topic = this.getTopicForEventType(event.type);
    await this.publishMessage(topic, streamEvent);
  }

  /**
   * Subscribe to a topic with a consumer
   */
  async subscribe(consumerHandler: ConsumerHandler): Promise<void> {
    try {
      const { topic, groupId, handler, options = {} } = consumerHandler;

      const consumerConfig: ConsumerConfig = {
        groupId,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576, // 1MB
        maxBytes: 10485760, // 10MB
        allowAutoTopicCreation: false
      };

      const consumer = this.kafka.consumer(consumerConfig);
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });

      await consumer.run({
        autoCommit: options.autoCommit !== false,
        partitionsConsumedConcurrently: 3,
        eachMessage: async (payload: EachMessagePayload) => {
          try {
            const message = this.parseMessage(payload);
            await handler(message);
          } catch (error) {
            this.logger.error(`Error processing message from topic ${topic}:`, error);
            throw error;
          }
        }
      });

      this.consumers.set(`${groupId}-${topic}`, consumer);
      this.logger.info(`Subscribed to topic ${topic} with group ${groupId}`);
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic ${consumerHandler.topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish order events
   */
  async publishOrderEvent(
    eventType: 'created' | 'updated' | 'cancelled' | 'completed',
    orderId: string,
    orderData: any,
    userId?: string,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `order.${eventType}`,
      source: 'order-service',
      data: {
        orderId,
        ...orderData
      },
      userId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Publish product events
   */
  async publishProductEvent(
    eventType: 'created' | 'updated' | 'deleted' | 'stock_updated',
    productId: string,
    productData: any,
    userId?: string,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `product.${eventType}`,
      source: 'product-service',
      data: {
        productId,
        ...productData
      },
      userId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Publish RFQ events
   */
  async publishRFQEvent(
    eventType: 'created' | 'updated' | 'closed' | 'proposal_received',
    rfqId: string,
    rfqData: any,
    userId?: string,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `rfq.${eventType}`,
      source: 'rfq-service',
      data: {
        rfqId,
        ...rfqData
      },
      userId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Publish user activity events
   */
  async publishUserActivity(
    activityType: string,
    userId: string,
    activityData: any,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `user.${activityType}`,
      source: 'user-service',
      data: {
        userId,
        activity: activityType,
        ...activityData
      },
      userId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Publish analytics events
   */
  async publishAnalyticsEvent(
    eventType: string,
    data: any,
    userId?: string,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `analytics.${eventType}`,
      source: 'analytics-service',
      data,
      userId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Publish notification events
   */
  async publishNotificationEvent(
    notificationType: string,
    recipientId: string,
    notificationData: any,
    companyId?: string
  ): Promise<void> {
    await this.publishEvent({
      type: `notification.${notificationType}`,
      source: 'notification-service',
      data: {
        recipientId,
        ...notificationData
      },
      userId: recipientId,
      companyId,
      correlationId: this.generateCorrelationId()
    });
  }

  /**
   * Create topic if it doesn't exist
   */
  async createTopic(
    topicName: string,
    partitions: number = 3,
    replicationFactor: number = 1
  ): Promise<void> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();
      if (!topics.includes(topicName)) {
        await admin.createTopics({
          topics: [{
            topic: topicName,
            numPartitions: partitions,
            replicationFactor,
            configEntries: [
              { name: 'cleanup.policy', value: 'delete' },
              { name: 'retention.ms', value: '604800000' }, // 7 days
              { name: 'segment.ms', value: '86400000' } // 1 day
            ]
          }]
        });
        this.logger.info(`Created topic: ${topicName}`);
      }

      await admin.disconnect();
    } catch (error) {
      this.logger.error(`Failed to create topic ${topicName}:`, error);
      throw error;
    }
  }

  /**
   * Get topic health information
   */
  async getTopicHealth(topicName: string): Promise<{
    exists: boolean;
    partitions: number;
    consumers: number;
    lag: number;
  }> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();
      const exists = topics.includes(topicName);

      if (!exists) {
        await admin.disconnect();
        return { exists: false, partitions: 0, consumers: 0, lag: 0 };
      }

      const metadata = await admin.fetchTopicMetadata({ topics: [topicName] });
      const partitions = metadata.topics[0]?.partitions?.length || 0;

      const groups = await admin.listGroups();
      const consumers = groups.groups.filter(g =>
        g.groupId.includes(topicName) ||
        g.protocolType === 'consumer'
      ).length;

      await admin.disconnect();

      return {
        exists,
        partitions,
        consumers,
        lag: 0 // Would need consumer group details for actual lag
      };
    } catch (error) {
      this.logger.error(`Failed to get topic health for ${topicName}:`, error);
      return { exists: false, partitions: 0, consumers: 0, lag: 0 };
    }
  }

  /**
   * Get service health
   */
  async getHealth(): Promise<{
    connected: boolean;
    topics: string[];
    producers: number;
    consumers: number;
    lastError?: string;
  }> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = await admin.listTopics();
      await admin.disconnect();

      return {
        connected: this.isConnected,
        topics,
        producers: this.producer ? 1 : 0,
        consumers: this.consumers.size
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        connected: false,
        topics: [],
        producers: 0,
        consumers: 0,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Disconnect all consumers and producer
   */
  async disconnect(): Promise<void> {
    try {
      // Disconnect all consumers
      for (const [key, consumer] of this.consumers) {
        await consumer.disconnect();
        this.logger.info(`Disconnected consumer: ${key}`);
      }
      this.consumers.clear();

      // Disconnect producer
      if (this.producer) {
        await this.producer.disconnect();
        this.producer = null;
        this.logger.info('Disconnected producer');
      }

      this.isConnected = false;
      this.logger.info('Kafka service disconnected');
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
      throw error;
    }
  }

  // Private methods

  private async addToBatch(message: KafkaMessage): Promise<void> {
    const { topic } = message;

    if (!this.messageBuffer.has(topic)) {
      this.messageBuffer.set(topic, []);
    }

    this.messageBuffer.get(topic).push(message);

    if (this.messageBuffer.get(topic).length >= this.BATCH_SIZE) {
      await this.flushBatch(topic);
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushAllBatches();
      }, this.BATCH_TIMEOUT);
    }
  }

  private async flushBatch(topic: string): Promise<void> {
    const messages = this.messageBuffer.get(topic);
    if (!messages || messages.length === 0) return;

    try {
      await this.producer.sendBatch({
        topicMessages: [{
          topic,
          messages: messages.map(msg => ({
            key: msg.key,
            value: msg.value,
            headers: msg.headers,
            timestamp: msg.timestamp?.getTime().toString()
          }))
        }]
      });

      this.messageBuffer.set(topic, []);
      this.logger.debug(`Flushed batch of ${messages.length} messages to topic ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to flush batch to topic ${topic}:`, error);
      throw error;
    }
  }

  private async flushAllBatches(): Promise<void> {
    for (const topic of this.messageBuffer.keys()) {
      await this.flushBatch(topic);
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private async sendMessage(message: KafkaMessage): Promise<void> {
    try {
      await this.producer.send({
        topic: message.topic,
        messages: [{
          partition: message.partition,
          key: message.key,
          value: message.value,
          headers: message.headers,
          timestamp: message.timestamp?.getTime().toString()
        }]
      });

      this.logger.debug(`Message sent to topic ${message.topic}`);
    } catch (error) {
      this.logger.error(`Failed to send message to topic ${message.topic}:`, error);
      throw error;
    }
  }

  private parseMessage(payload: EachMessagePayload): StreamEvent {
    try {
      const value = payload.message.value?.toString();
      if (!value) {
        throw new Error('Message value is empty');
      }

      const event = JSON.parse(value) as StreamEvent;
      return {
        ...event,
        timestamp: new Date(event.timestamp)
      };
    } catch (error) {
      this.logger.error('Failed to parse message:', error);
      throw error;
    }
  }

  private getTopicForEventType(eventType: string): string {
    const topicMapping: Record<string, string> = {
      'order.created': 'orders',
      'order.updated': 'orders',
      'order.cancelled': 'orders',
      'order.completed': 'orders',
      'product.created': 'products',
      'product.updated': 'products',
      'product.deleted': 'products',
      'product.stock_updated': 'products',
      'rfq.created': 'rfqs',
      'rfq.updated': 'rfqs',
      'rfq.closed': 'rfqs',
      'rfq.proposal_received': 'rfqs',
      'user.login': 'user-activity',
      'user.logout': 'user-activity',
      'user.profile_updated': 'user-activity',
      'analytics.page_view': 'analytics',
      'analytics.conversion': 'analytics',
      'analytics.user_journey': 'analytics',
      'notification.email': 'notifications',
      'notification.push': 'notifications',
      'notification.sms': 'notifications'
    };

    return topicMapping[eventType] || 'general-events';
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const kafkaService = new KafkaService();
