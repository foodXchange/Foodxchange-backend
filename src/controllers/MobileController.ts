import { Request, Response } from 'express';

import { ValidationError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import { getMobileOptimizationService } from '../services/mobile/MobileOptimizationService';

const logger = new Logger('MobileController');

export class MobileController {
  private readonly mobileService = getMobileOptimizationService();

  /**
   * Get mobile dashboard
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;

      const dashboard = await this.mobileService.getMobileDashboard(tenantId, userId);

      // Track mobile dashboard view
      await this.mobileService.trackMobileUsage(tenantId, userId, 'dashboard_view', {
        timestamp: new Date()
      });

      res.json({
        success: true,
        data: dashboard,
        message: 'Mobile dashboard retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile dashboard error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile products with pagination
   */
  async getProducts(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const {
        category,
        search,
        minPrice,
        maxPrice,
        location,
        organic,
        certified,
        page = 1,
        limit = 20
      } = req.query;

      const filters: any = {
        category: category as string,
        search: search as string,
        location: location as string,
        organic: organic === 'true',
        certified: certified === 'true',
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      if (minPrice || maxPrice) {
        filters.priceRange = {
          min: minPrice ? parseFloat(minPrice as string) : 0,
          max: maxPrice ? parseFloat(maxPrice as string) : Number.MAX_VALUE
        };
      }

      const result = await this.mobileService.getMobileProducts(tenantId, filters);

      // Track mobile product search
      await this.mobileService.trackMobileUsage(tenantId, userId, 'product_search', {
        filters: {
          category,
          search,
          priceRange: filters.priceRange
        },
        resultsCount: result.totalCount
      });

      res.json({
        success: true,
        data: result,
        message: 'Mobile products retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile products error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile product details
   */
  async getProductDetails(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const { productId } = req.params;

      const product = await this.mobileService.getMobileProductDetails(tenantId, productId);

      // Track mobile product view
      await this.mobileService.trackMobileUsage(tenantId, userId, 'product_view', {
        productId,
        productName: product.name,
        category: product.category,
        price: product.price
      });

      res.json({
        success: true,
        data: product,
        message: 'Mobile product details retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile product details error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile orders
   */
  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const { status, page = 1, limit = 20 } = req.query;

      const filters = {
        status: status as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      const result = await this.mobileService.getMobileOrders(tenantId, userId, filters);

      // Track mobile orders view
      await this.mobileService.trackMobileUsage(tenantId, userId, 'orders_view', {
        filters,
        resultsCount: result.totalCount
      });

      res.json({
        success: true,
        data: result,
        message: 'Mobile orders retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile orders error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile RFQs
   */
  async getRFQs(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const { status, page = 1, limit = 20 } = req.query;

      const filters = {
        status: status as string,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      };

      const result = await this.mobileService.getMobileRFQs(tenantId, userId, filters);

      // Track mobile RFQs view
      await this.mobileService.trackMobileUsage(tenantId, userId, 'rfqs_view', {
        filters,
        resultsCount: result.totalCount
      });

      res.json({
        success: true,
        data: result,
        message: 'Mobile RFQs retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile RFQs error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile search suggestions
   */
  async getSearchSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const { q, limit = 10 } = req.query;

      if (!q || (q as string).length < 2) {
        return res.json({
          success: true,
          data: {
            products: [],
            categories: [],
            suppliers: []
          },
          message: 'Query too short'
        });
      }

      const suggestions = await this.mobileService.getMobileSearchSuggestions(
        tenantId,
        q as string,
        parseInt(limit as string)
      );

      // Track mobile search suggestions
      await this.mobileService.trackMobileUsage(tenantId, userId, 'search_suggestions', {
        query: q,
        resultsCount: suggestions.products.length + suggestions.categories.length + suggestions.suppliers.length
      });

      res.json({
        success: true,
        data: suggestions,
        message: 'Mobile search suggestions retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile search suggestions error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Track mobile event
   */
  async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;
      const { eventType, data } = req.body;

      if (!eventType) {
        throw new ValidationError('Event type is required');
      }

      await this.mobileService.trackMobileUsage(tenantId, userId, eventType, data);

      res.json({
        success: true,
        message: 'Mobile event tracked successfully'
      });
    } catch (error) {
      logger.error('Track mobile event error:', error);

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
   * Get mobile app configuration
   */
  async getAppConfig(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;

      // This would be configurable per tenant
      const config = {
        theme: {
          primaryColor: '#2563eb',
          secondaryColor: '#64748b',
          accentColor: '#f59e0b'
        },
        features: {
          offlineMode: true,
          pushNotifications: true,
          biometricAuth: true,
          darkMode: true
        },
        pagination: {
          defaultLimit: 20,
          maxLimit: 50
        },
        search: {
          minQueryLength: 2,
          suggestionsLimit: 10
        },
        cache: {
          productsTTL: 300, // 5 minutes
          ordersTTL: 60,    // 1 minute
          dashboardTTL: 120 // 2 minutes
        },
        api: {
          baseUrl: process.env.API_BASE_URL || 'https://api.foodxchange.com',
          version: 'v1',
          timeout: 30000
        }
      };

      // Track mobile app config request
      await this.mobileService.trackMobileUsage(tenantId, userId, 'app_config_request', {
        userAgent: req.get('User-Agent'),
        platform: req.get('X-Platform') || 'unknown'
      });

      res.json({
        success: true,
        data: config,
        message: 'Mobile app configuration retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile app config error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get mobile categories
   */
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const {tenantId} = req;
      const {userId} = req;

      // Get unique categories from products
      const categories = await this.mobileService.getMobileProducts(tenantId, { limit: 1000 })
        .then(result => {
          const uniqueCategories = [...new Set(result.products.map(p => p.category))];
          return uniqueCategories.map(category => ({
            name: category,
            slug: category.toLowerCase().replace(/\s+/g, '-'),
            icon: this.getCategoryIcon(category)
          }));
        });

      // Track mobile categories view
      await this.mobileService.trackMobileUsage(tenantId, userId, 'categories_view', {
        categoriesCount: categories.length
      });

      res.json({
        success: true,
        data: categories,
        message: 'Mobile categories retrieved successfully'
      });
    } catch (error) {
      logger.error('Get mobile categories error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get category icon based on category name
   */
  private getCategoryIcon(category: string): string {
    const iconMap: { [key: string]: string } = {
      'fruits': '🍎',
      'vegetables': '🥬',
      'dairy': '🥛',
      'meat': '🥩',
      'seafood': '🐟',
      'grains': '🌾',
      'beverages': '🥤',
      'spices': '🌶️',
      'oils': '🫒',
      'snacks': '🍿'
    };

    return iconMap[category.toLowerCase()] || '🏷️';
  }
}

export default new MobileController();
