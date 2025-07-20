import { Router } from 'express';

import { demandForecastController } from '../controllers/DemandForecastController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';
import { demandForecastValidationRules } from '../validators/demandForecastValidators';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Apply rate limiting for ML operations
const mlRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes for ML operations
  message: 'Too many forecasting requests. Please try again later.'
});

// Single product forecast routes
router.get('/products/:productId/forecast',
  mlRateLimit,
  validateRequest(demandForecastValidationRules.generateForecast),
  demandForecastController.generateProductForecast
);

router.get('/products/:productId/elasticity',
  mlRateLimit,
  validateRequest(demandForecastValidationRules.productId),
  demandForecastController.calculatePriceElasticity
);

router.get('/products/:productId/drivers',
  mlRateLimit,
  validateRequest(demandForecastValidationRules.productId),
  demandForecastController.identifyDemandDrivers
);

router.put('/products/:productId/model',
  mlRateLimit,
  validateRequest(demandForecastValidationRules.updateModel),
  demandForecastController.updateModel
);

// Bulk operations
router.post('/products/bulk/forecast',
  mlRateLimit,
  validateRequest(demandForecastValidationRules.bulkForecast),
  demandForecastController.generateBulkForecasts
);

router.post('/export',
  validateRequest(demandForecastValidationRules.exportData),
  demandForecastController.exportForecastData
);

// Market analysis routes
router.get('/market/trends',
  validateRequest(demandForecastValidationRules.marketTrends),
  demandForecastController.analyzeMarketTrends
);

router.get('/analytics',
  validateRequest(demandForecastValidationRules.analytics),
  demandForecastController.getForecastingAnalytics
);

// Company dashboard
router.get('/dashboard',
  demandForecastController.getCompanyDashboard
);

export default router;
