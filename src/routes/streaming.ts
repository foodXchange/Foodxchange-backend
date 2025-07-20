import { Router } from 'express';

import { streamingController } from '../controllers/StreamingController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';
import { streamingValidationRules } from '../validators/streamingValidators';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Rate limiting for streaming operations
const streamingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many streaming requests. Please try again later.'
});

// Health and monitoring routes
router.get('/health', streamingController.getHealth);

router.get('/statistics', streamingController.getStatistics);

router.get('/topics/:topicName/info',
  validateRequest(streamingValidationRules.topicName),
  streamingController.getTopicInfo
);

// Topic management routes (admin only - should add admin middleware)
router.post('/topics/:topicName',
  streamingRateLimit,
  validateRequest(streamingValidationRules.createTopic),
  streamingController.createTopic
);

// Event publishing routes
router.post('/events',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishEvent),
  streamingController.publishEvent
);

router.post('/events/orders/:orderId',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishOrderEvent),
  streamingController.publishOrderEvent
);

router.post('/events/products/:productId',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishProductEvent),
  streamingController.publishProductEvent
);

router.post('/events/rfqs/:rfqId',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishRFQEvent),
  streamingController.publishRFQEvent
);

router.post('/events/user-activity',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishUserActivity),
  streamingController.publishUserActivity
);

router.post('/events/analytics',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishAnalyticsEvent),
  streamingController.publishAnalyticsEvent
);

router.post('/events/notifications',
  streamingRateLimit,
  validateRequest(streamingValidationRules.publishNotificationEvent),
  streamingController.publishNotificationEvent
);

export default router;
