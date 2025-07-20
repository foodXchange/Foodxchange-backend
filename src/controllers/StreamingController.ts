import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { kafkaService } from '../services/streaming/KafkaService';

interface StreamingRequest extends Request {
  user?: {
    id: string;
    companyId: string;
  };
}

class StreamingController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('StreamingController');
  }

  /**
   * Get streaming service health
   */
  async getHealth(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const health = await kafkaService.getHealth();

      res.json({
        success: true,
        data: {
          service: 'Event Streaming',
          status: health.connected ? 'healthy' : 'unhealthy',
          ...health,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get streaming health:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: 'Failed to check streaming service health'
        }
      });
    }
  }

  /**
   * Get topic information
   */
  async getTopicInfo(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { topicName } = req.params;

      if (!topicName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TOPIC_NAME',
            message: 'Topic name is required'
          }
        });
      }

      const topicHealth = await kafkaService.getTopicHealth(topicName);

      res.json({
        success: true,
        data: {
          topic: topicName,
          ...topicHealth,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get topic info:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOPIC_INFO_FAILED',
          message: 'Failed to retrieve topic information'
        }
      });
    }
  }

  /**
   * Create a new topic
   */
  async createTopic(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { topicName } = req.params;
      const { partitions = 3, replicationFactor = 1 } = req.body;

      if (!topicName) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TOPIC_NAME',
            message: 'Topic name is required'
          }
        });
      }

      await kafkaService.createTopic(topicName, partitions, replicationFactor);

      res.status(201).json({
        success: true,
        data: {
          topic: topicName,
          partitions,
          replicationFactor,
          created: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to create topic:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TOPIC_CREATION_FAILED',
          message: 'Failed to create topic'
        }
      });
    }
  }

  /**
   * Publish a custom event
   */
  async publishEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { eventType, source, data } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!eventType || !source || !data) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'eventType, source, and data are required'
          }
        });
      }

      await kafkaService.publishEvent({
        type: eventType,
        source,
        data,
        userId,
        companyId
      });

      res.status(202).json({
        success: true,
        data: {
          message: 'Event published successfully',
          eventType,
          source,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENT_PUBLISH_FAILED',
          message: 'Failed to publish event'
        }
      });
    }
  }

  /**
   * Publish order event
   */
  async publishOrderEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { orderId } = req.params;
      const { eventType, orderData } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!orderId || !eventType || !orderData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'orderId, eventType, and orderData are required'
          }
        });
      }

      const validEventTypes = ['created', 'updated', 'cancelled', 'completed'];
      if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EVENT_TYPE',
            message: `Event type must be one of: ${validEventTypes.join(', ')}`
          }
        });
      }

      await kafkaService.publishOrderEvent(
        eventType,
        orderId,
        orderData,
        userId,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Order event published successfully',
          orderId,
          eventType,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish order event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ORDER_EVENT_PUBLISH_FAILED',
          message: 'Failed to publish order event'
        }
      });
    }
  }

  /**
   * Publish product event
   */
  async publishProductEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      const { eventType, productData } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!productId || !eventType || !productData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'productId, eventType, and productData are required'
          }
        });
      }

      const validEventTypes = ['created', 'updated', 'deleted', 'stock_updated'];
      if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EVENT_TYPE',
            message: `Event type must be one of: ${validEventTypes.join(', ')}`
          }
        });
      }

      await kafkaService.publishProductEvent(
        eventType,
        productId,
        productData,
        userId,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Product event published successfully',
          productId,
          eventType,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish product event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PRODUCT_EVENT_PUBLISH_FAILED',
          message: 'Failed to publish product event'
        }
      });
    }
  }

  /**
   * Publish RFQ event
   */
  async publishRFQEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { rfqId } = req.params;
      const { eventType, rfqData } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!rfqId || !eventType || !rfqData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'rfqId, eventType, and rfqData are required'
          }
        });
      }

      const validEventTypes = ['created', 'updated', 'closed', 'proposal_received'];
      if (!validEventTypes.includes(eventType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EVENT_TYPE',
            message: `Event type must be one of: ${validEventTypes.join(', ')}`
          }
        });
      }

      await kafkaService.publishRFQEvent(
        eventType,
        rfqId,
        rfqData,
        userId,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'RFQ event published successfully',
          rfqId,
          eventType,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish RFQ event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RFQ_EVENT_PUBLISH_FAILED',
          message: 'Failed to publish RFQ event'
        }
      });
    }
  }

  /**
   * Publish user activity event
   */
  async publishUserActivity(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { activityType, activityData } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!activityType || !activityData || !userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'activityType, activityData, and authenticated user are required'
          }
        });
      }

      await kafkaService.publishUserActivity(
        activityType,
        userId,
        activityData,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'User activity published successfully',
          activityType,
          userId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish user activity:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'USER_ACTIVITY_PUBLISH_FAILED',
          message: 'Failed to publish user activity'
        }
      });
    }
  }

  /**
   * Publish analytics event
   */
  async publishAnalyticsEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { eventType, data } = req.body;
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!eventType || !data) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'eventType and data are required'
          }
        });
      }

      await kafkaService.publishAnalyticsEvent(
        eventType,
        data,
        userId,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Analytics event published successfully',
          eventType,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish analytics event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ANALYTICS_EVENT_PUBLISH_FAILED',
          message: 'Failed to publish analytics event'
        }
      });
    }
  }

  /**
   * Publish notification event
   */
  async publishNotificationEvent(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const { notificationType, recipientId, notificationData } = req.body;
      const companyId = req.user?.companyId;

      if (!notificationType || !recipientId || !notificationData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'notificationType, recipientId, and notificationData are required'
          }
        });
      }

      await kafkaService.publishNotificationEvent(
        notificationType,
        recipientId,
        notificationData,
        companyId
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Notification event published successfully',
          notificationType,
          recipientId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to publish notification event:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'NOTIFICATION_EVENT_PUBLISH_FAILED',
          message: 'Failed to publish notification event'
        }
      });
    }
  }

  /**
   * Get streaming statistics
   */
  async getStatistics(req: StreamingRequest, res: Response): Promise<void> {
    try {
      const health = await kafkaService.getHealth();

      // Get basic statistics
      const statistics = {
        totalTopics: health.topics.length,
        activeConsumers: health.consumers,
        activeProducers: health.producers,
        connectionStatus: health.connected ? 'connected' : 'disconnected',
        topicsList: health.topics,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      this.logger.error('Failed to get streaming statistics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATISTICS_FAILED',
          message: 'Failed to retrieve streaming statistics'
        }
      });
    }
  }
}

export const streamingController = new StreamingController();
