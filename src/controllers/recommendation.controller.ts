/**
 * Recommendation Controller
 * Handles business logic for AI-powered recommendations
 */

import { RecommendationEngine, RFQRequirements, UserBehaviorData } from '../services/ai/RecommendationEngine';
import { MatchingAlgorithms, BuyerRequirements, SupplierProfile, ProductProfile } from '../services/ai/MatchingAlgorithms';
import { Logger } from '../core/logging/logger';
import { CacheService } from '../infrastructure/cache/CacheService';
import { ApiError } from '../core/errors';

// Import models (these would be your actual Mongoose models)
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Order } from '../models/Order';
import { RFQ } from '../models/RFQ';

export class RecommendationController {
  private static instance: RecommendationController;
  private logger: Logger;
  private recommendationEngine: RecommendationEngine;
  private matchingAlgorithms: MatchingAlgorithms;
  private cache: CacheService;

  private constructor() {
    this.logger = new Logger('RecommendationController');
    this.recommendationEngine = RecommendationEngine.getInstance();
    this.matchingAlgorithms = new MatchingAlgorithms();
    this.cache = cacheService;
  }

  public static getInstance(): RecommendationController {
    if (!RecommendationController.instance) {
      RecommendationController.instance = new RecommendationController();
    }
    return RecommendationController.instance;
  }

  /**
   * Get smart product recommendations for RFQ
   */
  public async getSmartProductRecommendations(
    rfqId: string,
    userId: string,
    limit: number = 10
  ) {
    try {
      this.logger.info('Getting smart product recommendations', { rfqId, userId });

      // Get RFQ details
      const rfq = await RFQ.findById(rfqId).populate('buyer');
      if (!rfq) {
        throw new ApiError('RFQ not found', 404);
      }

      // Convert RFQ to requirements format
      const requirements: RFQRequirements = this.convertRFQToRequirements(rfq);

      // Get user behavior data
      const userBehavior = await this.getUserBehaviorData(userId);

      // Get recommendations
      const recommendations = await this.recommendationEngine.getProductRecommendations(
        requirements,
        userBehavior,
        limit
      );

      // Enrich recommendations with real product data
      const enrichedRecommendations = await this.enrichProductRecommendations(recommendations);

      return {
        recommendations: enrichedRecommendations,
        rfqContext: {
          id: rfq._id,
          category: rfq.productCategory,
          quantity: rfq.quantity,
          urgency: rfq.urgency
        },
        metadata: {
          basedOnBehavior: !!userBehavior,
          totalResults: enrichedRecommendations.length
        }
      };

    } catch (error) {
      this.logger.error('Failed to get smart product recommendations', { error, rfqId, userId });
      throw error;
    }
  }

  /**
   * Get supplier recommendations with advanced matching
   */
  public async getAdvancedSupplierRecommendations(
    productCategory: string,
    requirements: Partial<BuyerRequirements>,
    userId: string,
    customWeights?: any
  ) {
    try {
      this.logger.info('Getting advanced supplier recommendations', { productCategory, userId });

      // Get all potential suppliers for the category
      const suppliers = await this.getSupplierProfiles(productCategory);

      // Get user behavior for personalization
      const userBehavior = await this.getUserBehaviorData(userId);

      // Apply user preferences to requirements
      const enhancedRequirements = this.enhanceRequirementsWithUserData(requirements, userBehavior);

      // Use advanced matching algorithms
      const matches = this.matchingAlgorithms.matchSuppliersToRequirements(
        suppliers,
        enhancedRequirements as BuyerRequirements,
        customWeights
      );

      // Enrich with real-time data
      const enrichedMatches = await this.enrichSupplierMatches(matches);

      return {
        suppliers: enrichedMatches,
        matchingCriteria: customWeights || 'default',
        metadata: {
          totalEvaluated: suppliers.length,
          matchedSuppliers: enrichedMatches.length,
          category: productCategory
        }
      };

    } catch (error) {
      this.logger.error('Failed to get advanced supplier recommendations', { error });
      throw error;
    }
  }

  /**
   * Get trending products based on market data
   */
  public async getTrendingProducts(
    userId: string,
    category?: string,
    limit: number = 10
  ) {
    try {
      this.logger.info('Getting trending products', { userId, category });

      const cacheKey = `trending_products:${category || 'all'}:${limit}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get trending data from orders and RFQs
      const trendingData = await this.analyzeTrendingProducts(category, limit);

      // Get user behavior for personalization
      const userBehavior = await this.getUserBehaviorData(userId);

      // Combine trending data with personalization
      const personalizedTrending = await this.personalizeTrendingProducts(trendingData, userBehavior);

      // Cache for 1 hour
      await this.cache.set(cacheKey, JSON.stringify(personalizedTrending), 3600);

      return personalizedTrending;

    } catch (error) {
      this.logger.error('Failed to get trending products', { error, userId });
      throw error;
    }
  }

  /**
   * Get price optimization suggestions
   */
  public async getPriceOptimizationSuggestions(
    productId: string,
    quantity: number,
    urgency: string = 'medium'
  ) {
    try {
      this.logger.info('Getting price optimization suggestions', { productId, quantity, urgency });

      // Get product details
      const product = await Product.findById(productId).populate('supplier');
      if (!product) {
        throw new ApiError('Product not found', 404);
      }

      // Analyze market pricing
      const marketAnalysis = await this.analyzeMarketPricing(product, quantity);

      // Get seasonal pricing trends
      const seasonalTrends = await this.getSeasonalPricingTrends(product.category);

      // Get urgency-based pricing adjustments
      const urgencyAdjustments = this.calculateUrgencyPricing(urgency, marketAnalysis);

      // Generate AI-powered price suggestions
      const aiSuggestions = await this.generateAIPriceSuggestions(
        product,
        quantity,
        marketAnalysis,
        seasonalTrends,
        urgencyAdjustments
      );

      return {
        product: {
          id: product._id,
          name: product.name,
          currentPrice: product.basePrice,
          supplier: product.supplier.name
        },
        suggestions: aiSuggestions,
        marketContext: {
          averageMarketPrice: marketAnalysis.averagePrice,
          priceRange: marketAnalysis.priceRange,
          competitivePosition: marketAnalysis.competitivePosition
        },
        seasonalFactors: seasonalTrends,
        urgencyImpact: urgencyAdjustments
      };

    } catch (error) {
      this.logger.error('Failed to get price optimization suggestions', { error, productId });
      throw error;
    }
  }

  /**
   * Get supply chain risk analysis
   */
  public async getSupplyChainRiskAnalysis(
    supplierId: string,
    productCategory: string
  ) {
    try {
      this.logger.info('Analyzing supply chain risks', { supplierId, productCategory });

      // Get supplier data
      const supplier = await Company.findById(supplierId);
      if (!supplier) {
        throw new ApiError('Supplier not found', 404);
      }

      // Analyze various risk factors
      const riskAnalysis = {
        overallRisk: 'low', // This would be calculated
        factors: {
          geographic: await this.analyzeGeographicRisk(supplier),
          financial: await this.analyzeFinancialRisk(supplier),
          operational: await this.analyzeOperationalRisk(supplier, productCategory),
          regulatory: await this.analyzeRegulatoryRisk(supplier, productCategory),
          market: await this.analyzeMarketRisk(productCategory)
        },
        recommendations: [],
        mitigation: []
      };

      // Generate AI-powered risk mitigation suggestions
      const mitigationSuggestions = await this.generateRiskMitigationSuggestions(riskAnalysis);

      return {
        supplier: {
          id: supplier._id,
          name: supplier.name,
          location: supplier.location
        },
        riskProfile: riskAnalysis,
        mitigation: mitigationSuggestions,
        lastUpdated: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to analyze supply chain risks', { error, supplierId });
      throw error;
    }
  }

  // Helper methods

  private convertRFQToRequirements(rfq: any): RFQRequirements {
    return {
      productCategory: rfq.productCategory,
      specifications: rfq.specifications || {},
      quantity: rfq.quantity,
      deliveryLocation: rfq.deliveryLocation,
      requiredCertifications: rfq.requiredCertifications || [],
      maxBudget: rfq.maxBudget,
      urgency: rfq.urgency || 'medium',
      qualityRequirements: rfq.qualityRequirements || []
    };
  }

  private async getUserBehaviorData(userId: string): Promise<UserBehaviorData | undefined> {
    try {
      // Get user's recent purchase history
      const recentOrders = await Order.find({ buyer: userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('items.product');

      // Get preferred suppliers from order history
      const supplierFrequency = new Map();
      const categoryFrequency = new Map();
      const recentPurchases: string[] = [];

      recentOrders.forEach(order => {
        order.items.forEach((item: any) => {
          if (item.product) {
            recentPurchases.push(item.product._id.toString());
            
            const supplierId = item.product.supplier.toString();
            supplierFrequency.set(supplierId, (supplierFrequency.get(supplierId) || 0) + 1);
            
            const category = item.product.category;
            categoryFrequency.set(category, (categoryFrequency.get(category) || 0) + 1);
          }
        });
      });

      // Get preferred suppliers (top 5)
      const preferredSuppliers = Array.from(supplierFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);

      // Get category preferences
      const categoryPreferences = Array.from(categoryFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(entry => entry[0]);

      // Calculate price range from recent orders
      const prices = recentOrders.flatMap(order => 
        order.items.map((item: any) => item.price * item.quantity)
      );
      
      const priceRange = prices.length > 0 ? {
        min: Math.min(...prices),
        max: Math.max(...prices)
      } : { min: 0, max: 10000 };

      return {
        userId,
        recentPurchases: recentPurchases.slice(0, 10),
        preferredSuppliers,
        categoryPreferences,
        priceRange,
        qualityPreference: 0.7, // This could be inferred from order patterns
        speedPreference: 0.6 // This could be inferred from delivery preferences
      };

    } catch (error) {
      this.logger.warn('Failed to get user behavior data', { error, userId });
      return undefined;
    }
  }

  private async getSupplierProfiles(category: string): Promise<SupplierProfile[]> {
    try {
      const suppliers = await Company.find({ 
        type: 'supplier',
        'capabilities.categories': category 
      }).populate('certifications');

      return suppliers.map(supplier => ({
        id: supplier._id.toString(),
        name: supplier.name,
        location: supplier.location || { lat: 0, lng: 0, city: '', country: '' },
        certifications: supplier.certifications?.map((cert: any) => cert.name) || [],
        categories: supplier.capabilities?.categories || [],
        averageRating: supplier.metrics?.averageRating || 0,
        responseTime: supplier.metrics?.averageResponseTime || 24,
        fulfillmentRate: supplier.metrics?.fulfillmentRate || 0.8,
        qualityScore: supplier.metrics?.qualityScore || 0.7,
        priceCompetitiveness: supplier.metrics?.priceCompetitiveness || 0.6,
        capacityTiers: supplier.capabilities?.capacityTiers || [],
        deliveryCapabilities: supplier.capabilities?.delivery || {
          regions: [],
          averageDeliveryTime: 7,
          expeditedAvailable: false
        }
      }));

    } catch (error) {
      this.logger.error('Failed to get supplier profiles', { error, category });
      return [];
    }
  }

  private enhanceRequirementsWithUserData(
    requirements: Partial<BuyerRequirements>,
    userBehavior?: UserBehaviorData
  ): Partial<BuyerRequirements> {
    if (!userBehavior) return requirements;

    return {
      ...requirements,
      preferredSuppliers: userBehavior.preferredSuppliers,
      blacklistedSuppliers: [], // This would come from user settings
    };
  }

  private async enrichProductRecommendations(recommendations: any[]): Promise<any[]> {
    // This would enrich with real product data from database
    return recommendations;
  }

  private async enrichSupplierMatches(matches: any[]): Promise<any[]> {
    // This would enrich with real-time supplier data
    return matches;
  }

  private async analyzeTrendingProducts(category?: string, limit: number = 10): Promise<any[]> {
    // Analyze order patterns, RFQ frequency, etc.
    // This is a simplified implementation
    const aggregationPipeline: any[] = [
      {
        $group: {
          _id: '$product',
          orderCount: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: limit }
    ];

    if (category) {
      aggregationPipeline.unshift({
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'productData'
        }
      });
      aggregationPipeline.splice(1, 0, {
        $match: { 'productData.category': category }
      });
    }

    const trending = await Order.aggregate(aggregationPipeline);
    return trending;
  }

  private async personalizeTrendingProducts(trendingData: any[], userBehavior?: UserBehaviorData): Promise<any[]> {
    if (!userBehavior) return trendingData;

    // Apply personalization based on user behavior
    return trendingData.map(item => ({
      ...item,
      personalizedScore: this.calculatePersonalizedScore(item, userBehavior)
    })).sort((a, b) => b.personalizedScore - a.personalizedScore);
  }

  private calculatePersonalizedScore(item: any, userBehavior: UserBehaviorData): number {
    let score = item.orderCount || 0;

    // Boost score for preferred categories
    if (userBehavior.categoryPreferences.includes(item.category)) {
      score *= 1.2;
    }

    // Boost score for price range match
    if (item.avgPrice >= userBehavior.priceRange.min && item.avgPrice <= userBehavior.priceRange.max) {
      score *= 1.1;
    }

    return score;
  }

  private async analyzeMarketPricing(product: any, quantity: number): Promise<any> {
    // Analyze similar products in the market
    const similarProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id }
    }).limit(20);

    const prices = similarProducts.map(p => p.basePrice);
    
    return {
      averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      competitivePosition: this.calculateCompetitivePosition(product.basePrice, prices)
    };
  }

  private calculateCompetitivePosition(productPrice: number, marketPrices: number[]): string {
    const avgPrice = marketPrices.reduce((sum, price) => sum + price, 0) / marketPrices.length;
    const ratio = productPrice / avgPrice;

    if (ratio < 0.9) return 'competitive';
    if (ratio < 1.1) return 'market-rate';
    return 'premium';
  }

  private async getSeasonalPricingTrends(category: string): Promise<any> {
    // Analyze historical pricing data for seasonal trends
    // This is a simplified implementation
    return {
      currentSeason: 'spring',
      trend: 'stable',
      seasonalAdjustment: 1.0,
      peakSeasons: ['summer', 'winter'],
      lowSeasons: ['spring', 'fall']
    };
  }

  private calculateUrgencyPricing(urgency: string, marketAnalysis: any): any {
    const urgencyMultipliers = {
      low: 0.95,
      medium: 1.0,
      high: 1.1
    };

    return {
      multiplier: urgencyMultipliers[urgency as keyof typeof urgencyMultipliers] || 1.0,
      reasoning: `${urgency} urgency ${urgency === 'high' ? 'increases' : urgency === 'low' ? 'decreases' : 'maintains'} pricing pressure`
    };
  }

  private async generateAIPriceSuggestions(
    product: any,
    quantity: number,
    marketAnalysis: any,
    seasonalTrends: any,
    urgencyAdjustments: any
  ): Promise<any[]> {
    // This would use the OpenAI service to generate intelligent pricing suggestions
    // For now, return a simplified implementation
    const basePrice = product.basePrice;
    const suggestions = [
      {
        type: 'market-competitive',
        price: marketAnalysis.averagePrice,
        confidence: 0.8,
        reasoning: 'Based on current market average pricing'
      },
      {
        type: 'volume-discount',
        price: basePrice * 0.95,
        confidence: 0.7,
        reasoning: 'Volume discount for large quantity'
      },
      {
        type: 'urgency-adjusted',
        price: basePrice * urgencyAdjustments.multiplier,
        confidence: 0.6,
        reasoning: urgencyAdjustments.reasoning
      }
    ];

    return suggestions;
  }

  // Risk analysis helper methods (simplified implementations)
  private async analyzeGeographicRisk(supplier: any): Promise<any> {
    return { level: 'low', factors: ['stable region', 'good infrastructure'] };
  }

  private async analyzeFinancialRisk(supplier: any): Promise<any> {
    return { level: 'medium', factors: ['limited financial data'] };
  }

  private async analyzeOperationalRisk(supplier: any, category: string): Promise<any> {
    return { level: 'low', factors: ['experienced in category', 'good track record'] };
  }

  private async analyzeRegulatoryRisk(supplier: any, category: string): Promise<any> {
    return { level: 'low', factors: ['compliant certifications', 'good regulatory standing'] };
  }

  private async analyzeMarketRisk(category: string): Promise<any> {
    return { level: 'medium', factors: ['seasonal demand variations'] };
  }

  private async generateRiskMitigationSuggestions(riskAnalysis: any): Promise<string[]> {
    return [
      'Diversify supplier base',
      'Implement regular quality audits',
      'Establish backup suppliers',
      'Monitor market conditions regularly'
    ];
  }
}