import { Router } from 'express';
import { SearchController } from '../controllers/SearchController';
import { 
  authenticateToken,
  optionalAuth
} from '../middleware/auth.middleware';
import {
  sanitizeInput,
  preventSQLInjection,
  preventXSS,
  validationSchemas,
  handleValidationErrors,
  advancedRateLimit
} from '../middleware/security.middleware';

const router = Router();
const searchController = new SearchController();

// Rate limiting configurations
const searchRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 200,
  keyGenerator: (req) => `search:${req.user?.userId || req.ip}`
});

const generalRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req) => `general:${req.user?.userId || req.ip}`
});

// Apply security middleware to all routes
router.use(sanitizeInput);
router.use(preventSQLInjection);
router.use(preventXSS);

// Public search routes (with optional authentication for personalization)

/**
 * @route   GET /api/v1/search/experts
 * @desc    Search experts with advanced filtering
 * @access  Public (optional auth for personalization)
 */
router.get('/experts',
  searchRateLimit,
  optionalAuth,
  validationSchemas.searchExperts,
  handleValidationErrors,
  searchController.searchExperts
);

/**
 * @route   GET /api/v1/search/services
 * @desc    Search expert services
 * @access  Public (optional auth for personalization)
 */
router.get('/services',
  searchRateLimit,
  optionalAuth,
  searchController.searchServices
);

/**
 * @route   GET /api/v1/search/suggestions
 * @desc    Get search suggestions (autocomplete)
 * @access  Public
 */
router.get('/suggestions',
  generalRateLimit,
  searchController.getSearchSuggestions
);

/**
 * @route   GET /api/v1/search/specializations
 * @desc    Get expert specializations and categories
 * @access  Public
 */
router.get('/specializations',
  generalRateLimit,
  searchController.getSpecializations
);

/**
 * @route   GET /api/v1/search/trending
 * @desc    Get trending searches and popular experts
 * @access  Public
 */
router.get('/trending',
  generalRateLimit,
  searchController.getTrendingData
);

// Private routes (authentication required)

/**
 * @route   POST /api/v1/search/suggest-experts
 * @desc    Get expert suggestions based on RFQ requirements
 * @access  Private (Authenticated users only)
 */
router.post('/suggest-experts',
  searchRateLimit,
  authenticateToken,
  searchController.suggestExperts
);

export default router;