import { body, param, query } from 'express-validator';

export const demandForecastValidationRules = {
  productId: [
    param('productId')
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId')
  ],

  generateForecast: [
    param('productId')
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),

    query('periodType')
      .optional()
      .isIn(['daily', 'weekly', 'monthly', 'quarterly'])
      .withMessage('Period type must be one of: daily, weekly, monthly, quarterly'),

    query('periodsAhead')
      .optional()
      .isInt({ min: 1, max: 52 })
      .withMessage('Periods ahead must be between 1 and 52'),

    query('modelType')
      .optional()
      .isIn(['linear', 'exponential', 'polynomial', 'seasonal', 'arima', 'ensemble'])
      .withMessage('Model type must be one of: linear, exponential, polynomial, seasonal, arima, ensemble'),

    query('includeSeasonality')
      .optional()
      .isBoolean()
      .withMessage('Include seasonality must be a boolean'),

    query('includeExternalFactors')
      .optional()
      .isBoolean()
      .withMessage('Include external factors must be a boolean')
  ],

  bulkForecast: [
    body('productIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Product IDs must be an array with 1-50 items'),

    body('productIds.*')
      .isMongoId()
      .withMessage('Each product ID must be a valid MongoDB ObjectId'),

    query('periodType')
      .optional()
      .isIn(['daily', 'weekly', 'monthly', 'quarterly'])
      .withMessage('Period type must be one of: daily, weekly, monthly, quarterly'),

    query('periodsAhead')
      .optional()
      .isInt({ min: 1, max: 52 })
      .withMessage('Periods ahead must be between 1 and 52'),

    query('modelType')
      .optional()
      .isIn(['linear', 'exponential', 'polynomial', 'seasonal', 'arima', 'ensemble'])
      .withMessage('Model type must be one of: linear, exponential, polynomial, seasonal, arima, ensemble')
  ],

  updateModel: [
    param('productId')
      .isMongoId()
      .withMessage('Product ID must be a valid MongoDB ObjectId'),

    body('data')
      .isArray({ min: 1, max: 1000 })
      .withMessage('Data must be an array with 1-1000 items'),

    body('data.*.date')
      .isISO8601()
      .withMessage('Each data point must have a valid ISO date'),

    body('data.*.demand')
      .isFloat({ min: 0 })
      .withMessage('Demand must be a non-negative number'),

    body('data.*.price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Price must be a non-negative number'),

    body('data.*.quantity')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Quantity must be a non-negative number')
  ],

  marketTrends: [
    query('category')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    query('region')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Region must be between 1 and 100 characters'),

    query('timeframe')
      .optional()
      .isIn(['3m', '6m', '1y', '2y'])
      .withMessage('Timeframe must be one of: 3m, 6m, 1y, 2y')
  ],

  analytics: [
    query('timeframe')
      .optional()
      .isIn(['3m', '6m', '1y', '2y'])
      .withMessage('Timeframe must be one of: 3m, 6m, 1y, 2y'),

    query('category')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Category must be between 1 and 100 characters'),

    query('region')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Region must be between 1 and 100 characters')
  ],

  exportData: [
    body('productIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('Product IDs must be an array with 1-100 items'),

    body('productIds.*')
      .isMongoId()
      .withMessage('Each product ID must be a valid MongoDB ObjectId'),

    query('format')
      .optional()
      .isIn(['json', 'csv'])
      .withMessage('Format must be either json or csv'),

    body('options')
      .optional()
      .isObject()
      .withMessage('Options must be an object'),

    body('options.periodType')
      .optional()
      .isIn(['daily', 'weekly', 'monthly', 'quarterly'])
      .withMessage('Period type must be one of: daily, weekly, monthly, quarterly'),

    body('options.periodsAhead')
      .optional()
      .isInt({ min: 1, max: 52 })
      .withMessage('Periods ahead must be between 1 and 52'),

    body('options.includeMetadata')
      .optional()
      .isBoolean()
      .withMessage('Include metadata must be a boolean'),

    body('options.includeRecommendations')
      .optional()
      .isBoolean()
      .withMessage('Include recommendations must be a boolean')
  ],

  // Advanced validation rules
  forecastParameters: [
    body('parameters')
      .optional()
      .isObject()
      .withMessage('Parameters must be an object'),

    body('parameters.confidence_level')
      .optional()
      .isFloat({ min: 0.5, max: 0.99 })
      .withMessage('Confidence level must be between 0.5 and 0.99'),

    body('parameters.seasonality_period')
      .optional()
      .isInt({ min: 2, max: 52 })
      .withMessage('Seasonality period must be between 2 and 52'),

    body('parameters.trend_dampening')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Trend dampening must be between 0 and 1'),

    body('parameters.outlier_threshold')
      .optional()
      .isFloat({ min: 1, max: 5 })
      .withMessage('Outlier threshold must be between 1 and 5 standard deviations'),

    body('parameters.min_data_points')
      .optional()
      .isInt({ min: 3, max: 1000 })
      .withMessage('Minimum data points must be between 3 and 1000')
  ],

  customModel: [
    body('modelConfig')
      .isObject()
      .withMessage('Model configuration must be an object'),

    body('modelConfig.type')
      .isIn(['linear', 'exponential', 'polynomial', 'seasonal', 'arima', 'ensemble'])
      .withMessage('Model type must be one of: linear, exponential, polynomial, seasonal, arima, ensemble'),

    body('modelConfig.hyperparameters')
      .optional()
      .isObject()
      .withMessage('Hyperparameters must be an object'),

    body('modelConfig.features')
      .optional()
      .isArray()
      .withMessage('Features must be an array'),

    body('modelConfig.features.*')
      .isString()
      .isIn(['price', 'seasonality', 'trend', 'lag', 'moving_average', 'external_factors'])
      .withMessage('Each feature must be one of: price, seasonality, trend, lag, moving_average, external_factors'),

    body('modelConfig.validation')
      .optional()
      .isObject()
      .withMessage('Validation configuration must be an object'),

    body('modelConfig.validation.method')
      .optional()
      .isIn(['holdout', 'cross_validation', 'time_series_split'])
      .withMessage('Validation method must be one of: holdout, cross_validation, time_series_split'),

    body('modelConfig.validation.test_size')
      .optional()
      .isFloat({ min: 0.1, max: 0.5 })
      .withMessage('Test size must be between 0.1 and 0.5')
  ],

  batchAnalysis: [
    body('analysis')
      .isObject()
      .withMessage('Analysis configuration must be an object'),

    body('analysis.products')
      .optional()
      .isArray({ max: 200 })
      .withMessage('Products array cannot exceed 200 items'),

    body('analysis.categories')
      .optional()
      .isArray({ max: 50 })
      .withMessage('Categories array cannot exceed 50 items'),

    body('analysis.suppliers')
      .optional()
      .isArray({ max: 100 })
      .withMessage('Suppliers array cannot exceed 100 items'),

    body('analysis.dateRange')
      .isObject()
      .withMessage('Date range must be an object'),

    body('analysis.dateRange.start')
      .isISO8601()
      .withMessage('Start date must be a valid ISO date'),

    body('analysis.dateRange.end')
      .isISO8601()
      .withMessage('End date must be a valid ISO date')
      .custom((endDate, { req }) => {
        const startDate = req.body.analysis?.dateRange?.start;
        if (startDate && new Date(endDate) <= new Date(startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),

    body('analysis.metrics')
      .optional()
      .isArray()
      .withMessage('Metrics must be an array'),

    body('analysis.metrics.*')
      .isString()
      .isIn(['accuracy', 'rmse', 'mae', 'mape', 'elasticity', 'seasonality', 'trend'])
      .withMessage('Each metric must be one of: accuracy, rmse, mae, mape, elasticity, seasonality, trend'),

    body('analysis.groupBy')
      .optional()
      .isIn(['product', 'category', 'supplier', 'region', 'month', 'quarter'])
      .withMessage('Group by must be one of: product, category, supplier, region, month, quarter')
  ]
};

// Composite validation rules for complex operations
export const compositeValidationRules = {
  completeAnalysis: [
    ...demandForecastValidationRules.productId,
    ...demandForecastValidationRules.forecastParameters,
    body('includeElasticity')
      .optional()
      .isBoolean()
      .withMessage('Include elasticity must be a boolean'),

    body('includeDrivers')
      .optional()
      .isBoolean()
      .withMessage('Include drivers must be a boolean'),

    body('includeTrends')
      .optional()
      .isBoolean()
      .withMessage('Include trends must be a boolean')
  ],

  modelComparison: [
    ...demandForecastValidationRules.productId,
    body('models')
      .isArray({ min: 2, max: 6 })
      .withMessage('Must compare between 2 and 6 models'),

    body('models.*')
      .isIn(['linear', 'exponential', 'polynomial', 'seasonal', 'arima', 'ensemble'])
      .withMessage('Each model must be one of: linear, exponential, polynomial, seasonal, arima, ensemble'),

    body('evaluationMetrics')
      .optional()
      .isArray()
      .withMessage('Evaluation metrics must be an array'),

    body('evaluationMetrics.*')
      .isIn(['accuracy', 'rmse', 'mae', 'mape', 'aic', 'bic'])
      .withMessage('Each metric must be one of: accuracy, rmse, mae, mape, aic, bic')
  ]
};
