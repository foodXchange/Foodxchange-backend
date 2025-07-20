import { Router } from 'express';

import { abTestingController } from '../controllers/ABTestingController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';
import { abTestingValidationRules } from '../validators/abTestingValidators';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Rate limiting for A/B testing operations
const abTestingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 requests per minute
  message: 'Too many A/B testing requests. Please try again later.'
});

// Test management routes
router.post('/',
  abTestingRateLimit,
  validateRequest(abTestingValidationRules.createTest),
  abTestingController.createTest
);

router.get('/company',
  abTestingController.getCompanyTests
);

router.get('/:testId',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.getTest
);

router.delete('/:testId',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.deleteTest
);

// Test lifecycle routes
router.post('/:testId/start',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.startTest
);

router.post('/:testId/pause',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.pauseTest
);

router.post('/:testId/complete',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.completeTest
);

// User assignment routes
router.post('/:testId/assign',
  validateRequest(abTestingValidationRules.assignUser),
  abTestingController.assignUserToTest
);

router.get('/:testId/variant',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.getUserVariant
);

// Event tracking routes
router.post('/:testId/events',
  abTestingRateLimit,
  validateRequest(abTestingValidationRules.recordEvent),
  abTestingController.recordEvent
);

router.post('/:testId/conversions',
  abTestingRateLimit,
  validateRequest(abTestingValidationRules.recordConversion),
  abTestingController.recordConversion
);

router.post('/:testId/revenue',
  abTestingRateLimit,
  validateRequest(abTestingValidationRules.recordRevenue),
  abTestingController.recordRevenue
);

// Analytics and reporting routes
router.get('/:testId/analysis',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.getTestAnalysis
);

router.get('/:testId/statistics',
  validateRequest(abTestingValidationRules.testId),
  abTestingController.getTestStatistics
);

export default router;
