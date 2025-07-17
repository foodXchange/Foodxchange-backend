import express from 'express';
import { RecommendationController } from '../../controllers/RecommendationController';
import { authMiddleware } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../core/errors';

const router = express.Router();
const recommendationController = new RecommendationController();

// Rate limiter for AI/ML operations
const aiRateLimiter = createCustomRateLimiter('ai-recommendations', 60, 150); // 150 requests per hour

// Apply middleware to all routes
router.use(authMiddleware);
router.use(enforceTenantIsolation);
router.use(aiRateLimiter);

/**
 * @route GET /api/v1/ai/recommendations
 * @desc Get personalized product recommendations
 * @access Private
 */
router.get('/recommendations', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getPersonalizedRecommendations.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/search
 * @desc Advanced search with AI-powered relevance scoring
 * @access Private
 */
router.get('/search', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.advancedSearch.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/search/suggestions
 * @desc Get search suggestions for autocomplete
 * @access Private
 */
router.get('/search/suggestions', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getSearchSuggestions.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/category/:category
 * @desc Get recommendations by category
 * @access Private
 */
router.get('/recommendations/category/:category', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getRecommendationsByCategory.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/trending
 * @desc Get trending products
 * @access Private
 */
router.get('/recommendations/trending', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getTrendingProducts.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/similar/:productId
 * @desc Get similar products
 * @access Private
 */
router.get('/recommendations/similar/:productId', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getSimilarProducts.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/rfq/:rfqId
 * @desc Get recommendations for specific RFQ
 * @access Private
 */
router.get('/recommendations/rfq/:rfqId', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getRecommendationsForRFQ.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/seasonal
 * @desc Get seasonal recommendations
 * @access Private
 */
router.get('/recommendations/seasonal', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getSeasonalRecommendations.bind(recommendationController))
);

/**
 * @route GET /api/v1/ai/recommendations/location
 * @desc Get location-based recommendations
 * @access Private
 */
router.get('/recommendations/location', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.getLocationBasedRecommendations.bind(recommendationController))
);

/**
 * @route POST /api/v1/ai/recommendations/track
 * @desc Track recommendation interaction
 * @access Private
 */
router.post('/recommendations/track', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(recommendationController.trackRecommendationInteraction.bind(recommendationController))
);

export default router;