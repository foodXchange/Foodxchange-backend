import { Router } from 'express';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { rateLimitingService } from '../../../services/security/RateLimitingService';
import { Logger } from '../../../core/logging/logger';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../../../middleware/validateRequest';

const router = Router();
const logger = new Logger('RateLimitingRoutes');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @route   GET /api/v1/rate-limiting/stats
 * @desc    Get rate limiting statistics
 * @access  Admin
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    const stats = await rateLimitingService.getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route   POST /api/v1/rate-limiting/whitelist
 * @desc    Add key to whitelist
 * @access  Admin
 */
router.post('/whitelist',
  validateRequest([
    body('key').notEmpty().withMessage('Key is required'),
    body('duration').optional().isInt({ min: 0 }).withMessage('Duration must be positive integer')
  ]),
  asyncHandler(async (req, res) => {
    const { key, duration } = req.body;
    
    await rateLimitingService.addToWhitelist(key, duration);
    
    logger.info(`Added ${key} to whitelist`, { duration, adminId: (req as any).user.id });
    
    res.json({
      success: true,
      message: `Key ${key} added to whitelist`,
      duration: duration ? `${duration} seconds` : 'permanent'
    });
  })
);

/**
 * @route   DELETE /api/v1/rate-limiting/whitelist/:key
 * @desc    Remove key from whitelist
 * @access  Admin
 */
router.delete('/whitelist/:key',
  validateRequest([
    param('key').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    
    await rateLimitingService.resetLimit(`whitelist:${key}`);
    
    logger.info(`Removed ${key} from whitelist`, { adminId: (req as any).user.id });
    
    res.json({
      success: true,
      message: `Key ${key} removed from whitelist`
    });
  })
);

/**
 * @route   POST /api/v1/rate-limiting/blacklist
 * @desc    Add key to blacklist
 * @access  Admin
 */
router.post('/blacklist',
  validateRequest([
    body('key').notEmpty().withMessage('Key is required'),
    body('reason').notEmpty().withMessage('Reason is required'),
    body('duration').optional().isInt({ min: 0 }).withMessage('Duration must be positive integer')
  ]),
  asyncHandler(async (req, res) => {
    const { key, reason, duration } = req.body;
    
    await rateLimitingService.addToBlacklist(key, reason, duration);
    
    logger.warn(`Added ${key} to blacklist`, { reason, duration, adminId: (req as any).user.id });
    
    res.json({
      success: true,
      message: `Key ${key} added to blacklist`,
      reason,
      duration: duration ? `${duration} seconds` : 'permanent'
    });
  })
);

/**
 * @route   DELETE /api/v1/rate-limiting/blacklist/:key
 * @desc    Remove key from blacklist
 * @access  Admin
 */
router.delete('/blacklist/:key',
  validateRequest([
    param('key').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    
    await rateLimitingService.resetLimit(`blacklist:${key}`);
    
    logger.info(`Removed ${key} from blacklist`, { adminId: (req as any).user.id });
    
    res.json({
      success: true,
      message: `Key ${key} removed from blacklist`
    });
  })
);

/**
 * @route   POST /api/v1/rate-limiting/reset
 * @desc    Reset rate limits for a pattern
 * @access  Admin
 */
router.post('/reset',
  validateRequest([
    body('pattern').notEmpty().withMessage('Pattern is required')
  ]),
  asyncHandler(async (req, res) => {
    const { pattern } = req.body;
    
    const count = await rateLimitingService.resetLimit(pattern);
    
    logger.info(`Reset rate limits for pattern: ${pattern}`, { count, adminId: (req as any).user.id });
    
    res.json({
      success: true,
      message: `Reset ${count} rate limit keys`,
      pattern
    });
  })
);

/**
 * @route   GET /api/v1/rate-limiting/check/:key
 * @desc    Check current rate limit status for a key
 * @access  Admin
 */
router.get('/check/:key',
  validateRequest([
    param('key').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    
    // Check if whitelisted
    const isWhitelisted = await rateLimitingService.isWhitelisted(key);
    
    // Check if blacklisted
    const blacklistCheck = await rateLimitingService.isBlacklisted(key);
    
    // Check current limits
    const limits = await rateLimitingService.checkRateLimit(key, {
      windowMs: 60000,
      maxRequests: 100
    });
    
    res.json({
      success: true,
      data: {
        key,
        whitelisted: isWhitelisted,
        blacklisted: blacklistCheck.blocked,
        blacklistReason: blacklistCheck.reason,
        currentUsage: limits.info
      }
    });
  })
);

/**
 * @route   GET /api/v1/rate-limiting/tiers
 * @desc    Get available rate limiting tiers
 * @access  Admin
 */
router.get('/tiers',
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        tiers: [
          {
            name: 'free',
            limits: {
              perSecond: 2,
              perMinute: 60,
              perHour: 1000,
              perDay: 10000
            },
            burst: 5,
            cost: 0
          },
          {
            name: 'basic',
            limits: {
              perSecond: 10,
              perMinute: 300,
              perHour: 5000,
              perDay: 50000
            },
            burst: 20,
            cost: 29
          },
          {
            name: 'premium',
            limits: {
              perSecond: 50,
              perMinute: 1000,
              perHour: 20000,
              perDay: 200000
            },
            burst: 100,
            cost: 99
          },
          {
            name: 'enterprise',
            limits: {
              perSecond: 200,
              perMinute: 5000,
              perHour: 100000,
              perDay: 1000000
            },
            burst: 500,
            cost: 499
          }
        ]
      }
    });
  })
);

/**
 * @route   POST /api/v1/rate-limiting/simulate
 * @desc    Simulate rate limiting for testing
 * @access  Admin
 */
router.post('/simulate',
  validateRequest([
    body('key').notEmpty().withMessage('Key is required'),
    body('requests').isInt({ min: 1, max: 1000 }).withMessage('Requests must be between 1 and 1000'),
    body('windowMs').optional().isInt({ min: 1000 }).withMessage('Window must be at least 1000ms'),
    body('maxRequests').optional().isInt({ min: 1 }).withMessage('Max requests must be positive')
  ]),
  asyncHandler(async (req, res) => {
    const { key, requests, windowMs = 60000, maxRequests = 100 } = req.body;
    
    const results = [];
    let allowed = 0;
    let blocked = 0;
    
    // Simulate requests
    for (let i = 0; i < requests; i++) {
      const result = await rateLimitingService.checkRateLimit(`simulate:${key}`, {
        windowMs,
        maxRequests
      });
      
      if (result.allowed) {
        allowed++;
      } else {
        blocked++;
      }
      
      if (i < 10 || !result.allowed) {
        results.push({
          request: i + 1,
          allowed: result.allowed,
          remaining: result.info.remaining
        });
      }
    }
    
    // Clean up simulation keys
    await rateLimitingService.resetLimit(`simulate:${key}`);
    
    res.json({
      success: true,
      data: {
        totalRequests: requests,
        allowed,
        blocked,
        blockRate: ((blocked / requests) * 100).toFixed(2) + '%',
        config: { windowMs, maxRequests },
        sampleResults: results
      }
    });
  })
);

export default router;