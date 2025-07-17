/**
 * AI-Powered Recommendations API Routes
 * Provides intelligent recommendations for buyers, suppliers, and products
 */

import { Router, Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { body, param, query, validationResult } from 'express-validator';
import { RecommendationEngine, RFQRequirements, UserBehaviorData } from '../../services/ai/RecommendationEngine';
import { MatchingAlgorithms, BuyerRequirements, SupplierProfile, ProductProfile } from '../../services/ai/MatchingAlgorithms';
import { protect } from '../../middleware/auth';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';

const router = Router();
const logger = new Logger('RecommendationsAPI');
const recommendationEngine = RecommendationEngine.getInstance();
const matchingAlgorithms = new MatchingAlgorithms();
const metrics = new MetricsService();

// Middleware for validation
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route   POST /api/recommendations/products
 * @desc    Get AI-powered product recommendations for RFQ
 * @access  Private
 */
router.post(
  '/products',
  protect,
  [
    body('productCategory').notEmpty().withMessage('Product category is required'),
    body('specifications').optional().isObject(),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
    body('deliveryLocation').notEmpty().withMessage('Delivery location is required'),
    body('requiredCertifications').optional().isArray(),
    body('maxBudget').optional().isFloat({ min: 0 }),
    body('urgency').optional().isIn(['low', 'medium', 'high']),
    body('qualityRequirements').optional().isArray(),
    body('limit').optional().isInt({ min: 1, max: 50 })
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const {
        productCategory,
        specifications = {},
        quantity,
        deliveryLocation,
        requiredCertifications = [],
        maxBudget,
        urgency = 'medium',
        qualityRequirements = [],
        limit = 10
      } = req.body;

      const userId = req.user._id;

      // Build RFQ requirements
      const requirements: RFQRequirements = {
        productCategory,
        specifications,
        quantity,
        deliveryLocation,
        requiredCertifications,
        maxBudget,
        urgency,
        qualityRequirements
      };

      // Get user behavior data (this would come from user analytics)
      const userBehavior: UserBehaviorData | undefined = await getUserBehaviorData(userId);

      // Get recommendations
      const recommendations = await recommendationEngine.getProductRecommendations(
        requirements,
        userBehavior,
        limit
      );

      // Track API usage
      metrics.incrementCounter('api_product_recommendations');
      metrics.recordTimer('api_product_recommendations_time', Date.now() - startTime);

      logger.info('Product recommendations generated', {
        userId,
        category: productCategory,
        count: recommendations.length,
        duration: Date.now() - startTime
      });

      res.json({
        success: true,
        data: {
          recommendations,
          metadata: {
            totalResults: recommendations.length,
            requestId: generateRequestId(),
            processingTime: Date.now() - startTime,
            cached: false // This would be determined by cache hit
          }
        }
      });

    } catch (error) {
      logger.error('Failed to generate product recommendations', { error, userId: req.user._id });
      metrics.incrementCounter('api_product_recommendations_error');
      throw new ApiError('Failed to generate recommendations', 500);
    }
  })
);

/**
 * @route   POST /api/recommendations/suppliers
 * @desc    Get AI-powered supplier recommendations
 * @access  Private
 */
router.post(
  '/suppliers',
  protect,
  [
    body('productCategory').notEmpty().withMessage('Product category is required'),
    body('requirements').optional().isObject(),
    body('limit').optional().isInt({ min: 1, max: 50 })
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { productCategory, requirements = {}, limit = 10 } = req.body;
      const userId = req.user._id;

      const userBehavior = await getUserBehaviorData(userId);

      const recommendations = await recommendationEngine.getSupplierRecommendations(
        productCategory,
        requirements,
        userBehavior,
        limit
      );

      metrics.incrementCounter('api_supplier_recommendations');
      metrics.recordTimer('api_supplier_recommendations_time', Date.now() - startTime);

      logger.info('Supplier recommendations generated', {
        userId,
        category: productCategory,
        count: recommendations.length
      });

      res.json({
        success: true,
        data: {
          recommendations,
          metadata: {
            totalResults: recommendations.length,
            requestId: generateRequestId(),
            processingTime: Date.now() - startTime
          }
        }
      });

    } catch (error) {
      logger.error('Failed to generate supplier recommendations', { error });
      metrics.incrementCounter('api_supplier_recommendations_error');
      throw new ApiError('Failed to generate supplier recommendations', 500);
    }
  })
);

/**
 * @route   GET /api/recommendations/similar-products/:productId
 * @desc    Get similar products to a given product
 * @access  Private
 */
router.get(
  '/similar-products/:productId',
  protect,
  [
    param('productId').isMongoId().withMessage('Invalid product ID'),
    query('limit').optional().isInt({ min: 1, max: 20 })
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;
    const userId = req.user._id;

    try {
      const userBehavior = await getUserBehaviorData(userId);
      
      const similarProducts = await recommendationEngine.getSimilarProducts(
        productId,
        userBehavior,
        limit
      );

      metrics.incrementCounter('api_similar_products');

      res.json({
        success: true,
        data: {
          originalProductId: productId,
          similarProducts,
          metadata: {
            totalResults: similarProducts.length,
            requestId: generateRequestId()
          }
        }
      });

    } catch (error) {
      logger.error('Failed to find similar products', { error, productId });
      throw new ApiError('Failed to find similar products', 500);
    }
  })
);

/**
 * @route   GET /api/recommendations/personalized
 * @desc    Get personalized recommendations for user
 * @access  Private
 */
router.get(
  '/personalized',
  protect,
  [
    query('limit').optional().isInt({ min: 1, max: 50 })
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const userId = req.user._id;

    try {
      const userBehavior = await getUserBehaviorData(userId);
      
      if (!userBehavior) {
        return res.json({
          success: true,
          data: {
            recommendations: [],
            metadata: {
              message: 'Insufficient user data for personalized recommendations',
              requestId: generateRequestId()
            }
          }
        });
      }

      const recommendations = await recommendationEngine.getPersonalizedRecommendations(
        userBehavior,
        limit
      );

      metrics.incrementCounter('api_personalized_recommendations');

      res.json({
        success: true,
        data: {
          recommendations,
          metadata: {
            totalResults: recommendations.length,
            requestId: generateRequestId(),
            basedOnBehavior: true
          }
        }
      });

    } catch (error) {
      logger.error('Failed to generate personalized recommendations', { error, userId });
      throw new ApiError('Failed to generate personalized recommendations', 500);
    }
  })
);

/**
 * @route   POST /api/recommendations/advanced-matching
 * @desc    Advanced supplier-product matching with custom weights
 * @access  Private
 */
router.post(
  '/advanced-matching',
  protect,
  [
    body('requirements').isObject().withMessage('Requirements object is required'),
    body('suppliers').optional().isArray(),
    body('products').optional().isArray(),
    body('weights').optional().isObject(),
    body('mode').optional().isIn(['suppliers', 'products', 'both'])
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { requirements, suppliers = [], products = [], weights, mode = 'both' } = req.body;
    const userId = req.user._id;

    try {
      const results: any = {};

      if (mode === 'suppliers' || mode === 'both') {
        // Get supplier matches
        const supplierMatches = matchingAlgorithms.matchSuppliersToRequirements(
          suppliers,
          requirements,
          weights
        );
        results.suppliers = supplierMatches;
      }

      if (mode === 'products' || mode === 'both') {
        // Get product matches
        const productMatches = matchingAlgorithms.matchProductsToRequirements(
          products,
          suppliers,
          requirements,
          weights
        );
        results.products = productMatches;
      }

      metrics.incrementCounter('api_advanced_matching');

      logger.info('Advanced matching completed', {
        userId,
        mode,
        supplierCount: suppliers.length,
        productCount: products.length
      });

      res.json({
        success: true,
        data: {
          ...results,
          metadata: {
            mode,
            requestId: generateRequestId(),
            matchingCriteria: weights || 'default'
          }
        }
      });

    } catch (error) {
      logger.error('Advanced matching failed', { error, userId });
      throw new ApiError('Advanced matching failed', 500);
    }
  })
);

/**
 * @route   POST /api/recommendations/feedback
 * @desc    Track user feedback on recommendations
 * @access  Private
 */
router.post(
  '/feedback',
  protect,
  [
    body('recommendationId').notEmpty().withMessage('Recommendation ID is required'),
    body('action').isIn(['view', 'click', 'purchase', 'reject']).withMessage('Invalid action'),
    body('metadata').optional().isObject()
  ],
  validateRequest,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { recommendationId, action, metadata } = req.body;
    const userId = req.user._id;

    try {
      await recommendationEngine.trackRecommendationFeedback(
        recommendationId,
        userId,
        action,
        metadata
      );

      logger.info('Recommendation feedback tracked', {
        userId,
        recommendationId,
        action
      });

      res.json({
        success: true,
        message: 'Feedback recorded successfully'
      });

    } catch (error) {
      logger.error('Failed to track recommendation feedback', { error });
      throw new ApiError('Failed to record feedback', 500);
    }
  })
);

/**
 * @route   GET /api/recommendations/analytics
 * @desc    Get recommendation analytics for user
 * @access  Private
 */
router.get(
  '/analytics',
  protect,
  authorize('buyer', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user._id;

    try {
      // This would fetch analytics from your analytics service
      const analytics = await getRecommendationAnalytics(userId);

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Failed to fetch recommendation analytics', { error, userId });
      throw new ApiError('Failed to fetch analytics', 500);
    }
  })
);

// Helper functions

async function getUserBehaviorData(userId: string): Promise<UserBehaviorData | undefined> {
  try {
    // This would integrate with your user analytics service
    // For now, return a mock implementation
    return {
      userId,
      recentPurchases: [],
      preferredSuppliers: [],
      categoryPreferences: [],
      priceRange: { min: 0, max: 10000 },
      qualityPreference: 0.7,
      speedPreference: 0.5
    };
  } catch (error) {
    logger.warn('Failed to fetch user behavior data', { error, userId });
    return undefined;
  }
}

async function getRecommendationAnalytics(userId: string): Promise<any> {
  // Mock analytics data - replace with real implementation
  return {
    totalRecommendations: 150,
    clickThroughRate: 0.23,
    conversionRate: 0.08,
    preferredCategories: ['dairy', 'organic vegetables', 'grains'],
    avgRating: 4.2,
    lastActivity: new Date().toISOString()
  };
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default router;