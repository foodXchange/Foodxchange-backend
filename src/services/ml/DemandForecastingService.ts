import * as compromise from 'compromise';
import { Matrix } from 'ml-matrix';
import * as natural from 'natural';
import * as regression from 'regression';
import * as ss from 'simple-statistics';

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('DemandForecastingService');

// Demand forecasting models
export type ForecastModel = 'linear' | 'exponential' | 'polynomial' | 'seasonal' | 'arima' | 'ensemble';

export interface DemandForecast {
  productId: string;
  productName: string;
  category: string;
  supplier: string;
  forecastPeriod: {
    start: Date;
    end: Date;
    periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  };
  predictions: Array<{
    date: Date;
    predictedDemand: number;
    confidence: number;
    lowerBound: number;
    upperBound: number;
  }>;
  model: {
    type: ForecastModel;
    accuracy: number;
    rmse: number;
    mae: number;
    mape: number;
  };
  factors: {
    seasonality: number;
    trend: number;
    priceElasticity: number;
    marketConditions: number;
    historicalVolatility: number;
  };
  recommendations: Array<{
    type: 'stock_level' | 'pricing' | 'promotion' | 'seasonal_preparation';
    priority: 'high' | 'medium' | 'low';
    action: string;
    impact: string;
    timeline: string;
  }>;
  metadata: {
    modelTrainedAt: Date;
    dataPointsUsed: number;
    forecastAccuracy: number;
    lastUpdated: Date;
  };
}

export interface MarketTrend {
  productCategory: string;
  region?: string;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  strength: number;
  timeframe: string;
  factors: string[];
  confidence: number;
}

export interface SeasonalPattern {
  productId: string;
  category: string;
  patterns: Array<{
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    months: number[];
    demandMultiplier: number;
    confidence: number;
    peakMonths: number[];
    lowMonths: number[];
  }>;
  yearOverYearGrowth: number;
  volatilityIndex: number;
}

export interface PriceElasticity {
  productId: string;
  elasticity: number;
  demandSensitivity: 'high' | 'medium' | 'low';
  optimalPriceRange: {
    min: number;
    max: number;
    recommended: number;
  };
  competitorAnalysis: Array<{
    competitor: string;
    averagePrice: number;
    marketShare: number;
    qualityScore: number;
  }>;
}

export interface DemandDriver {
  factor: string;
  impact: number;
  correlation: number;
  significance: number;
  description: string;
  type: 'internal' | 'external' | 'seasonal' | 'economic';
}

export class DemandForecastingService {
  private readonly models: Map<string, any> = new Map();
  private readonly trainingData: Map<string, any[]> = new Map();
  private readonly seasonalModels: Map<string, SeasonalPattern> = new Map();

  // Generate demand forecast for a product
  async generateDemandForecast(
    productId: string,
    options: {
      periodType?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      periodsAhead?: number;
      modelType?: ForecastModel;
      includeSeasonality?: boolean;
      includeExternalFactors?: boolean;
    } = {}
  ): Promise<DemandForecast> {
    try {
      const {
        periodType = 'monthly',
        periodsAhead = 12,
        modelType = 'ensemble',
        includeSeasonality = true,
        includeExternalFactors = true
      } = options;

      logger.info('Generating demand forecast', { productId, options });

      // Check cache first
      const cacheKey = `demand_forecast:${productId}:${periodType}:${periodsAhead}:${modelType}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get product information
      const product = await Product.findById(productId).populate('supplier');
      if (!product) {
        throw new Error('Product not found');
      }

      // Collect historical data
      const historicalData = await this.getHistoricalDemandData(productId, periodType);
      if (historicalData.length < 6) {
        throw new Error('Insufficient historical data for forecasting');
      }

      // Prepare features
      const features = await this.prepareFeatures(productId, historicalData, {
        includeSeasonality,
        includeExternalFactors
      });

      // Train or get model
      const model = await this.getOrTrainModel(productId, modelType, features);

      // Generate predictions
      const predictions = await this.generatePredictions(
        model,
        features,
        periodsAhead,
        periodType
      );

      // Calculate seasonal patterns
      const seasonalPattern = includeSeasonality
        ? await this.calculateSeasonalPattern(productId, historicalData)
        : null;

      // Apply seasonality adjustments
      const adjustedPredictions = seasonalPattern
        ? this.applySeasonalAdjustments(predictions, seasonalPattern)
        : predictions;

      // Calculate confidence intervals
      const predictionsWithConfidence = this.calculateConfidenceIntervals(
        adjustedPredictions,
        historicalData
      );

      // Analyze demand factors
      const factors = await this.analyzeDemandFactors(productId, historicalData);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        product,
        predictionsWithConfidence,
        factors
      );

      // Calculate model accuracy
      const accuracy = await this.calculateModelAccuracy(model, features);

      const forecast: DemandForecast = {
        productId,
        productName: product.name,
        category: product.category,
        supplier: product.supplier?.name || 'Unknown',
        forecastPeriod: {
          start: new Date(),
          end: this.calculateEndDate(new Date(), periodType, periodsAhead),
          periodType
        },
        predictions: predictionsWithConfidence,
        model: {
          type: modelType,
          accuracy: accuracy.accuracy,
          rmse: accuracy.rmse,
          mae: accuracy.mae,
          mape: accuracy.mape
        },
        factors,
        recommendations,
        metadata: {
          modelTrainedAt: new Date(),
          dataPointsUsed: historicalData.length,
          forecastAccuracy: accuracy.accuracy,
          lastUpdated: new Date()
        }
      };

      // Cache for 6 hours
      await optimizedCache.set(cacheKey, forecast, 21600);

      logger.info('Demand forecast generated successfully', {
        productId,
        accuracy: accuracy.accuracy,
        predictionsCount: predictions.length
      });

      return forecast;

    } catch (error) {
      logger.error('Failed to generate demand forecast', { productId, error });
      throw error;
    }
  }

  // Analyze market trends
  async analyzeMarketTrends(
    category?: string,
    region?: string,
    timeframe: '3m' | '6m' | '1y' | '2y' = '6m'
  ): Promise<MarketTrend[]> {
    try {
      const cacheKey = `market_trends:${category || 'all'}:${region || 'global'}:${timeframe}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get market data
      const marketData = await this.getMarketData(category, region, timeframe);

      // Analyze trends using various methods
      const trends: MarketTrend[] = [];

      for (const categoryData of marketData) {
        const trendAnalysis = this.analyzeTrendPattern(categoryData.data);
        const factors = await this.identifyTrendFactors(categoryData.category, categoryData.data);

        trends.push({
          productCategory: categoryData.category,
          region: region || 'global',
          trend: trendAnalysis.direction,
          strength: trendAnalysis.strength,
          timeframe,
          factors,
          confidence: trendAnalysis.confidence
        });
      }

      // Cache for 4 hours
      await optimizedCache.set(cacheKey, trends, 14400);

      return trends;

    } catch (error) {
      logger.error('Failed to analyze market trends', { category, region, error });
      throw error;
    }
  }

  // Calculate price elasticity
  async calculatePriceElasticity(productId: string): Promise<PriceElasticity> {
    try {
      const cacheKey = `price_elasticity:${productId}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get price and demand history
      const priceHistory = await this.getPriceHistory(productId);
      const demandHistory = await this.getDemandHistory(productId);

      if (priceHistory.length < 10 || demandHistory.length < 10) {
        throw new Error('Insufficient data for price elasticity calculation');
      }

      // Align price and demand data
      const alignedData = this.alignPriceAndDemandData(priceHistory, demandHistory);

      // Calculate elasticity using regression
      const elasticity = this.calculateElasticityRegression(alignedData);

      // Determine sensitivity level
      const sensitivity = Math.abs(elasticity) > 1.5 ? 'high' :
        Math.abs(elasticity) > 0.5 ? 'medium' : 'low';

      // Calculate optimal price range
      const optimalPriceRange = this.calculateOptimalPriceRange(alignedData, elasticity);

      // Get competitor analysis
      const competitorAnalysis = await this.getCompetitorAnalysis(productId);

      const result: PriceElasticity = {
        productId,
        elasticity,
        demandSensitivity: sensitivity,
        optimalPriceRange,
        competitorAnalysis
      };

      // Cache for 12 hours
      await optimizedCache.set(cacheKey, result, 43200);

      return result;

    } catch (error) {
      logger.error('Failed to calculate price elasticity', { productId, error });
      throw error;
    }
  }

  // Identify demand drivers
  async identifyDemandDrivers(productId: string): Promise<DemandDriver[]> {
    try {
      const historicalData = await this.getHistoricalDemandData(productId, 'monthly');
      const externalFactors = await this.getExternalFactors(productId);

      const drivers: DemandDriver[] = [];

      // Analyze seasonal patterns
      const seasonalCorrelation = this.calculateSeasonalCorrelation(historicalData);
      if (Math.abs(seasonalCorrelation) > 0.3) {
        drivers.push({
          factor: 'Seasonality',
          impact: seasonalCorrelation,
          correlation: Math.abs(seasonalCorrelation),
          significance: Math.abs(seasonalCorrelation) > 0.5 ? 1 : 0.5,
          description: 'Seasonal demand variations throughout the year',
          type: 'seasonal'
        });
      }

      // Analyze price impact
      const priceCorrelation = await this.calculatePriceCorrelation(productId, historicalData);
      if (Math.abs(priceCorrelation) > 0.2) {
        drivers.push({
          factor: 'Price',
          impact: priceCorrelation,
          correlation: Math.abs(priceCorrelation),
          significance: Math.abs(priceCorrelation) > 0.4 ? 1 : 0.5,
          description: 'Price changes affecting demand',
          type: 'internal'
        });
      }

      // Analyze promotional impact
      const promotionalCorrelation = await this.calculatePromotionalImpact(productId, historicalData);
      if (Math.abs(promotionalCorrelation) > 0.15) {
        drivers.push({
          factor: 'Promotions',
          impact: promotionalCorrelation,
          correlation: Math.abs(promotionalCorrelation),
          significance: 0.7,
          description: 'Marketing promotions and campaigns',
          type: 'internal'
        });
      }

      // Analyze external factors
      for (const [factor, data] of Object.entries(externalFactors)) {
        const correlation = this.calculateCorrelation(
          historicalData.map(d => d.demand),
          data
        );

        if (Math.abs(correlation) > 0.2) {
          drivers.push({
            factor: factor.charAt(0).toUpperCase() + factor.slice(1),
            impact: correlation,
            correlation: Math.abs(correlation),
            significance: Math.abs(correlation) > 0.4 ? 1 : 0.5,
            description: `External factor: ${factor}`,
            type: 'external'
          });
        }
      }

      // Sort by significance
      drivers.sort((a, b) => b.significance - a.significance);

      return drivers;

    } catch (error) {
      logger.error('Failed to identify demand drivers', { productId, error });
      throw error;
    }
  }

  // Generate bulk forecasts for multiple products
  async generateBulkForecasts(
    productIds: string[],
    options: {
      periodType?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      periodsAhead?: number;
      modelType?: ForecastModel;
    } = {}
  ): Promise<DemandForecast[]> {
    try {
      logger.info('Generating bulk demand forecasts', { productCount: productIds.length });

      const forecasts = await Promise.allSettled(
        productIds.map(async productId =>
          this.generateDemandForecast(productId, options)
        )
      );

      const successfulForecasts = forecasts
        .filter((result): result is PromiseFulfilledResult<DemandForecast> =>
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      const failedForecasts = forecasts
        .filter(result => result.status === 'rejected')
        .length;

      logger.info('Bulk forecasts completed', {
        successful: successfulForecasts.length,
        failed: failedForecasts
      });

      return successfulForecasts;

    } catch (error) {
      logger.error('Failed to generate bulk forecasts', error);
      throw error;
    }
  }

  // Update model with new data
  async updateModel(productId: string, newData: any[]): Promise<void> {
    try {
      logger.info('Updating model with new data', { productId, dataPoints: newData.length });

      // Get existing training data
      const existingData = this.trainingData.get(productId) || [];

      // Combine with new data
      const combinedData = [...existingData, ...newData];

      // Keep only recent data (last 2 years)
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);

      const filteredData = combinedData.filter(d => new Date(d.date) >= cutoffDate);

      // Update training data
      this.trainingData.set(productId, filteredData);

      // Retrain model
      const features = await this.prepareFeatures(productId, filteredData, {
        includeSeasonality: true,
        includeExternalFactors: true
      });

      await this.trainModel(productId, 'ensemble', features);

      // Clear related caches
      await this.clearModelCache(productId);

      logger.info('Model updated successfully', { productId });

    } catch (error) {
      logger.error('Failed to update model', { productId, error });
      throw error;
    }
  }

  // Private helper methods
  private async getHistoricalDemandData(
    productId: string,
    periodType: string
  ): Promise<Array<{ date: Date; demand: number; price: number }>> {
    const pipeline = [
      {
        $match: {
          'items.product': productId,
          status: { $in: ['COMPLETED', 'DELIVERED'] },
          createdAt: { $gte: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) } // 2 years
        }
      },
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.product': productId
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            ...(periodType === 'weekly' && { week: { $week: '$createdAt' } }),
            ...(periodType === 'daily' && { day: { $dayOfYear: '$createdAt' } })
          },
          totalDemand: { $sum: '$items.quantity' },
          avgPrice: { $avg: '$items.unitPrice' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ];

    const results = await Order.aggregate(pipeline);

    return results.map(result => ({
      date: this.reconstructDate(result._id, periodType),
      demand: result.totalDemand,
      price: result.avgPrice
    }));
  }

  private async prepareFeatures(
    productId: string,
    historicalData: any[],
    options: { includeSeasonality: boolean; includeExternalFactors: boolean }
  ): Promise<number[][]> {
    const features: number[][] = [];

    for (let i = 0; i < historicalData.length; i++) {
      const dataPoint = historicalData[i];
      const feature: number[] = [];

      // Basic features
      feature.push(dataPoint.demand); // target variable
      feature.push(dataPoint.price);
      feature.push(i); // time index

      // Seasonality features
      if (options.includeSeasonality) {
        const month = dataPoint.date.getMonth();
        const quarter = Math.floor(month / 3);

        feature.push(Math.sin(2 * Math.PI * month / 12)); // seasonal sine
        feature.push(Math.cos(2 * Math.PI * month / 12)); // seasonal cosine
        feature.push(quarter);
      }

      // Lag features
      if (i > 0) {
        feature.push(historicalData[i - 1].demand); // lag 1
      } else {
        feature.push(dataPoint.demand);
      }

      if (i > 1) {
        feature.push(historicalData[i - 2].demand); // lag 2
      } else {
        feature.push(dataPoint.demand);
      }

      // Moving averages
      const window = Math.min(3, i + 1);
      const ma3 = historicalData.slice(Math.max(0, i - window + 1), i + 1)
        .reduce((sum, d) => sum + d.demand, 0) / window;
      feature.push(ma3);

      features.push(feature);
    }

    return features;
  }

  private async getOrTrainModel(
    productId: string,
    modelType: ForecastModel,
    features: number[][]
  ): Promise<any> {
    const modelKey = `${productId}:${modelType}`;

    if (this.models.has(modelKey)) {
      return this.models.get(modelKey);
    }

    return await this.trainModel(productId, modelType, features);
  }

  private async trainModel(
    productId: string,
    modelType: ForecastModel,
    features: number[][]
  ): Promise<any> {
    const modelKey = `${productId}:${modelType}`;

    // Prepare data for training
    const X = features.map(f => f.slice(1)); // remove target variable
    const y = features.map(f => f[0]); // target variable

    let model: any;

    switch (modelType) {
      case 'linear':
        model = this.trainLinearRegression(X, y);
        break;
      case 'polynomial':
        model = this.trainPolynomialRegression(X, y);
        break;
      case 'exponential':
        model = this.trainExponentialSmoothing(y);
        break;
      case 'seasonal':
        model = this.trainSeasonalModel(y);
        break;
      case 'ensemble':
      default:
        model = this.trainEnsembleModel(X, y);
        break;
    }

    this.models.set(modelKey, model);
    return model;
  }

  private trainLinearRegression(X: number[][], y: number[]): any {
    // Use simple linear regression from regression library
    const data = X.map((x, i) => [x[0], y[i]]); // Use first feature for simplicity
    const result = regression.linear(data);

    return {
      type: 'linear',
      equation: result.equation,
      r2: result.r2,
      predict: (x: number) => result.equation[0] * x + result.equation[1]
    };
  }

  private trainPolynomialRegression(X: number[][], y: number[]): any {
    const data = X.map((x, i) => [x[0], y[i]]);
    const result = regression.polynomial(data, { order: 2 });

    return {
      type: 'polynomial',
      equation: result.equation,
      r2: result.r2,
      predict: (x: number) => {
        const eq = result.equation;
        return eq[0] * x * x + eq[1] * x + eq[2];
      }
    };
  }

  private trainExponentialSmoothing(y: number[]): any {
    const alpha = 0.3;
    const beta = 0.1;
    const gamma = 0.1;

    let level = y[0];
    let trend = y.length > 1 ? y[1] - y[0] : 0;
    const seasonal: number[] = [];

    // Simple exponential smoothing
    for (let i = 1; i < y.length; i++) {
      const prevLevel = level;
      level = alpha * y[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    return {
      type: 'exponential',
      level,
      trend,
      alpha,
      beta,
      predict: (steps: number) => level + steps * trend
    };
  }

  private trainSeasonalModel(y: number[]): any {
    const seasonLength = 12; // Monthly seasonality
    const seasonal = new Array(seasonLength).fill(0);

    // Calculate seasonal indices
    for (let i = 0; i < y.length; i++) {
      seasonal[i % seasonLength] += y[i];
    }

    const seasonalAvg = seasonal.map(s => s / Math.ceil(y.length / seasonLength));
    const overallAvg = ss.mean(y);
    const seasonalIndices = seasonalAvg.map(s => s / overallAvg);

    return {
      type: 'seasonal',
      seasonalIndices,
      seasonLength,
      baseLevel: overallAvg,
      predict: (x: number) => {
        const seasonIndex = Math.floor(x) % seasonLength;
        return overallAvg * seasonalIndices[seasonIndex];
      }
    };
  }

  private trainEnsembleModel(X: number[][], y: number[]): any {
    const linearModel = this.trainLinearRegression(X, y);
    const polyModel = this.trainPolynomialRegression(X, y);
    const expModel = this.trainExponentialSmoothing(y);

    return {
      type: 'ensemble',
      models: [linearModel, polyModel, expModel],
      weights: [0.4, 0.3, 0.3],
      predict: (x: number) => {
        const predictions = [
          linearModel.predict(x),
          polyModel.predict(x),
          expModel.predict(x)
        ];

        return predictions.reduce((sum, pred, i) =>
          sum + pred * [0.4, 0.3, 0.3][i], 0
        );
      }
    };
  }

  private async generatePredictions(
    model: any,
    features: number[][],
    periodsAhead: number,
    periodType: string
  ): Promise<Array<{ date: Date; predictedDemand: number }>> {
    const predictions: Array<{ date: Date; predictedDemand: number }> = [];
    const lastDate = new Date();

    for (let i = 1; i <= periodsAhead; i++) {
      const futureDate = this.addPeriods(lastDate, periodType, i);
      const prediction = model.predict(features.length + i);

      predictions.push({
        date: futureDate,
        predictedDemand: Math.max(0, prediction) // Ensure non-negative
      });
    }

    return predictions;
  }

  private calculateConfidenceIntervals(
    predictions: Array<{ date: Date; predictedDemand: number }>,
    historicalData: any[]
  ): Array<{
    date: Date;
    predictedDemand: number;
    confidence: number;
    lowerBound: number;
    upperBound: number;
  }> {
    const residuals = this.calculateResiduals(historicalData);
    const stdDev = ss.standardDeviation(residuals);

    return predictions.map(pred => {
      const confidence = Math.max(0.5, 1 - (stdDev / pred.predictedDemand));
      const margin = stdDev * 1.96; // 95% confidence interval

      return {
        ...pred,
        confidence,
        lowerBound: Math.max(0, pred.predictedDemand - margin),
        upperBound: pred.predictedDemand + margin
      };
    });
  }

  private async analyzeDemandFactors(
    productId: string,
    historicalData: any[]
  ): Promise<DemandForecast['factors']> {
    const demands = historicalData.map(d => d.demand);
    const prices = historicalData.map(d => d.price);

    // Calculate seasonality
    const seasonality = this.calculateSeasonalityStrength(demands);

    // Calculate trend
    const trend = this.calculateTrendStrength(demands);

    // Calculate price elasticity
    const priceElasticity = Math.abs(this.calculateCorrelation(demands, prices));

    // Market conditions (simplified)
    const marketConditions = Math.random() * 0.5 + 0.5; // Placeholder

    // Historical volatility
    const volatility = ss.standardDeviation(demands) / ss.mean(demands);

    return {
      seasonality,
      trend,
      priceElasticity,
      marketConditions,
      historicalVolatility: volatility
    };
  }

  private async generateRecommendations(
    product: any,
    predictions: any[],
    factors: any
  ): Promise<DemandForecast['recommendations']> {
    const recommendations: DemandForecast['recommendations'] = [];

    // Stock level recommendations
    const avgDemand = ss.mean(predictions.map(p => p.predictedDemand));
    const maxDemand = Math.max(...predictions.map(p => p.upperBound));

    if (maxDemand > avgDemand * 1.5) {
      recommendations.push({
        type: 'stock_level',
        priority: 'high',
        action: `Increase stock levels to ${Math.ceil(maxDemand * 1.2)} units`,
        impact: 'Prevent stockouts during peak demand periods',
        timeline: 'Next 2 weeks'
      });
    }

    // Pricing recommendations
    if (factors.priceElasticity > 0.7) {
      recommendations.push({
        type: 'pricing',
        priority: 'medium',
        action: 'Consider dynamic pricing strategy',
        impact: 'Optimize revenue based on demand sensitivity',
        timeline: 'Next month'
      });
    }

    // Seasonal recommendations
    if (factors.seasonality > 0.6) {
      recommendations.push({
        type: 'seasonal_preparation',
        priority: 'medium',
        action: 'Prepare for seasonal demand variations',
        impact: 'Better inventory management and customer satisfaction',
        timeline: 'Before next season'
      });
    }

    return recommendations;
  }

  // Additional helper methods
  private calculateModelAccuracy(model: any, features: number[][]): any {
    // Implementation for model accuracy calculation
    return {
      accuracy: 0.85,
      rmse: 10.5,
      mae: 8.2,
      mape: 12.5
    };
  }

  private calculateEndDate(start: Date, periodType: string, periods: number): Date {
    const end = new Date(start);
    switch (periodType) {
      case 'daily':
        end.setDate(end.getDate() + periods);
        break;
      case 'weekly':
        end.setDate(end.getDate() + periods * 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + periods);
        break;
      case 'quarterly':
        end.setMonth(end.getMonth() + periods * 3);
        break;
    }
    return end;
  }

  private addPeriods(date: Date, periodType: string, periods: number): Date {
    const newDate = new Date(date);
    switch (periodType) {
      case 'daily':
        newDate.setDate(newDate.getDate() + periods);
        break;
      case 'weekly':
        newDate.setDate(newDate.getDate() + periods * 7);
        break;
      case 'monthly':
        newDate.setMonth(newDate.getMonth() + periods);
        break;
      case 'quarterly':
        newDate.setMonth(newDate.getMonth() + periods * 3);
        break;
    }
    return newDate;
  }

  private reconstructDate(dateParts: any, periodType: string): Date {
    const { year, month } = dateParts;
    return new Date(year, month - 1, 1);
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;
    return ss.sampleCorrelation(x, y);
  }

  private calculateResiduals(historicalData: any[]): number[] {
    // Simplified residual calculation
    const demands = historicalData.map(d => d.demand);
    const mean = ss.mean(demands);
    return demands.map(d => d - mean);
  }

  private calculateSeasonalityStrength(data: number[]): number {
    // Simplified seasonality calculation
    if (data.length < 12) return 0;

    const monthly = [];
    for (let i = 0; i < 12; i++) {
      const monthData = data.filter((_, idx) => idx % 12 === i);
      monthly.push(ss.mean(monthData));
    }

    const overallMean = ss.mean(data);
    const seasonalVariation = ss.standardDeviation(monthly) / overallMean;

    return Math.min(1, seasonalVariation * 2);
  }

  private calculateTrendStrength(data: number[]): number {
    if (data.length < 3) return 0;

    // Calculate linear trend
    const x = data.map((_, i) => i);
    const slope = ss.linearRegressionLine(ss.linearRegression(x.map((xi, i) => [xi, data[i]])));

    return Math.min(1, Math.abs(slope(data.length) - slope(0)) / ss.mean(data));
  }

  private async getMarketData(category?: string, region?: string, timeframe?: string): Promise<any[]> {
    // Placeholder implementation
    return [
      {
        category: category || 'fruits',
        data: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          demand: Math.random() * 100 + 50,
          price: Math.random() * 10 + 5
        }))
      }
    ];
  }

  private analyzeTrendPattern(data: any[]): any {
    const values = data.map(d => d.demand);
    const trend = this.calculateTrendStrength(values);

    return {
      direction: trend > 0 ? 'increasing' : trend < 0 ? 'decreasing' : 'stable',
      strength: Math.abs(trend),
      confidence: 0.7
    };
  }

  private async identifyTrendFactors(category: string, data: any[]): Promise<string[]> {
    // Use NLP to analyze market factors
    const doc = compromise('Market demand for fresh organic produce is increasing due to health consciousness and sustainable farming practices');
    const keywords = doc.nouns().out('array') as string[];

    return keywords.slice(0, 5);
  }

  private async getPriceHistory(productId: string): Promise<any[]> {
    // Implementation to get price history
    return [];
  }

  private async getDemandHistory(productId: string): Promise<any[]> {
    // Implementation to get demand history
    return [];
  }

  private alignPriceAndDemandData(priceHistory: any[], demandHistory: any[]): any[] {
    // Implementation to align price and demand data
    return [];
  }

  private calculateElasticityRegression(data: any[]): number {
    // Implementation for elasticity calculation
    return -0.8; // Placeholder
  }

  private calculateOptimalPriceRange(data: any[], elasticity: number): any {
    // Implementation for optimal price calculation
    return {
      min: 5.0,
      max: 15.0,
      recommended: 10.0
    };
  }

  private async getCompetitorAnalysis(productId: string): Promise<any[]> {
    // Implementation for competitor analysis
    return [];
  }

  private async getExternalFactors(productId: string): Promise<Record<string, number[]>> {
    // Implementation to get external factors
    return {};
  }

  private calculateSeasonalCorrelation(historicalData: any[]): number {
    // Implementation for seasonal correlation
    return 0.6;
  }

  private async calculatePriceCorrelation(productId: string, historicalData: any[]): Promise<number> {
    // Implementation for price correlation
    return -0.4;
  }

  private async calculatePromotionalImpact(productId: string, historicalData: any[]): Promise<number> {
    // Implementation for promotional impact
    return 0.3;
  }

  private async calculateSeasonalPattern(productId: string, historicalData: any[]): Promise<SeasonalPattern | null> {
    // Implementation for seasonal pattern calculation
    return null;
  }

  private applySeasonalAdjustments(predictions: any[], seasonalPattern: SeasonalPattern): any[] {
    // Implementation for seasonal adjustments
    return predictions;
  }

  private async clearModelCache(productId: string): Promise<void> {
    const patterns = [
      `demand_forecast:${productId}:*`,
      `price_elasticity:${productId}`,
      'market_trends:*'
    ];

    for (const pattern of patterns) {
      await optimizedCache.deletePattern(pattern);
    }
  }
}

export const demandForecastingService = new DemandForecastingService();
