import { Request, Response } from 'express';
import { getRecommendationService } from '../services/ai/RecommendationService';
import { Logger } from '../core/logging/logger';
import { ValidationError } from '../core/errors';

const logger = new Logger('RecommendationController');

export class RecommendationController {
  private recommendationService = getRecommendationService();

  /**
   * Get personalized product recommendations
   */
  async getPersonalizedRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const {
        limit = 20,
        categories,
        excludeProductIds,
        includeReasons = true
      } = req.query;

      const options = {
        limit: parseInt(limit as string),
        categories: categories ? (categories as string).split(',') : undefined,
        excludeProductIds: excludeProductIds ? (excludeProductIds as string).split(',') : undefined,
        includeReasons: includeReasons === 'true'
      };

      const recommendations = await this.recommendationService.getPersonalizedRecommendations(
        tenantId,
        userId,
        options
      );

      res.json({
        success: true,
        data: recommendations,
        message: 'Personalized recommendations retrieved successfully'
      });
    } catch (error) {
      logger.error('Get personalized recommendations error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Advanced search with AI-powered relevance scoring
   */
  async advancedSearch(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { q: query } = req.query;

      if (!query || (query as string).trim().length < 2) {
        throw new ValidationError('Search query must be at least 2 characters long');
      }

      const filters = {
        categories: req.query.categories ? (req.query.categories as string).split(',') : undefined,
        priceRange: req.query.minPrice || req.query.maxPrice ? {
          min: req.query.minPrice ? parseFloat(req.query.minPrice as string) : 0,
          max: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : Number.MAX_VALUE
        } : undefined,
        location: req.query.location as string,
        organic: req.query.organic === 'true',
        certified: req.query.certified === 'true',
        suppliers: req.query.suppliers ? (req.query.suppliers as string).split(',') : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20
      };

      const searchResults = await this.recommendationService.advancedSearch(
        tenantId,
        userId,
        query as string,
        filters
      );

      res.json({
        success: true,
        data: searchResults,
        message: 'Advanced search completed successfully'
      });
    } catch (error) {
      logger.error('Advanced search error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get search suggestions for autocomplete
   */
  async getSearchSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { q: query } = req.query;

      if (!query || (query as string).length < 2) {
        return res.json({
          success: true,
          data: [],
          message: 'Query too short for suggestions'
        });
      }

      // This would use the generateSearchSuggestions method from the service
      const suggestions = await this.recommendationService.generateSearchSuggestions(
        tenantId,
        query as string
      );

      res.json({
        success: true,
        data: suggestions,
        message: 'Search suggestions retrieved successfully'
      });
    } catch (error) {
      logger.error('Get search suggestions error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get recommendations by category
   */
  async getRecommendationsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { category } = req.params;
      const { limit = 10 } = req.query;

      if (!category) {
        throw new ValidationError('Category is required');
      }

      const recommendations = await this.recommendationService.getPersonalizedRecommendations(
        tenantId,
        userId,
        {
          limit: parseInt(limit as string),
          categories: [category]
        }
      );

      res.json({
        success: true,
        data: recommendations,
        message: `Recommendations for ${category} retrieved successfully`
      });
    } catch (error) {
      logger.error('Get recommendations by category error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get trending products
   */
  async getTrendingProducts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { categories, limit = 10 } = req.query;

      const options = {
        limit: parseInt(limit as string),
        categories: categories ? (categories as string).split(',') : undefined
      };

      // Get trending recommendations specifically
      const trendingRecommendations = await this.recommendationService.getTrendingRecommendations(
        tenantId,
        options.categories,
        options.limit
      );

      res.json({
        success: true,
        data: trendingRecommendations,
        message: 'Trending products retrieved successfully'
      });
    } catch (error) {
      logger.error('Get trending products error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get similar products
   */
  async getSimilarProducts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { productId } = req.params;
      const { limit = 6 } = req.query;

      if (!productId) {
        throw new ValidationError('Product ID is required');
      }

      // Get content-based recommendations for similar products
      const similarProducts = await this.recommendationService.getContentBasedRecommendations(
        tenantId,
        [{ productId }], // Simulate as if user viewed this product
        [],
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: similarProducts,
        message: 'Similar products retrieved successfully'
      });
    } catch (error) {
      logger.error('Get similar products error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get recommendations for specific RFQ
   */
  async getRecommendationsForRFQ(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { rfqId } = req.params;
      const { limit = 10 } = req.query;

      if (!rfqId) {
        throw new ValidationError('RFQ ID is required');
      }

      // This would analyze the RFQ requirements and suggest matching products
      // For now, we'll use the general recommendation system
      const recommendations = await this.recommendationService.getPersonalizedRecommendations(
        tenantId,
        userId,
        {
          limit: parseInt(limit as string)
        }
      );

      res.json({
        success: true,
        data: recommendations,
        message: 'Recommendations for RFQ retrieved successfully'
      });
    } catch (error) {
      logger.error('Get recommendations for RFQ error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get seasonal recommendations
   */
  async getSeasonalRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { limit = 10 } = req.query;

      const seasonalRecommendations = await this.recommendationService.getSeasonalRecommendations(
        tenantId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: seasonalRecommendations,
        message: 'Seasonal recommendations retrieved successfully'
      });
    } catch (error) {
      logger.error('Get seasonal recommendations error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get location-based recommendations
   */
  async getLocationBasedRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { location } = req.query;
      const { limit = 10 } = req.query;

      if (!location) {
        throw new ValidationError('Location is required');
      }

      const locationRecommendations = await this.recommendationService.getLocationBasedRecommendations(
        tenantId,
        location as string,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: locationRecommendations,
        message: 'Location-based recommendations retrieved successfully'
      });
    } catch (error) {
      logger.error('Get location-based recommendations error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Track recommendation interaction
   */
  async trackRecommendationInteraction(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;
      const { 
        recommendationId, 
        productId, 
        action, // 'view', 'click', 'add_to_cart', 'purchase'
        position,
        recommendationType
      } = req.body;

      if (!recommendationId || !productId || !action) {
        throw new ValidationError('recommendationId, productId, and action are required');
      }

      await this.recommendationService.trackRecommendationEvent(
        tenantId,
        userId,
        'recommendation_interaction',
        {
          recommendationId,
          productId,
          action,
          position,
          recommendationType,
          timestamp: new Date()
        }
      );

      res.json({
        success: true,
        message: 'Recommendation interaction tracked successfully'
      });
    } catch (error) {
      logger.error('Track recommendation interaction error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }
}

export default new RecommendationController();