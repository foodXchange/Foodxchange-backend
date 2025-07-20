import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('PredictiveAnalyticsService');

export interface DemandForecast {
  productId: string;
  period: 'WEEK' | 'MONTH' | 'QUARTER';
  predictedDemand: number;
  confidence: number; // 0-1
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  seasonality: number; // -1 to 1
  factors: Array<{
    factor: string;
    impact: number; // -1 to 1
    description: string;
  }>;
  historicalData: Array<{
    period: string;
    actualDemand: number;
  }>;
}

export interface PriceOptimization {
  productId: string;
  currentPrice: number;
  optimizedPrice: number;
  expectedDemandChange: number; // percentage
  expectedRevenueChange: number; // percentage
  priceElasticity: number;
  competitorPrices: Array<{
    competitor: string;
    price: number;
    marketShare: number;
  }>;
  recommendation: {
    action: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
    reason: string;
    confidence: number;
  };
}

export interface MarketTrend {
  category: string;
  trend: 'GROWING' | 'DECLINING' | 'STABLE';
  growthRate: number; // percentage
  marketSize: number;
  keyDrivers: string[];
  threats: string[];
  opportunities: string[];
  forecast: Array<{
    period: string;
    projectedValue: number;
    confidence: number;
  }>;
}

export interface CustomerSegment {
  segmentId: string;
  name: string;
  size: number;
  characteristics: Record<string, any>;
  behavior: {
    avgOrderValue: number;
    orderFrequency: number;
    seasonality: Record<string, number>;
    preferredCategories: string[];
  };
  predictedValue: {
    lifetime: number;
    nextQuarter: number;
    churnRisk: number;
  };
  recommendations: string[];
}

export interface RiskAssessment {
  type: 'SUPPLY' | 'DEMAND' | 'PRICE' | 'QUALITY' | 'REGULATORY';
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  probability: number; // 0-1
  impact: number; // 0-1
  description: string;
  affectedProducts: string[];
  timeframe: string;
  mitigation: Array<{
    action: string;
    cost: number;
    effectiveness: number;
  }>;
}

export class PredictiveAnalyticsService {

  async generateDemandForecast(
    productId: string,
    period: 'WEEK' | 'MONTH' | 'QUARTER',
    periods: number = 4
  ): Promise<DemandForecast> {
    try {
      const cacheKey = `demand_forecast:${productId}:${period}:${periods}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Get historical data
      const historicalData = await this.getHistoricalDemand(productId, period, 24); // 2 years of data

      // Apply time series analysis
      const forecast = this.applyTimeSeriesAnalysis(historicalData, periods);

      // Calculate seasonality
      const seasonality = this.calculateSeasonality(historicalData);

      // Identify trend
      const trend = this.identifyTrend(historicalData);

      // Calculate confidence based on historical accuracy
      const confidence = this.calculateForecastConfidence(historicalData);

      // Identify influencing factors
      const factors = await this.identifyDemandFactors(productId);

      const demandForecast: DemandForecast = {
        productId,
        period,
        predictedDemand: forecast[0]?.value || 0,
        confidence,
        trend,
        seasonality,
        factors,
        historicalData: historicalData.map(item => ({
          period: item.period,
          actualDemand: item.value
        }))
      };

      await optimizedCache.set(cacheKey, demandForecast, { ttl: 7200 }); // 2 hours
      return demandForecast;

    } catch (error) {
      logger.error('Failed to generate demand forecast', error);
      throw error;
    }
  }

  private async getHistoricalDemand(
    productId: string,
    period: 'WEEK' | 'MONTH' | 'QUARTER',
    periods: number
  ): Promise<Array<{ period: string; value: number }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();

      // Calculate start date based on period
      switch (period) {
        case 'WEEK':
          startDate.setDate(endDate.getDate() - (periods * 7));
          break;
        case 'MONTH':
          startDate.setMonth(endDate.getMonth() - periods);
          break;
        case 'QUARTER':
          startDate.setMonth(endDate.getMonth() - (periods * 3));
          break;
      }

      const orders = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['DELIVERED', 'COMPLETED'] }
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.product': productId
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              ...(period === 'WEEK' ? { week: { $week: '$createdAt' } } : {}),
              ...(period === 'MONTH' ? { month: { $month: '$createdAt' } } : {}),
              ...(period === 'QUARTER' ? { quarter: { $ceil: { $divide: [{ $month: '$createdAt' }, 3] } } } : {})
            },
            totalDemand: { $sum: '$items.quantity' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.quarter': 1 } }
      ]);

      return orders.map(item => ({
        period: this.formatPeriod(item._id, period),
        value: item.totalDemand
      }));

    } catch (error) {
      logger.error('Failed to get historical demand', error);
      return [];
    }
  }

  private formatPeriod(id: any, period: 'WEEK' | 'MONTH' | 'QUARTER'): string {
    switch (period) {
      case 'WEEK':
        return `${id.year}-W${id.week}`;
      case 'MONTH':
        return `${id.year}-${id.month.toString().padStart(2, '0')}`;
      case 'QUARTER':
        return `${id.year}-Q${id.quarter}`;
      default:
        return `${id.year}`;
    }
  }

  private applyTimeSeriesAnalysis(
    data: Array<{ period: string; value: number }>,
    forecastPeriods: number
  ): Array<{ period: string; value: number; confidence: number }> {
    // Simplified time series analysis - in production, use libraries like ML-JS or TensorFlow.js

    if (data.length < 3) {
      return [];
    }

    // Simple moving average with trend adjustment
    const windowSize = Math.min(6, data.length);
    const recentData = data.slice(-windowSize);
    const average = recentData.reduce((sum, item) => sum + item.value, 0) / recentData.length;

    // Calculate trend
    const trend = this.calculateLinearTrend(recentData);

    const forecasts = [];
    for (let i = 1; i <= forecastPeriods; i++) {
      const trendAdjustment = trend * i;
      const seasonalAdjustment = this.getSeasonalAdjustment(data, i);

      const predictedValue = Math.max(0, average + trendAdjustment + seasonalAdjustment);
      const confidence = Math.max(0.1, 1 - (i * 0.15)); // Decreasing confidence with distance

      forecasts.push({
        period: `forecast_${i}`,
        value: Math.round(predictedValue),
        confidence
      });
    }

    return forecasts;
  }

  private calculateLinearTrend(data: Array<{ period: string; value: number }>): number {
    if (data.length < 2) return 0;

    const n = data.length;
    const sumX = (n * (n + 1)) / 2; // 1 + 2 + ... + n
    const sumY = data.reduce((sum, item) => sum + item.value, 0);
    const sumXY = data.reduce((sum, item, index) => sum + ((index + 1) * item.value), 0);
    const sumX2 = (n * (n + 1) * (2 * n + 1)) / 6; // 1² + 2² + ... + n²

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private getSeasonalAdjustment(
    data: Array<{ period: string; value: number }>,
    forecastStep: number
  ): number {
    // Simple seasonal adjustment based on historical patterns
    if (data.length < 12) return 0;

    const seasonalPeriod = 12; // Assuming monthly data
    const seasonIndex = (data.length + forecastStep - 1) % seasonalPeriod;

    // Calculate average for this seasonal period
    const seasonalData = data.filter((_, index) => index % seasonalPeriod === seasonIndex);
    const seasonalAverage = seasonalData.reduce((sum, item) => sum + item.value, 0) / seasonalData.length;

    // Calculate overall average
    const overallAverage = data.reduce((sum, item) => sum + item.value, 0) / data.length;

    return seasonalAverage - overallAverage;
  }

  private calculateSeasonality(data: Array<{ period: string; value: number }>): number {
    if (data.length < 12) return 0;

    // Calculate coefficient of variation to measure seasonality
    const values = data.map(item => item.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? Math.min(1, stdDev / mean) : 0;
  }

  private identifyTrend(data: Array<{ period: string; value: number }>): 'INCREASING' | 'DECREASING' | 'STABLE' {
    if (data.length < 3) return 'STABLE';

    const trend = this.calculateLinearTrend(data);
    const threshold = 0.1; // 10% threshold

    if (trend > threshold) return 'INCREASING';
    if (trend < -threshold) return 'DECREASING';
    return 'STABLE';
  }

  private calculateForecastConfidence(data: Array<{ period: string; value: number }>): number {
    // Calculate confidence based on data quality and consistency
    if (data.length < 6) return 0.3;

    const values = data.map(item => item.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

    // Higher consistency = higher confidence
    return Math.max(0.1, Math.min(0.95, 1 - coefficientOfVariation));
  }

  private async identifyDemandFactors(productId: string): Promise<Array<{
    factor: string;
    impact: number;
    description: string;
  }>> {
    // Analyze factors that influence demand
    return [
      {
        factor: 'Seasonality',
        impact: 0.3,
        description: 'Seasonal variations in consumer behavior'
      },
      {
        factor: 'Market Trends',
        impact: 0.25,
        description: 'Overall market growth and consumer preferences'
      },
      {
        factor: 'Price Changes',
        impact: -0.4,
        description: 'Price elasticity effects on demand'
      },
      {
        factor: 'Competition',
        impact: -0.15,
        description: 'Competitive products and market dynamics'
      },
      {
        factor: 'Marketing',
        impact: 0.2,
        description: 'Marketing campaigns and promotional activities'
      }
    ];
  }

  async optimizePrice(productId: string): Promise<PriceOptimization> {
    try {
      const cacheKey = `price_optimization:${productId}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Get product and historical pricing data
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      const currentPrice = product.price.amount;

      // Calculate price elasticity
      const priceElasticity = await this.calculatePriceElasticity(productId);

      // Get competitor prices
      const competitorPrices = await this.getCompetitorPrices(productId);

      // Calculate optimal price
      const optimizedPrice = this.calculateOptimalPrice(currentPrice, priceElasticity, competitorPrices);

      // Estimate demand and revenue changes
      const expectedDemandChange = this.estimateDemandChange(currentPrice, optimizedPrice, priceElasticity);
      const expectedRevenueChange = this.estimateRevenueChange(currentPrice, optimizedPrice, expectedDemandChange);

      // Generate recommendation
      const recommendation = this.generatePriceRecommendation(
        currentPrice,
        optimizedPrice,
        expectedRevenueChange,
        competitorPrices
      );

      const optimization: PriceOptimization = {
        productId,
        currentPrice,
        optimizedPrice,
        expectedDemandChange,
        expectedRevenueChange,
        priceElasticity,
        competitorPrices,
        recommendation
      };

      await optimizedCache.set(cacheKey, optimization, { ttl: 3600 }); // 1 hour
      return optimization;

    } catch (error) {
      logger.error('Failed to optimize price', error);
      throw error;
    }
  }

  private async calculatePriceElasticity(productId: string): Promise<number> {
    // Simplified price elasticity calculation
    // In production, would use historical price and demand data

    // Mock elasticity based on product category
    const product = await Product.findById(productId).populate('category');

    // Different elasticities for different categories
    const categoryElasticities: Record<string, number> = {
      'luxury': -0.8,
      'organic': -0.6,
      'staples': -0.3,
      'seasonal': -1.2,
      'default': -0.7
    };

    const categoryName = product?.category?.name?.toLowerCase() || 'default';
    return categoryElasticities[categoryName] || categoryElasticities.default;
  }

  private async getCompetitorPrices(productId: string): Promise<Array<{
    competitor: string;
    price: number;
    marketShare: number;
  }>> {
    // Mock competitor data - in production, would integrate with market data sources
    return [
      { competitor: 'Competitor A', price: 12.50, marketShare: 0.25 },
      { competitor: 'Competitor B', price: 14.20, marketShare: 0.20 },
      { competitor: 'Competitor C', price: 11.80, marketShare: 0.15 }
    ];
  }

  private calculateOptimalPrice(
    currentPrice: number,
    elasticity: number,
    competitorPrices: Array<{ competitor: string; price: number; marketShare: number }>
  ): number {
    // Simplified optimal pricing calculation

    // Calculate market average weighted by market share
    const marketPrice = competitorPrices.reduce(
      (sum, comp) => sum + (comp.price * comp.marketShare),
      0
    ) / competitorPrices.reduce((sum, comp) => sum + comp.marketShare, 0);

    // Factor in elasticity
    const elasticityAdjustment = Math.abs(elasticity) > 1 ? 0.95 : 1.05; // Elastic vs inelastic

    // Blend current price, market price, and elasticity consideration
    return Math.round(((currentPrice + marketPrice) / 2) * elasticityAdjustment * 100) / 100;
  }

  private estimateDemandChange(currentPrice: number, newPrice: number, elasticity: number): number {
    const priceChange = (newPrice - currentPrice) / currentPrice;
    return elasticity * priceChange * 100; // Return as percentage
  }

  private estimateRevenueChange(currentPrice: number, newPrice: number, demandChange: number): number {
    const priceChange = (newPrice - currentPrice) / currentPrice * 100;
    return priceChange + (demandChange / 100 * priceChange);
  }

  private generatePriceRecommendation(
    currentPrice: number,
    optimizedPrice: number,
    revenueChange: number,
    competitorPrices: Array<{ competitor: string; price: number; marketShare: number }>
  ): { action: 'INCREASE' | 'DECREASE' | 'MAINTAIN'; reason: string; confidence: number } {
    const priceDiff = optimizedPrice - currentPrice;
    const threshold = 0.05; // 5% threshold

    if (Math.abs(priceDiff / currentPrice) < threshold) {
      return {
        action: 'MAINTAIN',
        reason: 'Current price is optimal within acceptable range',
        confidence: 0.8
      };
    }

    if (priceDiff > 0) {
      return {
        action: 'INCREASE',
        reason: `Increase price to ${optimizedPrice.toFixed(2)} to optimize revenue (${revenueChange.toFixed(1)}% increase expected)`,
        confidence: 0.75
      };
    }
    return {
      action: 'DECREASE',
      reason: `Decrease price to ${optimizedPrice.toFixed(2)} to increase market competitiveness`,
      confidence: 0.7
    };

  }

  async assessRisks(companyId: string): Promise<RiskAssessment[]> {
    try {
      const cacheKey = `risk_assessment:${companyId}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      const risks: RiskAssessment[] = [
        {
          type: 'SUPPLY',
          level: 'MEDIUM',
          probability: 0.3,
          impact: 0.7,
          description: 'Potential supply chain disruption due to weather conditions',
          affectedProducts: ['PROD-001', 'PROD-002'],
          timeframe: 'Next 2 weeks',
          mitigation: [
            { action: 'Diversify suppliers', cost: 5000, effectiveness: 0.8 },
            { action: 'Increase inventory', cost: 10000, effectiveness: 0.6 }
          ]
        },
        {
          type: 'DEMAND',
          level: 'LOW',
          probability: 0.2,
          impact: 0.4,
          description: 'Seasonal demand decline for certain categories',
          affectedProducts: ['PROD-003'],
          timeframe: 'Next quarter',
          mitigation: [
            { action: 'Promotional campaigns', cost: 3000, effectiveness: 0.7 },
            { action: 'Product diversification', cost: 15000, effectiveness: 0.9 }
          ]
        }
      ];

      await optimizedCache.set(cacheKey, risks, { ttl: 14400 }); // 4 hours
      return risks;

    } catch (error) {
      logger.error('Failed to assess risks', error);
      throw error;
    }
  }

  async segmentCustomers(companyId: string): Promise<CustomerSegment[]> {
    try {
      const cacheKey = `customer_segments:${companyId}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Simplified customer segmentation
      const segments: CustomerSegment[] = [
        {
          segmentId: 'high_value',
          name: 'High Value Customers',
          size: 150,
          characteristics: {
            avgOrderValue: 500,
            orderFrequency: 'Weekly',
            loyaltyScore: 9.2
          },
          behavior: {
            avgOrderValue: 500,
            orderFrequency: 52,
            seasonality: { 'Q1': 1.1, 'Q2': 0.9, 'Q3': 1.2, 'Q4': 1.3 },
            preferredCategories: ['Premium', 'Organic']
          },
          predictedValue: {
            lifetime: 25000,
            nextQuarter: 6500,
            churnRisk: 0.05
          },
          recommendations: [
            'Offer exclusive premium products',
            'Provide priority customer service',
            'Create loyalty rewards program'
          ]
        },
        {
          segmentId: 'price_sensitive',
          name: 'Price-Sensitive Customers',
          size: 320,
          characteristics: {
            avgOrderValue: 150,
            orderFrequency: 'Monthly',
            priceElasticity: -1.2
          },
          behavior: {
            avgOrderValue: 150,
            orderFrequency: 12,
            seasonality: { 'Q1': 0.8, 'Q2': 1.0, 'Q3': 1.1, 'Q4': 1.2 },
            preferredCategories: ['Basic', 'Bulk']
          },
          predictedValue: {
            lifetime: 5400,
            nextQuarter: 450,
            churnRisk: 0.25
          },
          recommendations: [
            'Offer volume discounts',
            'Promote value packages',
            'Send price drop notifications'
          ]
        }
      ];

      await optimizedCache.set(cacheKey, segments, { ttl: 86400 }); // 24 hours
      return segments;

    } catch (error) {
      logger.error('Failed to segment customers', error);
      throw error;
    }
  }

  async generateMarketTrends(category?: string): Promise<MarketTrend[]> {
    try {
      const cacheKey = `market_trends:${category || 'all'}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Mock market trends - in production, would integrate with market research data
      const trends: MarketTrend[] = [
        {
          category: 'Organic Foods',
          trend: 'GROWING',
          growthRate: 15.2,
          marketSize: 52000000,
          keyDrivers: ['Health consciousness', 'Environmental awareness', 'Premium positioning'],
          threats: ['Higher costs', 'Limited supply', 'Economic downturn'],
          opportunities: ['Expanding to new demographics', 'Product innovation', 'Sustainable packaging'],
          forecast: [
            { period: '2024-Q2', projectedValue: 54600000, confidence: 0.85 },
            { period: '2024-Q3', projectedValue: 57200000, confidence: 0.80 },
            { period: '2024-Q4', projectedValue: 59800000, confidence: 0.75 }
          ]
        }
      ];

      await optimizedCache.set(cacheKey, trends, { ttl: 21600 }); // 6 hours
      return trends;

    } catch (error) {
      logger.error('Failed to generate market trends', error);
      throw error;
    }
  }
}

export const predictiveAnalyticsService = new PredictiveAnalyticsService();
