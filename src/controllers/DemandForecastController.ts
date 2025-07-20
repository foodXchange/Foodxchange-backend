import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { Company } from '../models/Company';
import { Product } from '../models/Product';
import { optimizedCache } from '../services/cache/OptimizedCacheService';
import { demandForecastingService, ForecastModel } from '../services/ml/DemandForecastingService';

const logger = new Logger('DemandForecastController');

type ForecastRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    company?: string;
    companyId?: string;
  };
};

export class DemandForecastController {

  // Generate demand forecast for a specific product
  async generateProductForecast(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      const {
        periodType = 'monthly',
        periodsAhead = 12,
        modelType = 'ensemble',
        includeSeasonality = true,
        includeExternalFactors = true
      } = req.query;

      // Validate product exists and user has access
      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      // Check access permissions
      if (!this.hasProductAccess(req.user, product)) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this product'
        });
        return;
      }

      const forecast = await demandForecastingService.generateDemandForecast(productId, {
        periodType: periodType as 'daily' | 'weekly' | 'monthly' | 'quarterly',
        periodsAhead: parseInt(periodsAhead as string),
        modelType: modelType as ForecastModel,
        includeSeasonality: includeSeasonality === 'true',
        includeExternalFactors: includeExternalFactors === 'true'
      });

      res.json({
        success: true,
        data: forecast
      });

    } catch (error) {
      logger.error('Failed to generate product forecast', {
        productId: req.params.productId,
        error
      });

      if (error.message === 'Insufficient historical data for forecasting') {
        res.status(400).json({
          success: false,
          message: 'Not enough historical data available for accurate forecasting'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to generate demand forecast'
        });
      }
    }
  }

  // Generate forecasts for multiple products
  async generateBulkForecasts(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productIds } = req.body;
      const {
        periodType = 'monthly',
        periodsAhead = 12,
        modelType = 'ensemble'
      } = req.query;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Product IDs array is required'
        });
        return;
      }

      if (productIds.length > 50) {
        res.status(400).json({
          success: false,
          message: 'Maximum 50 products allowed per bulk request'
        });
        return;
      }

      // Validate all products exist and user has access
      const products = await Product.find({ _id: { $in: productIds } });
      const accessibleProducts = products.filter(product =>
        this.hasProductAccess(req.user, product)
      );

      if (accessibleProducts.length === 0) {
        res.status(403).json({
          success: false,
          message: 'No accessible products found'
        });
        return;
      }

      const accessibleProductIds = accessibleProducts.map(p => p._id.toString());

      const forecasts = await demandForecastingService.generateBulkForecasts(
        accessibleProductIds,
        {
          periodType: periodType as 'daily' | 'weekly' | 'monthly' | 'quarterly',
          periodsAhead: parseInt(periodsAhead as string),
          modelType: modelType as ForecastModel
        }
      );

      res.json({
        success: true,
        data: {
          forecasts,
          summary: {
            requested: productIds.length,
            accessible: accessibleProductIds.length,
            successful: forecasts.length,
            failed: accessibleProductIds.length - forecasts.length
          }
        }
      });

    } catch (error) {
      logger.error('Failed to generate bulk forecasts', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate bulk forecasts'
      });
    }
  }

  // Analyze market trends
  async analyzeMarketTrends(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const {
        category,
        region,
        timeframe = '6m'
      } = req.query;

      const cacheKey = `market_trends_api:${category || 'all'}:${region || 'global'}:${timeframe}`;

      // Try cache first
      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      const trends = await demandForecastingService.analyzeMarketTrends(
        category as string,
        region as string,
        timeframe as '3m' | '6m' | '1y' | '2y'
      );

      const result = {
        trends,
        metadata: {
          analyzedAt: new Date(),
          timeframe,
          trendsCount: trends.length,
          averageConfidence: trends.reduce((sum, t) => sum + t.confidence, 0) / trends.length
        }
      };

      // Cache for 2 hours
      await optimizedCache.set(cacheKey, result, { ttl: 7200 });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Failed to analyze market trends', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze market trends'
      });
    }
  }

  // Calculate price elasticity
  async calculatePriceElasticity(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;

      // Validate product exists and user has access
      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      if (!this.hasProductAccess(req.user, product)) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this product'
        });
        return;
      }

      const elasticity = await demandForecastingService.calculatePriceElasticity(productId);

      res.json({
        success: true,
        data: {
          ...elasticity,
          interpretation: this.interpretElasticity(elasticity.elasticity),
          recommendations: this.generatePricingRecommendations(elasticity)
        }
      });

    } catch (error) {
      logger.error('Failed to calculate price elasticity', { productId: req.params.productId, error });

      if (error.message === 'Insufficient data for price elasticity calculation') {
        res.status(400).json({
          success: false,
          message: 'Not enough price and demand data for elasticity calculation'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to calculate price elasticity'
        });
      }
    }
  }

  // Identify demand drivers
  async identifyDemandDrivers(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;

      // Validate product exists and user has access
      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      if (!this.hasProductAccess(req.user, product)) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this product'
        });
        return;
      }

      const drivers = await demandForecastingService.identifyDemandDrivers(productId);

      res.json({
        success: true,
        data: {
          productId,
          productName: product.name,
          drivers,
          summary: {
            totalDrivers: drivers.length,
            significantDrivers: drivers.filter(d => d.significance >= 0.7).length,
            topDriver: drivers[0]?.factor || 'None identified',
            analysisDate: new Date()
          }
        }
      });

    } catch (error) {
      logger.error('Failed to identify demand drivers', { productId: req.params.productId, error });
      res.status(500).json({
        success: false,
        message: 'Failed to identify demand drivers'
      });
    }
  }

  // Get company forecasting dashboard
  async getCompanyDashboard(req: ForecastRequest, res: Response): Promise<void> {
    try {
      if (!req.user?.companyId) {
        res.status(400).json({
          success: false,
          message: 'Company association required'
        });
        return;
      }

      const cacheKey = `forecast_dashboard:${req.user.companyId}`;

      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      // Get company products
      const products = await Product.find({ supplier: req.user.companyId })
        .select('_id name category')
        .limit(20)
        .lean();

      if (products.length === 0) {
        res.json({
          success: true,
          data: {
            message: 'No products found for forecasting',
            summary: { productCount: 0 }
          }
        });
        return;
      }

      // Generate forecasts for top products
      const productIds = products.map(p => p._id.toString());
      const forecasts = await demandForecastingService.generateBulkForecasts(
        productIds.slice(0, 10), // Limit to 10 for dashboard
        { periodType: 'monthly', periodsAhead: 6 }
      );

      // Analyze trends for company's categories
      const categories = [...new Set(products.map(p => p.category))];
      const trendPromises = categories.slice(0, 5).map(async category =>
        demandForecastingService.analyzeMarketTrends(category, undefined, '6m')
      );
      const categoryTrends = await Promise.all(trendPromises);

      // Calculate summary metrics
      const totalPredictedDemand = forecasts.reduce((sum, forecast) =>
        sum + forecast.predictions.reduce((predSum, pred) => predSum + pred.predictedDemand, 0), 0
      );

      const avgAccuracy = forecasts.reduce((sum, forecast) =>
        sum + forecast.model.accuracy, 0) / forecasts.length;

      const dashboard = {
        company: {
          productCount: products.length,
          forecastedProducts: forecasts.length,
          categories: categories.length
        },
        forecasts: forecasts.slice(0, 5), // Top 5 for dashboard
        trends: categoryTrends.flat(),
        summary: {
          totalPredictedDemand: Math.round(totalPredictedDemand),
          averageAccuracy: Math.round(avgAccuracy * 100) / 100,
          forecastPeriod: '6 months',
          lastUpdated: new Date()
        },
        recommendations: this.generateCompanyRecommendations(forecasts)
      };

      // Cache for 4 hours
      await optimizedCache.set(cacheKey, dashboard, { ttl: 14400 });

      res.json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      logger.error('Failed to get company dashboard', { companyId: req.user?.companyId, error });
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve forecasting dashboard'
      });
    }
  }

  // Update model with new data
  async updateModel(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      const { data } = req.body;

      // Validate product exists and user has access
      const product = await Product.findById(productId);
      if (!product) {
        res.status(404).json({
          success: false,
          message: 'Product not found'
        });
        return;
      }

      if (!this.hasProductAccess(req.user, product)) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update this model'
        });
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Training data array is required'
        });
        return;
      }

      await demandForecastingService.updateModel(productId, data);

      res.json({
        success: true,
        message: 'Model updated successfully',
        data: {
          productId,
          dataPointsAdded: data.length,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Failed to update model', { productId: req.params.productId, error });
      res.status(500).json({
        success: false,
        message: 'Failed to update model'
      });
    }
  }

  // Get forecasting analytics and insights
  async getForecastingAnalytics(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const {
        timeframe = '6m',
        category,
        region
      } = req.query;

      const cacheKey = `forecasting_analytics:${timeframe}:${category || 'all'}:${region || 'global'}`;

      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      // Get market trends
      const trends = await demandForecastingService.analyzeMarketTrends(
        category as string,
        region as string,
        timeframe as '3m' | '6m' | '1y' | '2y'
      );

      // Analyze trend patterns
      const trendAnalysis = this.analyzeTrendPatterns(trends);

      // Get industry insights
      const insights = this.generateIndustryInsights(trends);

      const analytics = {
        overview: {
          timeframe,
          category: category || 'All Categories',
          region: region || 'Global',
          trendsAnalyzed: trends.length,
          analysisDate: new Date()
        },
        trends,
        analysis: trendAnalysis,
        insights,
        recommendations: this.generateMarketRecommendations(trends, trendAnalysis)
      };

      // Cache for 3 hours
      await optimizedCache.set(cacheKey, analytics, { ttl: 10800 });

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Failed to get forecasting analytics', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve forecasting analytics'
      });
    }
  }

  // Export forecast data
  async exportForecastData(req: ForecastRequest, res: Response): Promise<void> {
    try {
      const { productIds } = req.body;
      const { format = 'json' } = req.query;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Product IDs array is required'
        });
        return;
      }

      // Generate forecasts
      const forecasts = await demandForecastingService.generateBulkForecasts(productIds, {
        periodType: 'monthly',
        periodsAhead: 12
      });

      if (format === 'csv') {
        const csv = this.convertForecastsToCSV(forecasts);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=demand_forecasts.csv');
        res.send(csv);
      } else {
        res.json({
          success: true,
          data: {
            forecasts,
            exportedAt: new Date(),
            format,
            count: forecasts.length
          }
        });
      }

    } catch (error) {
      logger.error('Failed to export forecast data', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export forecast data'
      });
    }
  }

  // Private helper methods
  private hasProductAccess(user: any, product: any): boolean {
    if (!user) return false;

    // Admin can access all products
    if (user.role === 'ADMIN') return true;

    // Supplier can access their own products
    if (user.companyId && product.supplier?.toString() === user.companyId) return true;

    // For now, allow read access to all authenticated users
    // In production, implement proper ACL
    return true;
  }

  private interpretElasticity(elasticity: number): string {
    const absElasticity = Math.abs(elasticity);

    if (absElasticity > 1.5) {
      return 'Highly elastic - demand is very sensitive to price changes';
    } else if (absElasticity > 0.5) {
      return 'Moderately elastic - demand responds to price changes';
    }
    return 'Inelastic - demand is relatively insensitive to price changes';

  }

  private generatePricingRecommendations(elasticity: any): string[] {
    const recommendations: string[] = [];

    if (elasticity.demandSensitivity === 'high') {
      recommendations.push('Consider competitive pricing strategy');
      recommendations.push('Monitor competitor prices closely');
      recommendations.push('Use promotional pricing during low-demand periods');
    } else if (elasticity.demandSensitivity === 'medium') {
      recommendations.push('Implement value-based pricing');
      recommendations.push('Consider seasonal price adjustments');
    } else {
      recommendations.push('Premium pricing strategy may be viable');
      recommendations.push('Focus on quality and brand differentiation');
    }

    return recommendations;
  }

  private generateCompanyRecommendations(forecasts: any[]): any[] {
    const recommendations = [];

    // Analyze forecast patterns
    const highDemandProducts = forecasts.filter(f =>
      f.predictions.some(p => p.confidence > 0.8 && p.predictedDemand > 100)
    );

    if (highDemandProducts.length > 0) {
      recommendations.push({
        type: 'inventory',
        priority: 'high',
        title: 'Increase Stock for High-Demand Products',
        description: `${highDemandProducts.length} products show high predicted demand`,
        products: highDemandProducts.map(p => p.productName).slice(0, 3)
      });
    }

    const lowConfidenceForecasts = forecasts.filter(f => f.model.accuracy < 0.7);

    if (lowConfidenceForecasts.length > 0) {
      recommendations.push({
        type: 'data',
        priority: 'medium',
        title: 'Improve Data Quality',
        description: `${lowConfidenceForecasts.length} products have low forecast accuracy`,
        action: 'Consider collecting more detailed sales data'
      });
    }

    return recommendations;
  }

  private analyzeTrendPatterns(trends: any[]): any {
    const increasing = trends.filter(t => t.trend === 'increasing').length;
    const decreasing = trends.filter(t => t.trend === 'decreasing').length;
    const stable = trends.filter(t => t.trend === 'stable').length;
    const volatile = trends.filter(t => t.trend === 'volatile').length;

    const avgConfidence = trends.reduce((sum, t) => sum + t.confidence, 0) / trends.length;
    const avgStrength = trends.reduce((sum, t) => sum + t.strength, 0) / trends.length;

    return {
      distribution: {
        increasing: increasing / trends.length,
        decreasing: decreasing / trends.length,
        stable: stable / trends.length,
        volatile: volatile / trends.length
      },
      averageConfidence: avgConfidence,
      averageStrength: avgStrength,
      dominant: increasing > decreasing ? 'growth' : decreasing > increasing ? 'decline' : 'stability'
    };
  }

  private generateIndustryInsights(trends: any[]): string[] {
    const insights = [];

    const growthCategories = trends.filter(t => t.trend === 'increasing' && t.strength > 0.6);
    if (growthCategories.length > 0) {
      insights.push(`Strong growth observed in ${growthCategories.length} categories`);
    }

    const volatileCategories = trends.filter(t => t.trend === 'volatile');
    if (volatileCategories.length > trends.length * 0.3) {
      insights.push('Market showing high volatility - consider risk management strategies');
    }

    const highConfidenceTrends = trends.filter(t => t.confidence > 0.8);
    if (highConfidenceTrends.length > trends.length * 0.7) {
      insights.push('Market trends are highly predictable - good environment for planning');
    }

    return insights;
  }

  private generateMarketRecommendations(trends: any[], analysis: any): any[] {
    const recommendations = [];

    if (analysis.dominant === 'growth') {
      recommendations.push({
        type: 'expansion',
        priority: 'high',
        title: 'Market Expansion Opportunity',
        description: 'Overall market growth trend suggests expansion opportunities'
      });
    }

    if (analysis.averageConfidence < 0.6) {
      recommendations.push({
        type: 'monitoring',
        priority: 'medium',
        title: 'Increase Market Monitoring',
        description: 'Low prediction confidence suggests need for closer market monitoring'
      });
    }

    return recommendations;
  }

  private convertForecastsToCSV(forecasts: any[]): string {
    const headers = [
      'Product ID',
      'Product Name',
      'Category',
      'Supplier',
      'Date',
      'Predicted Demand',
      'Confidence',
      'Lower Bound',
      'Upper Bound',
      'Model Type',
      'Model Accuracy'
    ];

    const rows = [headers.join(',')];

    for (const forecast of forecasts) {
      for (const prediction of forecast.predictions) {
        rows.push([
          forecast.productId,
          `"${forecast.productName}"`,
          forecast.category,
          `"${forecast.supplier}"`,
          prediction.date.toISOString().split('T')[0],
          prediction.predictedDemand.toFixed(2),
          prediction.confidence.toFixed(3),
          prediction.lowerBound.toFixed(2),
          prediction.upperBound.toFixed(2),
          forecast.model.type,
          forecast.model.accuracy.toFixed(3)
        ].join(','));
      }
    }

    return rows.join('\n');
  }
}

export const demandForecastController = new DemandForecastController();
