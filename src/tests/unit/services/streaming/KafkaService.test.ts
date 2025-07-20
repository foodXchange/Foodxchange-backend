import { KafkaService } from '../../../../services/streaming/KafkaService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';

// Mock dependencies
jest.mock('kafkajs', () => {
  const mockProducer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue([]),
    sendBatch: jest.fn().mockResolvedValue([])
  };

  const mockConsumer = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined)
  };

  const mockAdmin = {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    listTopics: jest.fn().mockResolvedValue(['orders', 'products', 'rfqs']),
    createTopics: jest.fn().mockResolvedValue(undefined),
    fetchTopicMetadata: jest.fn().mockResolvedValue({
      topics: [{ partitions: [{ partitionId: 0 }, { partitionId: 1 }, { partitionId: 2 }] }]
    }),
    listGroups: jest.fn().mockResolvedValue({
      groups: [
        { groupId: 'order-processors', protocolType: 'consumer' },
        { groupId: 'product-processors', protocolType: 'consumer' }
      ]
    })
  };

  const mockKafka = {
    producer: jest.fn().mockReturnValue(mockProducer),
    consumer: jest.fn().mockReturnValue(mockConsumer),
    admin: jest.fn().mockReturnValue(mockAdmin)
  };

  return {
    Kafka: jest.fn().mockImplementation(() => mockKafka)
  };
});

jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn(),
    set: jest.fn(),
    deletePattern: jest.fn()
  }
}));

jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('KafkaService', () => {
  let kafkaService: KafkaService;

  beforeEach(() => {
    kafkaService = new KafkaService();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await expect(kafkaService.initialize()).resolves.not.toThrow();
    });

    test('should handle initialization errors', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.producer().connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(kafkaService.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('message publishing', () => {
    beforeEach(async () => {
      await kafkaService.initialize();
    });

    test('should publish message to topic', async () => {
      const topic = 'test-topic';
      const message = { id: '123', data: 'test data' };

      await kafkaService.publishMessage(topic, message);

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic,
        messages: [{
          partition: undefined,
          key: undefined,
          value: JSON.stringify(message),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish batch messages', async () => {
      const topic = 'test-topic';
      const message = { id: '123', data: 'test data' };

      await kafkaService.publishMessage(topic, message, { batch: true });

      // Should not send immediately in batch mode
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).not.toHaveBeenCalled();
    });

    test('should handle publish errors', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.producer().send.mockRejectedValueOnce(new Error('Send failed'));

      await expect(
        kafkaService.publishMessage('test-topic', { data: 'test' })
      ).rejects.toThrow('Send failed');
    });
  });

  describe('event publishing', () => {
    beforeEach(async () => {
      await kafkaService.initialize();
    });

    test('should publish stream event', async () => {
      const event = {
        type: 'test.event',
        source: 'test-service',
        data: { test: 'data' }
      };

      await kafkaService.publishEvent(event);

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'general-events',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"test.event"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish order event', async () => {
      const orderId = 'order123';
      const orderData = { status: 'created', amount: 100 };

      await kafkaService.publishOrderEvent('created', orderId, orderData, 'user123', 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'orders',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"order.created"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish product event', async () => {
      const productId = 'product123';
      const productData = { name: 'Test Product', price: 50 };

      await kafkaService.publishProductEvent('updated', productId, productData, 'user123', 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'products',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"product.updated"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish RFQ event', async () => {
      const rfqId = 'rfq123';
      const rfqData = { title: 'Test RFQ', budget: 1000 };

      await kafkaService.publishRFQEvent('created', rfqId, rfqData, 'user123', 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'rfqs',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"rfq.created"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish user activity event', async () => {
      const activityData = { action: 'login', page: '/dashboard' };

      await kafkaService.publishUserActivity('login', 'user123', activityData, 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'user-activity',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"user.login"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish analytics event', async () => {
      const data = { event: 'page_view', page: '/products', duration: 30000 };

      await kafkaService.publishAnalyticsEvent('page_view', data, 'user123', 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'analytics',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"analytics.page_view"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });

    test('should publish notification event', async () => {
      const notificationData = { title: 'Test Notification', message: 'Test message' };

      await kafkaService.publishNotificationEvent('email', 'user123', notificationData, 'company123');

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().send).toHaveBeenCalledWith({
        topic: 'notifications',
        messages: [{
          partition: undefined,
          key: undefined,
          value: expect.stringContaining('"type":"notification.email"'),
          headers: undefined,
          timestamp: expect.any(String)
        }]
      });
    });
  });

  describe('consumer subscription', () => {
    beforeEach(async () => {
      await kafkaService.initialize();
    });

    test('should subscribe to topic with consumer', async () => {
      const consumerHandler = {
        topic: 'test-topic',
        groupId: 'test-group',
        handler: jest.fn()
      };

      await kafkaService.subscribe(consumerHandler);

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.consumer).toHaveBeenCalledWith({
        groupId: 'test-group',
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576,
        maxBytes: 10485760,
        allowAutoTopicCreation: false
      });
      expect(mockKafka.consumer().subscribe).toHaveBeenCalledWith({
        topic: 'test-topic',
        fromBeginning: false
      });
    });

    test('should handle subscription errors', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.consumer().connect.mockRejectedValueOnce(new Error('Connection failed'));

      const consumerHandler = {
        topic: 'test-topic',
        groupId: 'test-group',
        handler: jest.fn()
      };

      await expect(kafkaService.subscribe(consumerHandler)).rejects.toThrow('Connection failed');
    });
  });

  describe('topic management', () => {
    beforeEach(async () => {
      await kafkaService.initialize();
    });

    test('should create topic', async () => {
      const topicName = 'new-topic';
      const partitions = 5;
      const replicationFactor = 2;

      await kafkaService.createTopic(topicName, partitions, replicationFactor);

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.admin().createTopics).toHaveBeenCalledWith({
        topics: [{
          topic: topicName,
          numPartitions: partitions,
          replicationFactor,
          configEntries: [
            { name: 'cleanup.policy', value: 'delete' },
            { name: 'retention.ms', value: '604800000' },
            { name: 'segment.ms', value: '86400000' }
          ]
        }]
      });
    });

    test('should not create topic if it already exists', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.admin().listTopics.mockResolvedValueOnce(['existing-topic']);

      await kafkaService.createTopic('existing-topic');

      expect(mockKafka.admin().createTopics).not.toHaveBeenCalled();
    });

    test('should get topic health information', async () => {
      const topicName = 'test-topic';

      const health = await kafkaService.getTopicHealth(topicName);

      expect(health).toEqual({
        exists: true,
        partitions: 3,
        consumers: 2,
        lag: 0
      });
    });

    test('should return false for non-existent topic', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.admin().listTopics.mockResolvedValueOnce(['orders', 'products']);

      const health = await kafkaService.getTopicHealth('non-existent');

      expect(health.exists).toBe(false);
    });
  });

  describe('health monitoring', () => {
    test('should return health status', async () => {
      await kafkaService.initialize();

      const health = await kafkaService.getHealth();

      expect(health).toEqual({
        connected: true,
        topics: ['orders', 'products', 'rfqs'],
        producers: 1,
        consumers: 0
      });
    });

    test('should handle health check errors', async () => {
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.admin().connect.mockRejectedValueOnce(new Error('Health check failed'));

      const health = await kafkaService.getHealth();

      expect(health).toEqual({
        connected: false,
        topics: [],
        producers: 0,
        consumers: 0,
        lastError: 'Health check failed'
      });
    });
  });

  describe('disconnection', () => {
    test('should disconnect all consumers and producer', async () => {
      await kafkaService.initialize();

      // Add a mock consumer
      const consumerHandler = {
        topic: 'test-topic',
        groupId: 'test-group',
        handler: jest.fn()
      };
      await kafkaService.subscribe(consumerHandler);

      await kafkaService.disconnect();

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.consumer().disconnect).toHaveBeenCalled();
      expect(mockKafka.producer().disconnect).toHaveBeenCalled();
    });

    test('should handle disconnection errors', async () => {
      await kafkaService.initialize();

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      mockKafka.producer().disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      await expect(kafkaService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('error handling', () => {
    test('should handle service not initialized error', async () => {
      const uninitializedService = new KafkaService();

      await expect(
        uninitializedService.publishMessage('test-topic', { data: 'test' })
      ).rejects.toThrow('Kafka service not initialized');
    });

    test('should generate unique event IDs', async () => {
      await kafkaService.initialize();

      const event1 = {
        type: 'test.event',
        source: 'test-service',
        data: { test: 'data1' }
      };

      const event2 = {
        type: 'test.event',
        source: 'test-service',
        data: { test: 'data2' }
      };

      await kafkaService.publishEvent(event1);
      await kafkaService.publishEvent(event2);

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      const calls = mockKafka.producer().send.mock.calls;

      // Parse the message values to check if event IDs are different
      const message1 = JSON.parse(calls[0][0].messages[0].value);
      const message2 = JSON.parse(calls[1][0].messages[0].value);

      expect(message1.id).not.toBe(message2.id);
      expect(message1.correlationId).not.toBe(message2.correlationId);
    });
  });

  describe('batching', () => {
    beforeEach(async () => {
      await kafkaService.initialize();
    });

    test('should handle batch message accumulation', async () => {
      const topic = 'batch-topic';
      const messages = Array.from({ length: 5 }, (_, i) => ({ id: i, data: `test ${i}` }));

      // Send messages in batch mode
      for (const message of messages) {
        await kafkaService.publishMessage(topic, message, { batch: true });
      }

      // Batch should not be sent yet (under batch size threshold)
      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      expect(mockKafka.producer().sendBatch).not.toHaveBeenCalled();
    });
  });

  describe('topic mapping', () => {
    test('should map event types to correct topics', async () => {
      await kafkaService.initialize();

      // Test order event mapping
      await kafkaService.publishEvent({
        type: 'order.created',
        source: 'order-service',
        data: { orderId: '123' }
      });

      // Test product event mapping
      await kafkaService.publishEvent({
        type: 'product.updated',
        source: 'product-service',
        data: { productId: '456' }
      });

      // Test unknown event mapping
      await kafkaService.publishEvent({
        type: 'unknown.event',
        source: 'test-service',
        data: { test: 'data' }
      });

      const { Kafka } = require('kafkajs');
      const mockKafka = Kafka();
      const calls = mockKafka.producer().send.mock.calls;

      expect(calls[0][0].topic).toBe('orders');
      expect(calls[1][0].topic).toBe('products');
      expect(calls[2][0].topic).toBe('general-events');
    });
  });
});