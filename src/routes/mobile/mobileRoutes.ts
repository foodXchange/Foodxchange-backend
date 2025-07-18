import express from 'express';
import { MobileController } from '../../controllers/MobileController';
import { requireAuth } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../core/errors';

const router = express.Router();
const mobileController = new MobileController();

// Rate limiter for mobile operations (higher limits for mobile apps)
const mobileRateLimiter = createCustomRateLimiter('mobile', 60, 300); // 300 requests per hour

// Apply middleware to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(mobileRateLimiter);

/**
 * @route GET /api/v1/mobile/dashboard
 * @desc Get mobile dashboard
 * @access Private
 */
router.get('/dashboard', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getDashboard.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/products
 * @desc Get mobile-optimized products with pagination
 * @access Private
 */
router.get('/products', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getProducts.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/products/:productId
 * @desc Get mobile product details
 * @access Private
 */
router.get('/products/:productId', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getProductDetails.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/orders
 * @desc Get mobile-optimized orders
 * @access Private
 */
router.get('/orders', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getOrders.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/rfqs
 * @desc Get mobile-optimized RFQs
 * @access Private
 */
router.get('/rfqs', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getRFQs.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/search/suggestions
 * @desc Get mobile search suggestions
 * @access Private
 */
router.get('/search/suggestions', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getSearchSuggestions.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/categories
 * @desc Get mobile categories
 * @access Private
 */
router.get('/categories', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getCategories.bind(mobileController))
);

/**
 * @route GET /api/v1/mobile/config
 * @desc Get mobile app configuration
 * @access Private
 */
router.get('/config', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.getAppConfig.bind(mobileController))
);

/**
 * @route POST /api/v1/mobile/track
 * @desc Track mobile event
 * @access Private
 */
router.post('/track', 
  authorize(['admin', 'manager', 'user', 'supplier', 'buyer']),
  asyncHandler(mobileController.trackEvent.bind(mobileController))
);

export default router;