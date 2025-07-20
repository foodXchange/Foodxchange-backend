import { Router } from 'express';

import { rateLimitingController } from '../controllers/RateLimitingController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';
import { rateLimitingValidationRules } from '../validators/rateLimitingValidators';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Rate limiting for admin operations
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute for admin operations
  message: 'Too many admin requests. Please try again later.'
});

// Rule management routes
router.get('/rules',
  adminRateLimit,
  rateLimitingController.getRules
);

router.get('/rules/:ruleId',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.ruleId),
  rateLimitingController.getRule
);

router.post('/rules',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.createRule),
  rateLimitingController.createRule
);

router.put('/rules/:ruleId',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.updateRule),
  rateLimitingController.updateRule
);

router.delete('/rules/:ruleId',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.ruleId),
  rateLimitingController.deleteRule
);

// IP management routes
router.post('/whitelist/:ipAddress',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.ipAddress),
  rateLimitingController.whitelistIP
);

router.post('/blacklist/:ipAddress',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.blacklistIP),
  rateLimitingController.blacklistIP
);

router.get('/ip-status/:ipAddress',
  validateRequest(rateLimitingValidationRules.ipAddress),
  rateLimitingController.checkIPStatus
);

// Quota and management routes
router.get('/quota/:ruleId',
  validateRequest(rateLimitingValidationRules.getQuota),
  rateLimitingController.getQuota
);

router.post('/reset/:key',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.resetKey),
  rateLimitingController.resetRateLimit
);

// Statistics and monitoring routes
router.get('/statistics',
  validateRequest(rateLimitingValidationRules.statistics),
  rateLimitingController.getStatistics
);

router.get('/system-load',
  rateLimitingController.getSystemLoad
);

router.get('/configuration',
  rateLimitingController.getConfiguration
);

// Testing and utilities routes
router.post('/test',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.testRateLimit),
  rateLimitingController.testRateLimit
);

// Bulk operations
router.post('/bulk',
  adminRateLimit,
  validateRequest(rateLimitingValidationRules.bulkOperations),
  rateLimitingController.bulkOperations
);

export default router;
