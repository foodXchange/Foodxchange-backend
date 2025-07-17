import { Logger } from '../../core/logging/logger';
import { Product } from '../../models/Product';
import { Order } from '../../models/Order';
import { User } from '../../models/User';
import { RFQ } from '../../models/RFQ';
import { getAnalyticsService } from '../analytics/AnalyticsService';
import { AnalyticsEvent } from '../analytics/AnalyticsService';

const logger = new Logger('RecommendationService');

export interface IRecommendation {
  productId: string;
  score: number;
  reason: string;
  type: 'collaborative' | 'content' | 'trending' | 'seasonal' | 'location' | 'price';
  confidence: number;
  metadata?: any;
}

export interface ISearchResult {
  products: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    category: string;
    supplier: {
      id: string;
      name: string;
      rating: number;
    };
    relevanceScore: number;
    images: string[];
    location: string;
  }>;
  suggestions: string[];
  filters: {
    categories: string[];
    priceRanges: Array<{ min: number; max: number; label: string }>;
    locations: string[];
    suppliers: Array<{ id: string; name: string }>;
  };
  totalCount: number;
}

export interface IUserPreferences {
  categories: string[];
  priceRange: { min: number; max: number };
  preferredSuppliers: string[];
  location: string;
  organic: boolean;
  certified: boolean;
  dietaryRestrictions: string[];
}

export class RecommendationService {
  private analyticsService = getAnalyticsService();

  /**
   * Get personalized product recommendations
   */
  async getPersonalizedRecommendations(
    tenantId: string,
    userId: string,
    options: {
      limit?: number;
      categories?: string[];
      excludeProductIds?: string[];
      includeReasons?: boolean;
    } = {}
  ): Promise<IRecommendation[]> {
    try {
      const limit = options.limit || 20;
      const recommendations: IRecommendation[] = [];

      // Get user preferences and history
      const [userPreferences, orderHistory, viewHistory] = await Promise.all([
        this.getUserPreferences(tenantId, userId),
        this.getUserOrderHistory(tenantId, userId, 50),
        this.getUserViewHistory(tenantId, userId, 100)
      ]);

      // Generate different types of recommendations
      const [
        collaborativeRecs,
        contentBasedRecs,
        trendingRecs,
        seasonalRecs,
        locationRecs
      ] = await Promise.all([
        this.getCollaborativeRecommendations(tenantId, userId, userPreferences, limit / 5),
        this.getContentBasedRecommendations(tenantId, orderHistory, viewHistory, limit / 5),
        this.getTrendingRecommendations(tenantId, options.categories, limit / 5),
        this.getSeasonalRecommendations(tenantId, limit / 5),
        this.getLocationBasedRecommendations(tenantId, userPreferences.location, limit / 5)
      ]);

      // Combine and score recommendations
      recommendations.push(...collaborativeRecs);
      recommendations.push(...contentBasedRecs);
      recommendations.push(...trendingRecs);
      recommendations.push(...seasonalRecs);
      recommendations.push(...locationRecs);

      // Remove duplicates and excluded products
      const uniqueRecs = this.removeDuplicateRecommendations(recommendations);
      const filteredRecs = uniqueRecs.filter(rec => 
        !options.excludeProductIds?.includes(rec.productId)
      );

      // Sort by score and limit
      const sortedRecs = filteredRecs
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // Track recommendation generation
      await this.trackRecommendationEvent(tenantId, userId, 'recommendations_generated', {
        recommendationsCount: sortedRecs.length,
        types: [...new Set(sortedRecs.map(r => r.type))],
        avgScore: sortedRecs.reduce((sum, r) => sum + r.score, 0) / sortedRecs.length
      });

      return sortedRecs;
    } catch (error) {
      logger.error('Error getting personalized recommendations:', error);
      throw error;
    }
  }

  /**
   * Advanced search with AI-powered relevance scoring
   */
  async advancedSearch(
    tenantId: string,
    userId: string,
    query: string,
    filters: {
      categories?: string[];
      priceRange?: { min: number; max: number };
      location?: string;
      organic?: boolean;
      certified?: boolean;
      suppliers?: string[];
      page?: number;
      limit?: number;
    } = {}
  ): Promise<ISearchResult> {
    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 100);
      const skip = (page - 1) * limit;

      // Build base query
      const baseQuery: any = { tenantId, isActive: true };
      
      // Apply filters
      if (filters.categories?.length) {
        baseQuery.category = { $in: filters.categories };
      }
      
      if (filters.priceRange) {
        baseQuery.price = {
          $gte: filters.priceRange.min,
          $lte: filters.priceRange.max
        };
      }
      
      if (filters.location) {
        baseQuery.location = { $regex: filters.location, $options: 'i' };
      }
      
      if (filters.organic !== undefined) {
        baseQuery.isOrganic = filters.organic;
      }
      
      if (filters.certified !== undefined) {
        baseQuery.isCertified = filters.certified;
      }
      
      if (filters.suppliers?.length) {
        baseQuery.supplier = { $in: filters.suppliers };
      }

      // Text search with scoring
      let searchQuery = baseQuery;
      if (query && query.trim()) {
        searchQuery = {
          ...baseQuery,
          $text: { $search: query }
        };
      }

      // Execute search
      const [products, totalCount] = await Promise.all([
        Product.find(searchQuery)
          .populate('supplier', 'name rating location')
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(searchQuery)
      ]);

      // Calculate relevance scores
      const productsWithScores = await Promise.all(
        products.map(async (product) => {
          const relevanceScore = await this.calculateRelevanceScore(
            product,
            query,
            tenantId,
            userId
          );
          
          return {
            id: product._id.toString(),
            name: product.name,
            description: product.description,
            price: product.price,
            currency: product.currency,
            category: product.category,
            supplier: {
              id: product.supplier._id.toString(),
              name: product.supplier.name,
              rating: product.supplier.rating || 0
            },
            relevanceScore,
            images: product.images || [],
            location: product.location || product.supplier.location || ''
          };
        })
      );

      // Sort by relevance score
      const sortedProducts = productsWithScores.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Generate search suggestions
      const suggestions = await this.generateSearchSuggestions(tenantId, query);

      // Get filter options
      const filterOptions = await this.getFilterOptions(tenantId, baseQuery);

      // Track search event
      await this.trackRecommendationEvent(tenantId, userId, 'advanced_search', {
        query,
        filters,
        resultsCount: totalCount,
        avgRelevanceScore: sortedProducts.reduce((sum, p) => sum + p.relevanceScore, 0) / sortedProducts.length
      });

      return {
        products: sortedProducts,
        suggestions,
        filters: filterOptions,
        totalCount
      };
    } catch (error) {
      logger.error('Error in advanced search:', error);
      throw error;
    }
  }

  /**
   * Get collaborative filtering recommendations
   */
  private async getCollaborativeRecommendations(
    tenantId: string,
    userId: string,
    userPreferences: IUserPreferences,
    limit: number
  ): Promise<IRecommendation[]> {
    try {
      // Find similar users based on order history
      const similarUsers = await this.findSimilarUsers(tenantId, userId, 10);
      
      if (similarUsers.length === 0) {
        return [];
      }

      // Get products ordered by similar users
      const similarUsersProducts = await Order.aggregate([
        {
          $match: {
            tenantId,
            buyer: { $in: similarUsers.map(u => u.userId) },
            status: 'completed'
          }
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            orderCount: { $sum: 1 },
            avgRating: { $avg: '$items.rating' },
            totalRevenue: { $sum: '$items.totalPrice' }
          }
        },
        { $sort: { orderCount: -1 } },
        { $limit: limit * 2 }
      ]);

      // Get user's already ordered products to exclude
      const userOrderedProducts = await Order.aggregate([
        { $match: { tenantId, buyer: userId } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId' } }
      ]);

      const userOrderedProductIds = userOrderedProducts.map(p => p._id.toString());

      // Filter and score recommendations
      const recommendations: IRecommendation[] = [];
      
      for (const productData of similarUsersProducts) {
        if (!userOrderedProductIds.includes(productData._id.toString())) {
          const score = this.calculateCollaborativeScore(
            productData.orderCount,
            productData.avgRating,
            similarUsers.length
          );

          recommendations.push({
            productId: productData._id.toString(),
            score,
            reason: 'Users with similar preferences also bought this',
            type: 'collaborative',
            confidence: Math.min(score / 100, 1),
            metadata: {
              orderCount: productData.orderCount,
              avgRating: productData.avgRating,
              similarUsersCount: similarUsers.length
            }
          });
        }
      }

      return recommendations.slice(0, limit);
    } catch (error) {
      logger.error('Error getting collaborative recommendations:', error);
      return [];
    }
  }

  /**
   * Get content-based recommendations
   */
  private async getContentBasedRecommendations(
    tenantId: string,
    orderHistory: any[],
    viewHistory: any[],
    limit: number
  ): Promise<IRecommendation[]> {
    try {
      // Extract categories and features from user history
      const userCategories = [...new Set([
        ...orderHistory.map(order => order.category),
        ...viewHistory.map(view => view.category)
      ])];

      if (userCategories.length === 0) {
        return [];
      }

      // Find products in similar categories
      const similarProducts = await Product.aggregate([
        {
          $match: {
            tenantId,
            category: { $in: userCategories },
            isActive: true
          }
        },
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ['$$productId', '$items.productId']
                  }
                }
              },
              { $unwind: '$items' },
              {
                $match: {
                  $expr: { $eq: ['$items.productId', '$$productId'] }
                }
              },
              {
                $group: {
                  _id: null,
                  avgRating: { $avg: '$items.rating' },
                  orderCount: { $sum: 1 }
                }
              }
            ],
            as: 'stats'
          }
        },
        {
          $addFields: {
            avgRating: { $arrayElemAt: ['$stats.avgRating', 0] },
            orderCount: { $arrayElemAt: ['$stats.orderCount', 0] }
          }
        },
        { $sort: { avgRating: -1, orderCount: -1 } },
        { $limit: limit * 2 }
      ]);

      const recommendations: IRecommendation[] = [];

      for (const product of similarProducts) {
        const categoryScore = userCategories.includes(product.category) ? 1 : 0;
        const ratingScore = (product.avgRating || 0) / 5;
        const popularityScore = Math.min((product.orderCount || 0) / 100, 1);

        const score = (categoryScore * 40 + ratingScore * 35 + popularityScore * 25);

        recommendations.push({
          productId: product._id.toString(),
          score,
          reason: `Similar to products you've viewed in ${product.category}`,
          type: 'content',
          confidence: Math.min(score / 100, 1),
          metadata: {
            category: product.category,
            avgRating: product.avgRating,
            orderCount: product.orderCount
          }
        });
      }

      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting content-based recommendations:', error);
      return [];
    }
  }




  /**
   * Calculate relevance score for search results
   */
  private async calculateRelevanceScore(
    product: any,
    query: string,
    tenantId: string,
    userId: string
  ): Promise<number> {
    try {
      let score = 0;

      // Text relevance score
      if (query) {
        const queryLower = query.toLowerCase();
        const nameMatch = product.name.toLowerCase().includes(queryLower);
        const descMatch = product.description.toLowerCase().includes(queryLower);
        const categoryMatch = product.category.toLowerCase().includes(queryLower);

        if (nameMatch) score += 40;
        if (descMatch) score += 20;
        if (categoryMatch) score += 15;
      }

      // Popularity score
      const orderCount = await Order.countDocuments({
        tenantId,
        'items.productId': product._id
      });
      score += Math.min(orderCount * 2, 20);

      // Rating score
      const avgRating = await Order.aggregate([
        { $match: { tenantId, 'items.productId': product._id } },
        { $unwind: '$items' },
        { $match: { 'items.productId': product._id } },
        { $group: { _id: null, avgRating: { $avg: '$items.rating' } } }
      ]);
      
      if (avgRating[0]?.avgRating) {
        score += (avgRating[0].avgRating / 5) * 15;
      }

      // Recency score
      const daysSinceCreated = (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(10 - daysSinceCreated / 30, 0);

      return Math.min(score, 100);
    } catch (error) {
      logger.error('Error calculating relevance score:', error);
      return 0;
    }
  }

  /**
   * Helper methods
   */
  private async getUserPreferences(tenantId: string, userId: string): Promise<IUserPreferences> {
    // This would typically come from a user preferences model
    // For now, we'll derive from order history
    const orders = await Order.find({ tenantId, buyer: userId })
      .populate('items.productId', 'category price isOrganic isCertified')
      .limit(50);

    const categories = [...new Set(orders.flatMap(o => o.items.map(i => i.category)).filter(Boolean))];
    const prices = orders.flatMap(o => o.items.map(i => i.price)).filter(Boolean);
    const minPrice = Math.min(...prices, 0);
    const maxPrice = Math.max(...prices, 1000);

    return {
      categories,
      priceRange: { min: minPrice, max: maxPrice },
      preferredSuppliers: [],
      location: '',
      organic: false,
      certified: false,
      dietaryRestrictions: []
    };
  }

  private async getUserOrderHistory(tenantId: string, userId: string, limit: number) {
    return await Order.find({ tenantId, buyer: userId })
      .populate('items.productId', 'category name price')
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  private async getUserViewHistory(tenantId: string, userId: string, limit: number) {
    return await AnalyticsEvent.find({
      tenantId,
      userId,
      eventType: 'product_view'
    })
    .sort({ timestamp: -1 })
    .limit(limit);
  }

  private async findSimilarUsers(tenantId: string, userId: string, limit: number) {
    // Simplified similarity based on common ordered categories
    const userCategories = await Order.aggregate([
      { $match: { tenantId, buyer: userId } },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', count: { $sum: 1 } } }
    ]);

    const categories = userCategories.map(c => c._id);

    const similarUsers = await Order.aggregate([
      { $match: { tenantId, buyer: { $ne: userId } } },
      { $unwind: '$items' },
      { $match: { 'items.category': { $in: categories } } },
      { $group: { _id: '$buyer', commonCategories: { $addToSet: '$items.category' } } },
      { $addFields: { similarity: { $size: '$commonCategories' } } },
      { $sort: { similarity: -1 } },
      { $limit: limit }
    ]);

    return similarUsers.map(u => ({ userId: u._id, similarity: u.similarity }));
  }

  private calculateCollaborativeScore(orderCount: number, avgRating: number, similarUsersCount: number): number {
    const popularityScore = Math.min(orderCount * 10, 50);
    const ratingScore = (avgRating || 0) * 10;
    const confidenceScore = Math.min(similarUsersCount * 5, 25);
    
    return popularityScore + ratingScore + confidenceScore;
  }

  private async generateSearchSuggestions(tenantId: string, query: string): Promise<string[]> {
    if (!query || query.length < 2) return [];

    const suggestions = await Product.aggregate([
      {
        $match: {
          tenantId,
          isActive: true,
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          names: { $addToSet: '$name' },
          categories: { $addToSet: '$category' }
        }
      }
    ]);

    const allSuggestions = [
      ...(suggestions[0]?.names || []),
      ...(suggestions[0]?.categories || [])
    ];

    return allSuggestions
      .filter(s => s.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  }

  private async getFilterOptions(tenantId: string, baseQuery: any) {
    const [categories, locations, suppliers] = await Promise.all([
      Product.distinct('category', { ...baseQuery, isActive: true }),
      Product.distinct('location', { ...baseQuery, isActive: true }),
      Product.aggregate([
        { $match: { ...baseQuery, isActive: true } },
        { $lookup: { from: 'companies', localField: 'supplier', foreignField: '_id', as: 'supplierInfo' } },
        { $unwind: '$supplierInfo' },
        { $group: { _id: '$supplierInfo._id', name: { $first: '$supplierInfo.name' } } }
      ])
    ]);

    return {
      categories,
      priceRanges: [
        { min: 0, max: 50, label: 'Under $50' },
        { min: 50, max: 200, label: '$50 - $200' },
        { min: 200, max: 500, label: '$200 - $500' },
        { min: 500, max: 10000, label: 'Over $500' }
      ],
      locations: locations.filter(Boolean),
      suppliers: suppliers.map(s => ({ id: s._id.toString(), name: s.name }))
    };
  }

  private getCurrentSeason(month: number): string {
    if (month >= 3 && month <= 5) return 'Spring';
    if (month >= 6 && month <= 8) return 'Summer';
    if (month >= 9 && month <= 11) return 'Fall';
    return 'Winter';
  }

  private getSeasonalCategories(season: string): string[] {
    const seasonalMap = {
      'Spring': ['vegetables', 'fruits', 'herbs'],
      'Summer': ['fruits', 'vegetables', 'beverages'],
      'Fall': ['grains', 'nuts', 'squash'],
      'Winter': ['preserved', 'dried', 'citrus']
    };

    return seasonalMap[season] || [];
  }

  private removeDuplicateRecommendations(recommendations: IRecommendation[]): IRecommendation[] {
    const seen = new Set();
    return recommendations.filter(rec => {
      if (seen.has(rec.productId)) return false;
      seen.add(rec.productId);
      return true;
    });
  }

  /**
   * Generate search suggestions
   */
  async generateSearchSuggestions(tenantId: string, query: string): Promise<string[]> {
    if (!query || query.length < 2) return [];

    const suggestions = await Product.aggregate([
      {
        $match: {
          tenantId,
          isActive: true,
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          names: { $addToSet: '$name' },
          categories: { $addToSet: '$category' }
        }
      }
    ]);

    const allSuggestions = [
      ...(suggestions[0]?.names || []),
      ...(suggestions[0]?.categories || [])
    ];

    return allSuggestions
      .filter(s => s.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  }

  /**
   * Get trending recommendations (public method)
   */
  async getTrendingRecommendations(
    tenantId: string,
    categories?: string[],
    limit: number = 5
  ): Promise<IRecommendation[]> {
    try {
      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);

      const matchStage: any = {
        tenantId,
        createdAt: { $gte: last7Days }
      };

      if (categories?.length) {
        matchStage.category = { $in: categories };
      }

      const trendingProducts = await Order.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            recentOrders: { $sum: 1 },
            totalRevenue: { $sum: '$items.totalPrice' },
            avgRating: { $avg: '$items.rating' }
          }
        },
        { $sort: { recentOrders: -1, totalRevenue: -1 } },
        { $limit: limit }
      ]);

      const recommendations: IRecommendation[] = trendingProducts.map(product => ({
        productId: product._id.toString(),
        score: 70 + (product.recentOrders * 2),
        reason: 'Trending this week',
        type: 'trending',
        confidence: 0.8,
        metadata: {
          recentOrders: product.recentOrders,
          totalRevenue: product.totalRevenue,
          avgRating: product.avgRating
        }
      }));

      return recommendations;
    } catch (error) {
      logger.error('Error getting trending recommendations:', error);
      throw error;
    }
  }

  /**
   * Get seasonal recommendations (public method)
   */
  async getSeasonalRecommendations(
    tenantId: string,
    limit: number = 5
  ): Promise<IRecommendation[]> {
    try {
      const currentMonth = new Date().getMonth() + 1;
      const season = this.getCurrentSeason(currentMonth);
      
      const seasonalCategories = this.getSeasonalCategories(season);

      const seasonalProducts = await Product.aggregate([
        {
          $match: {
            tenantId,
            category: { $in: seasonalCategories },
            isActive: true
          }
        },
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ['$$productId', '$items.productId'] },
                      { $eq: [{ $month: '$createdAt' }, currentMonth] }
                    ]
                  }
                }
              },
              { $unwind: '$items' },
              {
                $match: {
                  $expr: { $eq: ['$items.productId', '$$productId'] }
                }
              },
              {
                $group: {
                  _id: null,
                  seasonalOrders: { $sum: 1 }
                }
              }
            ],
            as: 'seasonalStats'
          }
        },
        {
          $addFields: {
            seasonalOrders: { $arrayElemAt: ['$seasonalStats.seasonalOrders', 0] }
          }
        },
        { $sort: { seasonalOrders: -1 } },
        { $limit: limit }
      ]);

      const recommendations: IRecommendation[] = seasonalProducts.map(product => ({
        productId: product._id.toString(),
        score: 65 + (product.seasonalOrders || 0),
        reason: `Perfect for ${season} season`,
        type: 'seasonal',
        confidence: 0.75,
        metadata: {
          season,
          seasonalOrders: product.seasonalOrders || 0
        }
      }));

      return recommendations;
    } catch (error) {
      logger.error('Error getting seasonal recommendations:', error);
      throw error;
    }
  }

  /**
   * Get location-based recommendations (public method)
   */
  async getLocationBasedRecommendations(
    tenantId: string,
    userLocation: string,
    limit: number = 5
  ): Promise<IRecommendation[]> {
    try {
      if (!userLocation) {
        return [];
      }

      const localProducts = await Product.aggregate([
        {
          $match: {
            tenantId,
            location: { $regex: userLocation, $options: 'i' },
            isActive: true
          }
        },
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ['$$productId', '$items.productId']
                  }
                }
              },
              { $unwind: '$items' },
              {
                $match: {
                  $expr: { $eq: ['$items.productId', '$$productId'] }
                }
              },
              {
                $group: {
                  _id: null,
                  localOrders: { $sum: 1 },
                  avgRating: { $avg: '$items.rating' }
                }
              }
            ],
            as: 'localStats'
          }
        },
        {
          $addFields: {
            localOrders: { $arrayElemAt: ['$localStats.localOrders', 0] },
            avgRating: { $arrayElemAt: ['$localStats.avgRating', 0] }
          }
        },
        { $sort: { localOrders: -1, avgRating: -1 } },
        { $limit: limit }
      ]);

      const recommendations: IRecommendation[] = localProducts.map(product => ({
        productId: product._id.toString(),
        score: 60 + (product.localOrders || 0) + (product.avgRating || 0) * 10,
        reason: 'Local supplier in your area',
        type: 'location',
        confidence: 0.7,
        metadata: {
          location: product.location,
          localOrders: product.localOrders || 0,
          avgRating: product.avgRating || 0
        }
      }));

      return recommendations;
    } catch (error) {
      logger.error('Error getting location-based recommendations:', error);
      throw error;
    }
  }

  /**
   * Get content-based recommendations (public method)
   */
  async getContentBasedRecommendations(
    tenantId: string,
    orderHistory: any[],
    viewHistory: any[],
    limit: number
  ): Promise<IRecommendation[]> {
    try {
      // Extract categories and features from user history
      const userCategories = [...new Set([
        ...orderHistory.map(order => order.category),
        ...viewHistory.map(view => view.category)
      ])];

      if (userCategories.length === 0) {
        return [];
      }

      // Find products in similar categories
      const similarProducts = await Product.aggregate([
        {
          $match: {
            tenantId,
            category: { $in: userCategories },
            isActive: true
          }
        },
        {
          $lookup: {
            from: 'orders',
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: ['$$productId', '$items.productId']
                  }
                }
              },
              { $unwind: '$items' },
              {
                $match: {
                  $expr: { $eq: ['$items.productId', '$$productId'] }
                }
              },
              {
                $group: {
                  _id: null,
                  avgRating: { $avg: '$items.rating' },
                  orderCount: { $sum: 1 }
                }
              }
            ],
            as: 'stats'
          }
        },
        {
          $addFields: {
            avgRating: { $arrayElemAt: ['$stats.avgRating', 0] },
            orderCount: { $arrayElemAt: ['$stats.orderCount', 0] }
          }
        },
        { $sort: { avgRating: -1, orderCount: -1 } },
        { $limit: limit * 2 }
      ]);

      const recommendations: IRecommendation[] = [];

      for (const product of similarProducts) {
        const categoryScore = userCategories.includes(product.category) ? 1 : 0;
        const ratingScore = (product.avgRating || 0) / 5;
        const popularityScore = Math.min((product.orderCount || 0) / 100, 1);

        const score = (categoryScore * 40 + ratingScore * 35 + popularityScore * 25);

        recommendations.push({
          productId: product._id.toString(),
          score,
          reason: `Similar to products you've viewed in ${product.category}`,
          type: 'content',
          confidence: Math.min(score / 100, 1),
          metadata: {
            category: product.category,
            avgRating: product.avgRating,
            orderCount: product.orderCount
          }
        });
      }

      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error('Error getting content-based recommendations:', error);
      throw error;
    }
  }

  /**
   * Track recommendation event
   */
  async trackRecommendationEvent(
    tenantId: string,
    userId: string,
    eventType: string,
    data: any
  ): Promise<void> {
    try {
      await this.analyticsService.trackEvent({
        tenantId,
        userId,
        eventType,
        category: 'recommendation',
        data
      });
    } catch (error) {
      logger.error('Error tracking recommendation event:', error);
    }
  }
}

// Singleton instance
let recommendationService: RecommendationService;

export const getRecommendationService = (): RecommendationService => {
  if (!recommendationService) {
    recommendationService = new RecommendationService();
  }
  return recommendationService;
};

export default getRecommendationService();