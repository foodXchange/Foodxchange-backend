import { Logger } from '../../core/logging/logger';

import { eventConsumerService } from './EventConsumerService';
import { kafkaService } from './KafkaService';

export class StreamingInitializationService {
  private readonly logger: Logger;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('StreamingInitializationService');
  }

  /**
   * Initialize the complete streaming infrastructure
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing streaming infrastructure...');

      // 1. Initialize Kafka service
      await kafkaService.initialize();
      this.logger.info('✅ Kafka service initialized');

      // 2. Create required topics
      await this.createRequiredTopics();
      this.logger.info('✅ Required topics created');

      // 3. Initialize event consumers
      await eventConsumerService.initialize();
      this.logger.info('✅ Event consumers initialized');

      this.isInitialized = true;
      this.logger.info('🚀 Streaming infrastructure initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize streaming infrastructure:', error);
      throw error;
    }
  }

  /**
   * Create all required Kafka topics
   */
  private async createRequiredTopics(): Promise<void> {
    const topics = [
      { name: 'orders', partitions: 3, replicationFactor: 1 },
      { name: 'products', partitions: 3, replicationFactor: 1 },
      { name: 'rfqs', partitions: 3, replicationFactor: 1 },
      { name: 'user-activity', partitions: 5, replicationFactor: 1 },
      { name: 'analytics', partitions: 5, replicationFactor: 1 },
      { name: 'notifications', partitions: 3, replicationFactor: 1 },
      { name: 'general-events', partitions: 2, replicationFactor: 1 }
    ];

    for (const topic of topics) {
      try {
        await kafkaService.createTopic(topic.name, topic.partitions, topic.replicationFactor);
        this.logger.debug(`Topic created: ${topic.name}`);
      } catch (error) {
        this.logger.warn(`Failed to create topic ${topic.name}:`, error);
        // Continue with other topics even if one fails
      }
    }
  }

  /**
   * Get initialization status
   */
  isStreamingInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Gracefully shutdown streaming services
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down streaming infrastructure...');

      await kafkaService.disconnect();
      this.isInitialized = false;

      this.logger.info('✅ Streaming infrastructure shutdown complete');
    } catch (error) {
      this.logger.error('❌ Error during streaming shutdown:', error);
      throw error;
    }
  }
}

// Singleton instance
export const streamingInitializationService = new StreamingInitializationService();
