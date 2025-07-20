import { Router } from 'express';

import { searchController } from '../controllers/SearchController';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { searchValidationRules } from '../validators/searchValidators';

const router = Router();

// Apply authentication to all search routes
router.use(authenticateToken);

// Product search routes
router.get('/products',
  validateRequest(searchValidationRules.productSearch),
  searchController.searchProducts
);

router.get('/products/suggestions',
  validateRequest(searchValidationRules.suggestions),
  searchController.getProductSuggestions
);

// Company search routes
router.get('/companies',
  validateRequest(searchValidationRules.companySearch),
  searchController.searchCompanies
);

router.get('/companies/suggestions',
  validateRequest(searchValidationRules.suggestions),
  searchController.getCompanySuggestions
);

// User search routes
router.get('/users',
  validateRequest(searchValidationRules.userSearch),
  searchController.searchUsers
);

// Order search routes
router.get('/orders',
  validateRequest(searchValidationRules.orderSearch),
  searchController.searchOrders
);

// Multi-index search
router.get('/all',
  validateRequest(searchValidationRules.globalSearch),
  searchController.searchAll
);

// Analytics and insights
router.get('/analytics/popular',
  searchController.getPopularSearches
);

router.get('/analytics/trends',
  searchController.getSearchTrends
);

// Index management (admin only)
router.post('/index/sync',
  searchController.syncIndices
);

router.get('/index/stats/:index',
  searchController.getIndexStats
);

export default router;
