import { Router } from 'express';
import { body, param } from 'express-validator';

import { cacheController } from '../controllers/CacheController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Rate limiting for cache operations
const cacheRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many cache requests. Please try again later.'
});

// Validation rules
const invalidateKeyValidation = [
  param('key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Key must be between 1 and 500 characters')
];

const invalidateTagsValidation = [
  body('tags')
    .isArray({ min: 1, max: 20 })
    .withMessage('Tags must be an array with 1-20 items'),

  body('tags.*')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each tag must be between 1 and 100 characters')
];

const invalidatePatternValidation = [
  body('pattern')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Pattern must be between 1 and 200 characters')
    .matches(/^[a-zA-Z0-9:*_-]+$/)
    .withMessage('Pattern contains invalid characters')
];

const clearCacheValidation = [
  body('confirm')
    .equals('CLEAR_ALL_CACHE')
    .withMessage('Confirmation must be exactly "CLEAR_ALL_CACHE"')
];

const warmCacheValidation = [
  body('patterns')
    .isArray({ min: 1, max: 50 })
    .withMessage('Patterns must be an array with 1-50 items'),

  body('patterns.*.name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Pattern name must be between 1 and 100 characters'),

  body('patterns.*.key')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Pattern key must be between 1 and 500 characters'),

  body('patterns.*.ttl')
    .optional()
    .isInt({ min: 1, max: 86400 })
    .withMessage('TTL must be between 1 and 86400 seconds'),

  body('patterns.*.tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Pattern tags must be an array with max 10 items')
];

// Routes

/**
 * @route   GET /api/cache/stats
 * @desc    Get cache statistics
 * @access  Admin
 */
router.get('/stats',
  cacheRateLimit,
  cacheController.getStats
);

/**
 * @route   GET /api/cache/health
 * @desc    Get cache health status
 * @access  Admin
 */
router.get('/health',
  cacheController.getHealth
);

/**
 * @route   GET /api/cache/config
 * @desc    Get cache configuration
 * @access  Admin
 */
router.get('/config',
  cacheRateLimit,
  cacheController.getConfig
);

/**
 * @route   GET /api/cache/key/:key
 * @desc    Check if cache key exists
 * @access  Admin
 */
router.get('/key/:key',
  cacheRateLimit,
  validateRequest(invalidateKeyValidation),
  cacheController.checkKey
);

/**
 * @route   DELETE /api/cache/key/:key
 * @desc    Invalidate specific cache key
 * @access  Admin
 */
router.delete('/key/:key',
  cacheRateLimit,
  validateRequest(invalidateKeyValidation),
  cacheController.invalidateKey
);

/**
 * @route   POST /api/cache/invalidate/tags
 * @desc    Invalidate cache by tags
 * @access  Admin
 */
router.post('/invalidate/tags',
  cacheRateLimit,
  validateRequest(invalidateTagsValidation),
  cacheController.invalidateByTags
);

/**
 * @route   POST /api/cache/invalidate/pattern
 * @desc    Invalidate cache by pattern
 * @access  Admin
 */
router.post('/invalidate/pattern',
  cacheRateLimit,
  validateRequest(invalidatePatternValidation),
  cacheController.invalidateByPattern
);

/**
 * @route   POST /api/cache/clear
 * @desc    Clear entire cache (DANGEROUS)
 * @access  Admin
 */
router.post('/clear',
  cacheRateLimit,
  validateRequest(clearCacheValidation),
  cacheController.clearCache
);

/**
 * @route   POST /api/cache/warm
 * @desc    Warm cache with predefined patterns
 * @access  Admin
 */
router.post('/warm',
  cacheRateLimit,
  validateRequest(warmCacheValidation),
  cacheController.warmCache
);

export default router;
