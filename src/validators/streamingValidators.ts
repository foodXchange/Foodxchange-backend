import { body, param, query } from 'express-validator';

export const streamingValidationRules = {
  topicName: [
    param('topicName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Topic name must be 1-100 characters and contain only letters, numbers, underscores, and hyphens')
  ],

  createTopic: [
    param('topicName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Topic name must be 1-100 characters and contain only letters, numbers, underscores, and hyphens'),

    body('partitions')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Partitions must be between 1 and 50'),

    body('replicationFactor')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Replication factor must be between 1 and 10')
  ],

  publishEvent: [
    body('eventType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Event type must be between 1 and 100 characters'),

    body('source')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Source must be between 1 and 100 characters'),

    body('data')
      .isObject()
      .withMessage('Data must be an object'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishOrderEvent: [
    param('orderId')
      .isMongoId()
      .withMessage('Order ID must be a valid MongoDB ObjectId'),

    body('eventType')
      .isIn(['created', 'updated', 'cancelled', 'completed'])
      .withMessage('Event type must be one of: created, updated, cancelled, completed'),

    body('orderData')
      .isObject()
      .withMessage('Order data must be an object'),

    body('orderData.status')
      .optional()
      .isString()
      .withMessage('Order status must be a string'),

    body('orderData.totalAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Total amount must be a non-negative number'),

    body('orderData.items')
      .optional()
      .isArray()
      .withMessage('Order items must be an array'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishProductEvent: [
    param('productId')
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),

    body('eventType')
      .isIn(['created', 'updated', 'deleted', 'stock_updated'])
      .withMessage('Event type must be one of: created, updated, deleted, stock_updated'),

    body('productData')
      .isObject()
      .withMessage('Product data must be an object'),

    body('productData.name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Product name must be between 1 and 200 characters'),

    body('productData.category')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Product category must be between 1 and 100 characters'),

    body('productData.price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Product price must be a non-negative number'),

    body('productData.stock')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Product stock must be a non-negative integer'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishRFQEvent: [
    param('rfqId')
      .isMongoId()
      .withMessage('RFQ ID must be a valid MongoDB ObjectId'),

    body('eventType')
      .isIn(['created', 'updated', 'closed', 'proposal_received'])
      .withMessage('Event type must be one of: created, updated, closed, proposal_received'),

    body('rfqData')
      .isObject()
      .withMessage('RFQ data must be an object'),

    body('rfqData.title')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('RFQ title must be between 1 and 200 characters'),

    body('rfqData.status')
      .optional()
      .isString()
      .withMessage('RFQ status must be a string'),

    body('rfqData.deadline')
      .optional()
      .isISO8601()
      .withMessage('RFQ deadline must be a valid ISO date'),

    body('rfqData.budget')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('RFQ budget must be a non-negative number'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishUserActivity: [
    body('activityType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Activity type must be between 1 and 100 characters'),

    body('activityData')
      .isObject()
      .withMessage('Activity data must be an object'),

    body('activityData.action')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Action must be between 1 and 100 characters'),

    body('activityData.resource')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Resource must be between 1 and 100 characters'),

    body('activityData.resourceId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Resource ID must be between 1 and 100 characters'),

    body('activityData.userAgent')
      .optional()
      .isString()
      .withMessage('User agent must be a string'),

    body('activityData.ipAddress')
      .optional()
      .isIP()
      .withMessage('IP address must be a valid IP'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishAnalyticsEvent: [
    body('eventType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Event type must be between 1 and 100 characters'),

    body('data')
      .isObject()
      .withMessage('Data must be an object'),

    body('data.event')
      .optional()
      .isString()
      .withMessage('Event must be a string'),

    body('data.page')
      .optional()
      .isString()
      .withMessage('Page must be a string'),

    body('data.duration')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Duration must be a non-negative number'),

    body('data.value')
      .optional()
      .isNumeric()
      .withMessage('Value must be a number'),

    body('data.properties')
      .optional()
      .isObject()
      .withMessage('Properties must be an object'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  publishNotificationEvent: [
    body('notificationType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Notification type must be between 1 and 100 characters'),

    body('recipientId')
      .isMongoId()
      .withMessage('Recipient ID must be a valid MongoDB ObjectId'),

    body('notificationData')
      .isObject()
      .withMessage('Notification data must be an object'),

    body('notificationData.title')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Notification title must be between 1 and 200 characters'),

    body('notificationData.message')
      .isString()
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Notification message must be between 1 and 1000 characters'),

    body('notificationData.priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),

    body('notificationData.channel')
      .optional()
      .isIn(['email', 'push', 'sms', 'in_app'])
      .withMessage('Channel must be one of: email, push, sms, in_app'),

    body('notificationData.scheduledFor')
      .optional()
      .isISO8601()
      .withMessage('Scheduled time must be a valid ISO date'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object')
  ],

  // Advanced validation rules
  batchEventPublish: [
    body('events')
      .isArray({ min: 1, max: 100 })
      .withMessage('Events must be an array with 1-100 items'),

    body('events.*.eventType')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each event type must be between 1 and 100 characters'),

    body('events.*.source')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each source must be between 1 and 100 characters'),

    body('events.*.data')
      .isObject()
      .withMessage('Each data field must be an object'),

    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object'),

    body('options.batch')
      .optional()
      .isBoolean()
      .withMessage('Batch option must be a boolean'),

    body('options.compression')
      .optional()
      .isIn(['gzip', 'snappy', 'lz4', 'zstd'])
      .withMessage('Compression must be one of: gzip, snappy, lz4, zstd')
  ],

  eventFilter: [
    query('eventTypes')
      .optional()
      .isString()
      .withMessage('Event types must be a comma-separated string'),

    query('sources')
      .optional()
      .isString()
      .withMessage('Sources must be a comma-separated string'),

    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO date'),

    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
      .custom((endDate, { req }) => {
        const {startDate} = req.query;
        if (startDate && new Date(endDate) <= new Date(startDate as string)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],

  streamingConfig: [
    body('config')
      .isObject()
      .withMessage('Configuration must be an object'),

    body('config.batchSize')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Batch size must be between 1 and 1000'),

    body('config.batchTimeout')
      .optional()
      .isInt({ min: 100, max: 60000 })
      .withMessage('Batch timeout must be between 100ms and 60 seconds'),

    body('config.retries')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('Retries must be between 0 and 10'),

    body('config.compression')
      .optional()
      .isIn(['gzip', 'snappy', 'lz4', 'zstd'])
      .withMessage('Compression must be one of: gzip, snappy, lz4, zstd'),

    body('config.partitioning')
      .optional()
      .isObject()
      .withMessage('Partitioning config must be an object'),

    body('config.partitioning.strategy')
      .optional()
      .isIn(['round_robin', 'hash', 'sticky'])
      .withMessage('Partitioning strategy must be one of: round_robin, hash, sticky'),

    body('config.partitioning.key')
      .optional()
      .isString()
      .withMessage('Partitioning key must be a string')
  ]
};

// Composite validation rules for complex operations
export const compositeStreamingValidationRules = {
  fullEventPublish: [
    ...streamingValidationRules.publishEvent,
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),

    body('retentionPolicy')
      .optional()
      .isObject()
      .withMessage('Retention policy must be an object'),

    body('retentionPolicy.duration')
      .optional()
      .isInt({ min: 3600, max: 31536000 }) // 1 hour to 1 year
      .withMessage('Retention duration must be between 1 hour and 1 year (in seconds)')
  ],

  streamAnalytics: [
    query('timeframe')
      .optional()
      .isIn(['1h', '6h', '24h', '7d', '30d'])
      .withMessage('Timeframe must be one of: 1h, 6h, 24h, 7d, 30d'),

    query('metrics')
      .optional()
      .isString()
      .withMessage('Metrics must be a comma-separated string'),

    query('groupBy')
      .optional()
      .isIn(['topic', 'eventType', 'source', 'hour', 'day'])
      .withMessage('Group by must be one of: topic, eventType, source, hour, day')
  ]
};
