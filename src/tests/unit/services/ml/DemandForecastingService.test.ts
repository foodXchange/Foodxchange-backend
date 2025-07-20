import { DemandForecastingService } from '../../../../services/ml/DemandForecastingService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';
import { Order } from '../../../../models/Order';
import { Product } from '../../../../models/Product';
import { Company } from '../../../../models/Company';

// Mock dependencies
jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn(),
    set: jest.fn(),
    deletePattern: jest.fn()
  }
}));

jest.mock('../../../../models/Order');
jest.mock('../../../../models/Product');
jest.mock('../../../../models/Company');

jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

// Mock ML libraries
jest.mock('simple-statistics', () => ({
  mean: jest.fn().mockReturnValue(50),
  standardDeviation: jest.fn().mockReturnValue(10),
  sampleCorrelation: jest.fn().mockReturnValue(0.7),
  linearRegression: jest.fn().mockReturnValue([[1, 0.5]]),
  linearRegressionLine: jest.fn().mockReturnValue((x: number) => x * 0.5 + 10)
}));

jest.mock('regression', () => ({
  linear: jest.fn().mockReturnValue({
    equation: [0.5, 10],
    r2: 0.85,
    predict: jest.fn().mockReturnValue(25)
  }),
  polynomial: jest.fn().mockReturnValue({
    equation: [0.1, 0.5, 10],
    r2: 0.90,
    predict: jest.fn().mockReturnValue(30)
  })
}));

jest.mock('natural', () => ({
  SentimentAnalyzer: jest.fn(),
  PorterStemmer: jest.fn()
}));

jest.mock('compromise', () => {
  return jest.fn().mockReturnValue({
    nouns: jest.fn().mockReturnValue({
      out: jest.fn().mockReturnValue(['market', 'demand', 'organic', 'produce'])
    })
  });
});

describe('DemandForecastingService', () => {
  let demandForecastingService: DemandForecastingService;
  let mockProduct: any;
  let mockHistoricalData: any[];

  beforeEach(() => {
    demandForecastingService = new DemandForecastingService();
    
    mockProduct = {
      _id: 'product123',
      name: 'Organic Apples',
      category: 'fruits',
      supplier: {
        _id: 'supplier123',
        name: 'Green Farm Co.'
      },
      status: 'ACTIVE'
    };

    mockHistoricalData = [
      { date: new Date('2024-01-01'), demand: 100, price: 5.99 },
      { date: new Date('2024-02-01'), demand: 120, price: 5.79 },
      { date: new Date('2024-03-01'), demand: 90, price: 6.29 },
      { date: new Date('2024-04-01'), demand: 110, price: 5.99 },
      { date: new Date('2024-05-01'), demand: 130, price: 5.49 },
      { date: new Date('2024-06-01'), demand: 140, price: 5.29 }
    ];

    jest.clearAllMocks();
  });

  describe('generateDemandForecast', () => {
    beforeEach(() => {
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });
      
      (Order.aggregate as jest.Mock).mockResolvedValue([
        {
          _id: { year: 2024, month: 1 },
          totalDemand: 100,
          avgPrice: 5.99,
          orderCount: 10
        },
        {
          _id: { year: 2024, month: 2 },
          totalDemand: 120,
          avgPrice: 5.79,
          orderCount: 12
        }
      ]);
    });

    test('should generate demand forecast successfully', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const forecast = await demandForecastingService.generateDemandForecast('product123', {
        periodType: 'monthly',
        periodsAhead: 6,
        modelType: 'ensemble'
      });

      expect(forecast).toBeDefined();
      expect(forecast.productId).toBe('product123');
      expect(forecast.productName).toBe('Organic Apples');
      expect(forecast.category).toBe('fruits');
      expect(forecast.predictions).toHaveLength(6);
      expect(forecast.model.type).toBe('ensemble');
      expect(forecast.recommendations).toBeInstanceOf(Array);
    });

    test('should return cached forecast if available', async () => {
      const cachedForecast = {
        productId: 'product123',
        predictions: [{ date: new Date(), predictedDemand: 100, confidence: 0.8 }]
      };
      (optimizedCache.get as jest.Mock).mockResolvedValue(cachedForecast);

      const result = await demandForecastingService.generateDemandForecast('product123');

      expect(result).toEqual(cachedForecast);
      expect(Product.findById).not.toHaveBeenCalled();
    });

    test('should throw error if product not found', async () => {
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await expect(
        demandForecastingService.generateDemandForecast('nonexistent')
      ).rejects.toThrow('Product not found');
    });

    test('should throw error if insufficient historical data', async () => {
      (Order.aggregate as jest.Mock).mockResolvedValue([
        { _id: { year: 2024, month: 1 }, totalDemand: 100, avgPrice: 5.99 }
      ]);

      await expect(
        demandForecastingService.generateDemandForecast('product123')
      ).rejects.toThrow('Insufficient historical data for forecasting');
    });

    test('should handle different period types', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const dailyForecast = await demandForecastingService.generateDemandForecast('product123', {
        periodType: 'daily',
        periodsAhead: 30
      });

      expect(dailyForecast.forecastPeriod.periodType).toBe('daily');
      expect(dailyForecast.predictions).toHaveLength(30);
    });

    test('should handle different model types', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const linearForecast = await demandForecastingService.generateDemandForecast('product123', {
        modelType: 'linear'
      });

      expect(linearForecast.model.type).toBe('linear');
    });

    test('should include seasonality when requested', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const forecast = await demandForecastingService.generateDemandForecast('product123', {
        includeSeasonality: true
      });

      expect(forecast.factors.seasonality).toBeDefined();
      expect(typeof forecast.factors.seasonality).toBe('number');
    });

    test('should cache forecast results', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      await demandForecastingService.generateDemandForecast('product123');

      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('demand_forecast:product123'),
        expect.any(Object),
        21600 // 6 hours
      );
    });
  });

  describe('analyzeMarketTrends', () => {
    test('should analyze market trends successfully', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const trends = await demandForecastingService.analyzeMarketTrends('fruits', 'global', '6m');

      expect(trends).toBeInstanceOf(Array);
      expect(trends.length).toBeGreaterThan(0);
      
      const trend = trends[0];
      expect(trend).toHaveProperty('productCategory');
      expect(trend).toHaveProperty('trend');
      expect(trend).toHaveProperty('strength');
      expect(trend).toHaveProperty('confidence');
    });

    test('should return cached trends if available', async () => {
      const cachedTrends = [
        {
          productCategory: 'fruits',
          trend: 'increasing',
          strength: 0.7,
          confidence: 0.8
        }
      ];
      (optimizedCache.get as jest.Mock).mockResolvedValue(cachedTrends);

      const result = await demandForecastingService.analyzeMarketTrends('fruits');

      expect(result).toEqual(cachedTrends);
    });

    test('should handle different timeframes', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const trends = await demandForecastingService.analyzeMarketTrends('fruits', 'US', '1y');

      expect(trends).toBeInstanceOf(Array);
      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('1y'),
        expect.any(Array),
        14400
      );
    });
  });

  describe('calculatePriceElasticity', () => {
    test('should calculate price elasticity successfully', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);

      const elasticity = await demandForecastingService.calculatePriceElasticity('product123');

      expect(elasticity).toHaveProperty('productId', 'product123');
      expect(elasticity).toHaveProperty('elasticity');
      expect(elasticity).toHaveProperty('demandSensitivity');
      expect(elasticity).toHaveProperty('optimalPriceRange');
      expect(elasticity).toHaveProperty('competitorAnalysis');

      expect(typeof elasticity.elasticity).toBe('number');
      expect(['high', 'medium', 'low']).toContain(elasticity.demandSensitivity);
    });

    test('should return cached elasticity if available', async () => {
      const cachedElasticity = {
        productId: 'product123',
        elasticity: -0.8,
        demandSensitivity: 'medium' as const,
        optimalPriceRange: { min: 5.0, max: 15.0, recommended: 10.0 },
        competitorAnalysis: []
      };
      (optimizedCache.get as jest.Mock).mockResolvedValue(cachedElasticity);

      const result = await demandForecastingService.calculatePriceElasticity('product123');

      expect(result).toEqual(cachedElasticity);
    });

    test('should throw error if insufficient data', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      
      // Mock the private method to return insufficient data
      const service = demandForecastingService as any;
      service.getPriceHistory = jest.fn().mockResolvedValue([]);
      service.getDemandHistory = jest.fn().mockResolvedValue([]);

      await expect(
        demandForecastingService.calculatePriceElasticity('product123')
      ).rejects.toThrow('Insufficient data for price elasticity calculation');
    });
  });

  describe('identifyDemandDrivers', () => {
    test('should identify demand drivers successfully', async () => {
      const drivers = await demandForecastingService.identifyDemandDrivers('product123');

      expect(drivers).toBeInstanceOf(Array);
      
      if (drivers.length > 0) {
        const driver = drivers[0];
        expect(driver).toHaveProperty('factor');
        expect(driver).toHaveProperty('impact');
        expect(driver).toHaveProperty('correlation');
        expect(driver).toHaveProperty('significance');
        expect(driver).toHaveProperty('description');
        expect(driver).toHaveProperty('type');

        expect(['internal', 'external', 'seasonal', 'economic']).toContain(driver.type);
      }
    });

    test('should sort drivers by significance', async () => {
      const drivers = await demandForecastingService.identifyDemandDrivers('product123');

      for (let i = 1; i < drivers.length; i++) {
        expect(drivers[i].significance).toBeLessThanOrEqual(drivers[i - 1].significance);
      }
    });
  });

  describe('generateBulkForecasts', () => {
    test('should generate bulk forecasts successfully', async () => {
      const productIds = ['product1', 'product2', 'product3'];
      
      // Mock successful forecasts
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });
      (Order.aggregate as jest.Mock).mockResolvedValue(mockHistoricalData.map((d, i) => ({
        _id: { year: 2024, month: i + 1 },
        totalDemand: d.demand,
        avgPrice: d.price,
        orderCount: 5
      })));

      const forecasts = await demandForecastingService.generateBulkForecasts(productIds);

      expect(forecasts).toBeInstanceOf(Array);
      expect(forecasts.length).toBeLessThanOrEqual(productIds.length);
      
      forecasts.forEach(forecast => {
        expect(forecast).toHaveProperty('productId');
        expect(forecast).toHaveProperty('predictions');
        expect(forecast).toHaveProperty('model');
      });
    });

    test('should handle mixed success and failure in bulk forecasts', async () => {
      const productIds = ['valid1', 'invalid', 'valid2'];
      
      let callCount = 0;
      (Product.findById as jest.Mock).mockImplementation((id: string) => ({
        populate: jest.fn().mockResolvedValue(
          id === 'invalid' ? null : mockProduct
        )
      }));

      const forecasts = await demandForecastingService.generateBulkForecasts(productIds);

      // Should only return successful forecasts
      expect(forecasts.length).toBe(2);
    });
  });

  describe('updateModel', () => {
    test('should update model with new data', async () => {
      const newData = [
        { date: new Date('2024-07-01'), demand: 150, price: 5.19 },
        { date: new Date('2024-08-01'), demand: 160, price: 4.99 }
      ];

      await expect(
        demandForecastingService.updateModel('product123', newData)
      ).resolves.not.toThrow();
    });

    test('should filter old data when updating model', async () => {
      const oldData = [
        { date: new Date('2020-01-01'), demand: 50, price: 8.99 }
      ];
      const newData = [
        { date: new Date('2024-07-01'), demand: 150, price: 5.19 }
      ];

      // Mock existing training data
      const service = demandForecastingService as any;
      service.trainingData.set('product123', oldData);

      await demandForecastingService.updateModel('product123', newData);

      // Old data should be filtered out (older than 2 years)
      const trainingData = service.trainingData.get('product123');
      expect(trainingData.some((d: any) => d.date.getFullYear() === 2020)).toBe(false);
    });
  });

  describe('private helper methods', () => {
    test('should prepare features correctly', async () => {
      const service = demandForecastingService as any;
      
      const features = await service.prepareFeatures('product123', mockHistoricalData, {
        includeSeasonality: true,
        includeExternalFactors: false
      });

      expect(features).toBeInstanceOf(Array);
      expect(features.length).toBe(mockHistoricalData.length);
      
      // Each feature vector should have the right structure
      features.forEach(feature => {
        expect(feature).toBeInstanceOf(Array);
        expect(feature.length).toBeGreaterThan(5); // Basic features + seasonality
      });
    });

    test('should train different model types', async () => {
      const service = demandForecastingService as any;
      const X = [[1, 2, 3], [2, 3, 4], [3, 4, 5]];
      const y = [10, 15, 20];

      const linearModel = service.trainLinearRegression(X, y);
      expect(linearModel.type).toBe('linear');
      expect(linearModel.equation).toBeDefined();

      const polyModel = service.trainPolynomialRegression(X, y);
      expect(polyModel.type).toBe('polynomial');
      expect(polyModel.equation).toBeDefined();

      const expModel = service.trainExponentialSmoothing(y);
      expect(expModel.type).toBe('exponential');
      expect(expModel.level).toBeDefined();

      const ensembleModel = service.trainEnsembleModel(X, y);
      expect(ensembleModel.type).toBe('ensemble');
      expect(ensembleModel.models).toHaveLength(3);
    });

    test('should calculate confidence intervals', async () => {
      const service = demandForecastingService as any;
      
      const predictions = [
        { date: new Date(), predictedDemand: 100 },
        { date: new Date(), predictedDemand: 120 }
      ];

      const withConfidence = service.calculateConfidenceIntervals(predictions, mockHistoricalData);

      expect(withConfidence).toHaveLength(predictions.length);
      withConfidence.forEach(pred => {
        expect(pred).toHaveProperty('confidence');
        expect(pred).toHaveProperty('lowerBound');
        expect(pred).toHaveProperty('upperBound');
        expect(pred.lowerBound).toBeLessThanOrEqual(pred.predictedDemand);
        expect(pred.upperBound).toBeGreaterThanOrEqual(pred.predictedDemand);
      });
    });

    test('should analyze demand factors', async () => {
      const service = demandForecastingService as any;
      
      const factors = await service.analyzeDemandFactors('product123', mockHistoricalData);

      expect(factors).toHaveProperty('seasonality');
      expect(factors).toHaveProperty('trend');
      expect(factors).toHaveProperty('priceElasticity');
      expect(factors).toHaveProperty('marketConditions');
      expect(factors).toHaveProperty('historicalVolatility');

      // All factors should be numbers between 0 and 1 (or higher for volatility)
      expect(typeof factors.seasonality).toBe('number');
      expect(typeof factors.trend).toBe('number');
      expect(typeof factors.priceElasticity).toBe('number');
    });

    test('should generate appropriate recommendations', async () => {
      const service = demandForecastingService as any;
      
      const predictions = mockHistoricalData.map(d => ({
        date: d.date,
        predictedDemand: d.demand,
        confidence: 0.8,
        lowerBound: d.demand * 0.8,
        upperBound: d.demand * 1.2
      }));

      const factors = {
        seasonality: 0.7,
        trend: 0.3,
        priceElasticity: 0.8,
        marketConditions: 0.6,
        historicalVolatility: 0.2
      };

      const recommendations = await service.generateRecommendations(
        mockProduct,
        predictions,
        factors
      );

      expect(recommendations).toBeInstanceOf(Array);
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('type');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('action');
        expect(rec).toHaveProperty('impact');
        expect(rec).toHaveProperty('timeline');

        expect(['stock_level', 'pricing', 'promotion', 'seasonal_preparation']).toContain(rec.type);
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      });
    });
  });

  describe('error handling', () => {
    test('should handle cache errors gracefully', async () => {
      (optimizedCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });
      (Order.aggregate as jest.Mock).mockResolvedValue(mockHistoricalData.map((d, i) => ({
        _id: { year: 2024, month: i + 1 },
        totalDemand: d.demand,
        avgPrice: d.price,
        orderCount: 5
      })));

      // Should not throw despite cache error
      const forecast = await demandForecastingService.generateDemandForecast('product123');
      expect(forecast).toBeDefined();
    });

    test('should handle database errors', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (Product.findById as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        demandForecastingService.generateDemandForecast('product123')
      ).rejects.toThrow('Database error');
    });

    test('should handle ML calculation errors', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });
      
      // Mock ML error
      const regression = require('regression');
      regression.linear.mockImplementationOnce(() => {
        throw new Error('ML calculation error');
      });

      // Should handle ML errors gracefully or propagate appropriately
      await expect(
        demandForecastingService.generateDemandForecast('product123')
      ).rejects.toThrow();
    });
  });

  describe('caching behavior', () => {
    test('should use appropriate cache keys', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
      (Product.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockProduct)
      });

      await demandForecastingService.generateDemandForecast('product123', {
        periodType: 'weekly',
        periodsAhead: 8,
        modelType: 'linear'
      });

      expect(optimizedCache.get).toHaveBeenCalledWith(
        'demand_forecast:product123:weekly:8:linear'
      );
    });

    test('should clear model cache when updating', async () => {
      await demandForecastingService.updateModel('product123', []);

      expect(optimizedCache.deletePattern).toHaveBeenCalledWith(
        'demand_forecast:product123:*'
      );
    });
  });
});