/**
 * AI-Powered Recommendation Engine for FoodXchange
 * Provides intelligent matching between buyers, suppliers, and products
 */

import { Logger } from '../../core/logging/logger';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { MetricsService } from '../../infrastructure/monitoring/MetricsService';

import { OpenAIWrapper } from './OpenAIWrapper';

export interface RecommendationScore {
  score: number;
  confidence: number;
  factors: string[];
  reasoning: string;
}

export interface ProductRecommendation {
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  score: RecommendationScore;
  matchedCriteria: string[];
  estimatedPrice?: number;
  estimatedDelivery?: number; // days
  complianceMatch: number; // 0-1
  qualityScore: number; // 0-1
}

export interface SupplierRecommendation {
  supplierId: string;
  supplierName: string;
  score: RecommendationScore;
  capabilities: string[];
  certifications: string[];
  averageRating: number;
  responseTime: number; // hours
  fulfillmentRate: number; // 0-1
  priceCompetitiveness: number; // 0-1
}

export interface RFQRequirements {
  productCategory: string;
  specifications: Record<string, any>;
  quantity: number;
  deliveryLocation: string;
  requiredCertifications: string[];
  maxBudget?: number;
  urgency: 'low' | 'medium' | 'high';
  qualityRequirements: string[];
}

export interface UserBehaviorData {
  userId: string;
  recentPurchases: string[];
  preferredSuppliers: string[];
  categoryPreferences: string[];
  priceRange: { min: number; max: number };
  qualityPreference: number; // 0-1
  speedPreference: number; // 0-1
}

export class RecommendationEngine {
  private static instance: RecommendationEngine;
  private readonly logger: Logger;
  private readonly cache: CacheService;
  private readonly openAI: any; // OpenAIService
  private readonly metrics: MetricsService;

  private constructor() {
    this.logger = new Logger('RecommendationEngine');
    this.cache = cacheService;
    this.openAI = OpenAIWrapper.getInstance().getService();
    this.metrics = metricsService;
  }

  public static getInstance(): RecommendationEngine {
    if (!RecommendationEngine.instance) {
      RecommendationEngine.instance = new RecommendationEngine();
    }
    return RecommendationEngine.instance;
  }

  /**
   * Get product recommendations based on RFQ requirements
   */
  public async getProductRecommendations(
    rfqRequirements: RFQRequirements,
    userBehavior?: UserBehaviorData,
    limit: number = 10
  ): Promise<ProductRecommendation[]> {
    const startTime = Date.now();

    try {
      this.logger.info('Generating product recommendations', {
        category: rfqRequirements.productCategory,
        quantity: rfqRequirements.quantity,
        urgency: rfqRequirements.urgency
      });

      // Check cache first
      const cacheKey = this.generateCacheKey('product-rec', rfqRequirements, userBehavior);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.metrics.incrementCounter('recommendation_cache_hit');
        return JSON.parse(cached);
      }

      // Generate AI-powered recommendations
      const recommendations = await this.generateProductRecommendations(
        rfqRequirements,
        userBehavior,
        limit
      );

      // Cache results for 30 minutes
      await this.cache.set(cacheKey, JSON.stringify(recommendations), 1800);

      this.metrics.incrementCounter('recommendation_generated');
      this.metrics.recordTimer('recommendation_generation_time', Date.now() - startTime);

      return recommendations;

    } catch (error) {
      this.logger.error('Failed to generate product recommendations', { error });
      this.metrics.incrementCounter('recommendation_error');
      throw error;
    }
  }

  /**
   * Get supplier recommendations for a specific product category
   */
  public async getSupplierRecommendations(
    productCategory: string,
    requirements: Partial<RFQRequirements>,
    userBehavior?: UserBehaviorData,
    limit: number = 10
  ): Promise<SupplierRecommendation[]> {
    const startTime = Date.now();

    try {
      this.logger.info('Generating supplier recommendations', {
        category: productCategory,
        requirements: Object.keys(requirements)
      });

      const cacheKey = this.generateCacheKey('supplier-rec', { productCategory, ...requirements }, userBehavior);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.metrics.incrementCounter('supplier_recommendation_cache_hit');
        return JSON.parse(cached);
      }

      const recommendations = await this.generateSupplierRecommendations(
        productCategory,
        requirements,
        userBehavior,
        limit
      );

      await this.cache.set(cacheKey, JSON.stringify(recommendations), 1800);

      this.metrics.incrementCounter('supplier_recommendation_generated');
      this.metrics.recordTimer('supplier_recommendation_time', Date.now() - startTime);

      return recommendations;

    } catch (error) {
      this.logger.error('Failed to generate supplier recommendations', { error });
      this.metrics.incrementCounter('supplier_recommendation_error');
      throw error;
    }
  }

  /**
   * Get similar products based on a given product
   */
  public async getSimilarProducts(
    productId: string,
    userBehavior?: UserBehaviorData,
    limit: number = 5
  ): Promise<ProductRecommendation[]> {
    try {
      this.logger.info('Finding similar products', { productId });

      const prompt = this.buildSimilarProductsPrompt(productId, userBehavior);
      const response = await this.openAI.generateCompletion(prompt, {
        maxTokens: 2000,
        temperature: 0.3
      });

      const similarProducts = this.parseAIResponse<ProductRecommendation[]>(response);

      this.metrics.incrementCounter('similar_products_generated');
      return similarProducts.slice(0, limit);

    } catch (error) {
      this.logger.error('Failed to find similar products', { error, productId });
      throw error;
    }
  }

  /**
   * Get personalized recommendations based on user behavior
   */
  public async getPersonalizedRecommendations(
    userBehavior: UserBehaviorData,
    limit: number = 10
  ): Promise<ProductRecommendation[]> {
    try {
      this.logger.info('Generating personalized recommendations', { userId: userBehavior.userId });

      const prompt = this.buildPersonalizedPrompt(userBehavior);
      const response = await this.openAI.generateCompletion(prompt, {
        maxTokens: 3000,
        temperature: 0.4
      });

      const recommendations = this.parseAIResponse<ProductRecommendation[]>(response);

      this.metrics.incrementCounter('personalized_recommendations_generated');
      return recommendations.slice(0, limit);

    } catch (error) {
      this.logger.error('Failed to generate personalized recommendations', { error });
      throw error;
    }
  }

  /**
   * Calculate recommendation score using AI and business logic
   */
  private async calculateRecommendationScore(
    item: any,
    requirements: RFQRequirements | Partial<RFQRequirements>,
    userBehavior?: UserBehaviorData
  ): Promise<RecommendationScore> {
    const prompt = this.buildScoringPrompt(item, requirements, userBehavior);

    const response = await this.openAI.generateCompletion(prompt, {
      maxTokens: 1000,
      temperature: 0.2
    });

    return this.parseAIResponse<RecommendationScore>(response);
  }

  /**
   * Generate product recommendations using AI analysis
   */
  private async generateProductRecommendations(
    requirements: RFQRequirements,
    userBehavior?: UserBehaviorData,
    limit: number = 10
  ): Promise<ProductRecommendation[]> {
    const prompt = this.buildProductRecommendationPrompt(requirements, userBehavior);

    const response = await this.openAI.generateCompletion(prompt, {
      maxTokens: 4000,
      temperature: 0.3
    });

    const recommendations = this.parseAIResponse<ProductRecommendation[]>(response);

    // Apply business logic filters and enhancements
    return this.enhanceRecommendations(recommendations, requirements, userBehavior)
      .slice(0, limit);
  }

  /**
   * Generate supplier recommendations using AI analysis
   */
  private async generateSupplierRecommendations(
    productCategory: string,
    requirements: Partial<RFQRequirements>,
    userBehavior?: UserBehaviorData,
    limit: number = 10
  ): Promise<SupplierRecommendation[]> {
    const prompt = this.buildSupplierRecommendationPrompt(productCategory, requirements, userBehavior);

    const response = await this.openAI.generateCompletion(prompt, {
      maxTokens: 3000,
      temperature: 0.3
    });

    return this.parseAIResponse<SupplierRecommendation[]>(response).slice(0, limit);
  }

  /**
   * Build AI prompt for product recommendations
   */
  private buildProductRecommendationPrompt(
    requirements: RFQRequirements,
    userBehavior?: UserBehaviorData
  ): string {
    return `
As a B2B food marketplace AI assistant, analyze the following RFQ requirements and recommend the most suitable products.

RFQ Requirements:
- Product Category: ${requirements.productCategory}
- Specifications: ${JSON.stringify(requirements.specifications)}
- Quantity: ${requirements.quantity}
- Delivery Location: ${requirements.deliveryLocation}
- Required Certifications: ${requirements.requiredCertifications.join(', ')}
- Max Budget: ${requirements.maxBudget || 'Not specified'}
- Urgency: ${requirements.urgency}
- Quality Requirements: ${requirements.qualityRequirements.join(', ')}

${userBehavior ? `
User Behavior Context:
- Recent Purchases: ${userBehavior.recentPurchases.join(', ')}
- Preferred Suppliers: ${userBehavior.preferredSuppliers.join(', ')}
- Category Preferences: ${userBehavior.categoryPreferences.join(', ')}
- Price Range: $${userBehavior.priceRange.min} - $${userBehavior.priceRange.max}
- Quality vs Speed Preference: ${userBehavior.qualityPreference > 0.5 ? 'Quality-focused' : 'Speed-focused'}
` : ''}

Provide recommendations in JSON format with the following structure:
[
  {
    "productId": "string",
    "productName": "string",
    "supplierId": "string",
    "supplierName": "string",
    "score": {
      "score": 0.95,
      "confidence": 0.87,
      "factors": ["specification match", "price competitiveness", "certification compliance"],
      "reasoning": "Detailed explanation of why this product is recommended"
    },
    "matchedCriteria": ["organic certification", "bulk quantity available"],
    "estimatedPrice": 2500,
    "estimatedDelivery": 5,
    "complianceMatch": 0.95,
    "qualityScore": 0.90
  }
]

Focus on:
1. Specification alignment
2. Certification compliance
3. Price competitiveness
4. Supplier reliability
5. Delivery capabilities
6. Quality standards
7. User preferences (if provided)
`;
  }

  /**
   * Build AI prompt for supplier recommendations
   */
  private buildSupplierRecommendationPrompt(
    productCategory: string,
    requirements: Partial<RFQRequirements>,
    userBehavior?: UserBehaviorData
  ): string {
    return `
As a B2B food marketplace AI assistant, recommend the best suppliers for the given product category and requirements.

Product Category: ${productCategory}
Requirements: ${JSON.stringify(requirements)}

${userBehavior ? `User Preferences: ${JSON.stringify(userBehavior)}` : ''}

Provide supplier recommendations in JSON format:
[
  {
    "supplierId": "string",
    "supplierName": "string",
    "score": {
      "score": 0.92,
      "confidence": 0.85,
      "factors": ["certification compliance", "delivery capability", "price competitiveness"],
      "reasoning": "Why this supplier is recommended"
    },
    "capabilities": ["organic products", "bulk processing", "cold chain"],
    "certifications": ["USDA Organic", "FDA Approved", "HACCP"],
    "averageRating": 4.7,
    "responseTime": 2,
    "fulfillmentRate": 0.96,
    "priceCompetitiveness": 0.85
  }
]

Consider: reliability, certifications, capacity, location, pricing, quality standards.
`;
  }

  /**
   * Build AI prompt for scoring items
   */
  private buildScoringPrompt(
    item: any,
    requirements: RFQRequirements | Partial<RFQRequirements>,
    userBehavior?: UserBehaviorData
  ): string {
    return `
Score this item against the requirements:

Item: ${JSON.stringify(item)}
Requirements: ${JSON.stringify(requirements)}
${userBehavior ? `User Behavior: ${JSON.stringify(userBehavior)}` : ''}

Return JSON:
{
  "score": 0.87,
  "confidence": 0.82,
  "factors": ["price match", "quality standards", "delivery time"],
  "reasoning": "Detailed scoring explanation"
}
`;
  }

  /**
   * Build prompt for similar products
   */
  private buildSimilarProductsPrompt(productId: string, userBehavior?: UserBehaviorData): string {
    return `
Find products similar to product ID: ${productId}
${userBehavior ? `User context: ${JSON.stringify(userBehavior)}` : ''}

Return similar products in the same JSON format as product recommendations.
Focus on: category, specifications, price range, supplier quality.
`;
  }

  /**
   * Build prompt for personalized recommendations
   */
  private buildPersonalizedPrompt(userBehavior: UserBehaviorData): string {
    return `
Generate personalized product recommendations based on user behavior:
${JSON.stringify(userBehavior)}

Consider purchase history, preferences, and patterns.
Return in standard product recommendation JSON format.
`;
  }

  /**
   * Parse AI response into typed object
   */
  private parseAIResponse<T>(response: string): T {
    try {
      // Extract JSON from response if it contains other text
      const jsonMatch = response.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      return JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error('Failed to parse AI response', { error, response });
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Enhance recommendations with business logic
   */
  private enhanceRecommendations(
    recommendations: ProductRecommendation[],
    requirements: RFQRequirements,
    userBehavior?: UserBehaviorData
  ): ProductRecommendation[] {
    return recommendations
      .map(rec => this.applyBusinessLogic(rec, requirements, userBehavior))
      .sort((a, b) => b.score.score - a.score.score);
  }

  /**
   * Apply business logic to recommendations
   */
  private applyBusinessLogic(
    recommendation: ProductRecommendation,
    requirements: RFQRequirements,
    userBehavior?: UserBehaviorData
  ): ProductRecommendation {
    // Apply urgency boost
    if (requirements.urgency === 'high' && recommendation.estimatedDelivery <= 3) {
      recommendation.score.score += 0.1;
      recommendation.score.factors.push('fast delivery for urgent request');
    }

    // Apply user preference boost
    if (userBehavior?.preferredSuppliers.includes(recommendation.supplierId)) {
      recommendation.score.score += 0.05;
      recommendation.score.factors.push('preferred supplier');
    }

    // Ensure score doesn't exceed 1.0
    recommendation.score.score = Math.min(recommendation.score.score, 1.0);

    return recommendation;
  }

  /**
   * Generate cache key for recommendations
   */
  private generateCacheKey(prefix: string, ...objects: any[]): string {
    const hash = objects.map(obj => JSON.stringify(obj)).join('|');
    return `${prefix}:${Buffer.from(hash).toString('base64').slice(0, 32)}`;
  }

  /**
   * Track recommendation performance
   */
  public async trackRecommendationFeedback(
    recommendationId: string,
    userId: string,
    action: 'view' | 'click' | 'purchase' | 'reject',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      this.logger.info('Tracking recommendation feedback', {
        recommendationId,
        userId,
        action,
        metadata
      });

      this.metrics.incrementCounter(`recommendation_${action}`);

      // Store feedback for ML model improvement
      // This would integrate with your analytics/ML pipeline

    } catch (error) {
      this.logger.error('Failed to track recommendation feedback', { error });
    }
  }
}
