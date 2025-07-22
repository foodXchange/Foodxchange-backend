import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { Company } from '../models/Company';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { optimizedCache } from '../services/cache/OptimizedCacheService';
import { elasticsearchService } from '../services/search/ElasticsearchService';

const logger = new Logger('SearchController');

type SearchRequest = Request & {
  user?: {
    id: string;
    role: string;
  };
};

export class SearchController {

  // Product search with advanced filters
  async searchProducts(req: SearchRequest, res: Response): Promise<void> {
    try {
      const {
        q: query = '',
        size = 20,
        from = 0,
        sort = 'relevance',
        priceMin,
        priceMax,
        category,
        supplier,
        inStock,
        certification,
        lat,
        lon,
        distance,
        nutritionFilters
      } = req.query;

      const cacheKey = `search:products:${JSON.stringify(req.query)}:${req.user?.id}`;

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

      // Build search options
      const searchOptions: any = {
        query: query as string,
        size: parseInt(size as string),
        from: parseInt(from as string),
        highlight: true
      };

      // Price range filter
      if (priceMin || priceMax) {
        searchOptions.priceRange = {};
        if (priceMin) searchOptions.priceRange.min = parseFloat(priceMin as string);
        if (priceMax) searchOptions.priceRange.max = parseFloat(priceMax as string);
      }

      // Location filter
      if (lat && lon) {
        searchOptions.location = {
          lat: parseFloat(lat as string),
          lon: parseFloat(lon as string),
          distance: distance as string || '50km'
        };
      }

      // Additional filters
      if (category) {
        searchOptions.categories = Array.isArray(category) ? category : [category];
      }
      if (supplier) {
        searchOptions.suppliers = Array.isArray(supplier) ? supplier : [supplier];
      }
      if (inStock === 'true') {
        searchOptions.inStock = true;
      }
      if (certification) {
        searchOptions.certifications = Array.isArray(certification) ? certification : [certification];
      }

      // Nutritional filters
      if (nutritionFilters) {
        try {
          searchOptions.nutritionalFilters = JSON.parse(nutritionFilters as string);
        } catch (error) {
          logger.warn('Invalid nutrition filters format', { nutritionFilters });
        }
      }

      // Sorting
      if (sort !== 'relevance') {
        const sortMap: Record<string, any> = {
          'price_asc': [{ price: { order: 'asc' } }],
          'price_desc': [{ price: { order: 'desc' } }],
          'rating': [{ qualityScore: { order: 'desc' } }],
          'popularity': [{ popularityScore: { order: 'desc' } }],
          'newest': [{ createdAt: { order: 'desc' } }]
        };
        searchOptions.sort = sortMap[sort as string] || [];
      }

      const results = await elasticsearchService.searchProducts(searchOptions);

      // Cache results for 5 minutes
      await optimizedCache.set(cacheKey, results, { ttl: 300 });

      // Log search analytics
      this.logSearchAnalytics(req.user?.id || 'anonymous', 'products', query as string);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Product search failed', error);
      res.status(500).json({
        success: false,
        message: 'Search operation failed'
      });
    }
  }

  // Company search
  async searchCompanies(req: SearchRequest, res: Response): Promise<void> {
    try {
      const {
        q: query = '',
        size = 20,
        from = 0,
        type,
        industry,
        verified,
        minRating,
        lat,
        lon,
        distance
      } = req.query;

      const cacheKey = `search:companies:${JSON.stringify(req.query)}:${req.user?.id}`;

      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      const searchOptions: any = {
        query: query as string,
        size: parseInt(size as string),
        from: parseInt(from as string),
        highlight: true
      };

      if (type) {
        searchOptions.types = Array.isArray(type) ? type : [type];
      }
      if (industry) {
        searchOptions.industries = Array.isArray(industry) ? industry : [industry];
      }
      if (verified === 'true') {
        searchOptions.verified = true;
      }
      if (minRating) {
        searchOptions.minRating = parseFloat(minRating as string);
      }
      if (lat && lon) {
        searchOptions.location = {
          lat: parseFloat(lat as string),
          lon: parseFloat(lon as string),
          distance: distance as string || '50km'
        };
      }

      const results = await elasticsearchService.searchCompanies(searchOptions);

      await optimizedCache.set(cacheKey, results, { ttl: 300 });
      this.logSearchAnalytics(req.user?.id || 'anonymous', 'companies', query as string);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Company search failed', error);
      res.status(500).json({
        success: false,
        message: 'Search operation failed'
      });
    }
  }

  // User search
  async searchUsers(req: SearchRequest, res: Response): Promise<void> {
    try {
      const {
        q: query = '',
        size = 20,
        from = 0,
        role,
        verified,
        active
      } = req.query;

      const searchOptions: any = {
        query: query as string,
        size: parseInt(size as string),
        from: parseInt(from as string),
        highlight: true,
        filters: {}
      };

      if (role) {
        searchOptions.filters.role = role;
      }
      if (verified === 'true') {
        searchOptions.filters.verified = true;
      }
      if (active === 'true') {
        searchOptions.filters.active = true;
      }

      const results = await elasticsearchService.search('users', searchOptions);

      this.logSearchAnalytics(req.user?.id || 'anonymous', 'users', query as string);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('User search failed', error);
      res.status(500).json({
        success: false,
        message: 'Search operation failed'
      });
    }
  }

  // Order search
  async searchOrders(req: SearchRequest, res: Response): Promise<void> {
    try {
      const {
        q: query = '',
        size = 20,
        from = 0,
        status,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount
      } = req.query;

      const searchOptions: any = {
        query: query as string,
        size: parseInt(size as string),
        from: parseInt(from as string),
        highlight: true,
        filters: {}
      };

      // Only allow users to search their own orders unless admin
      if (req.user?.role !== 'ADMIN') {
        searchOptions.filters['$or'] = [
          { 'buyer.id': req.user?.id },
          { 'supplier.id': req.user?.id }
        ];
      }

      if (status) {
        searchOptions.filters.status = status;
      }

      if (dateFrom || dateTo) {
        searchOptions.filters.createdAt = {};
        if (dateFrom) searchOptions.filters.createdAt.gte = dateFrom;
        if (dateTo) searchOptions.filters.createdAt.lte = dateTo;
      }

      if (minAmount || maxAmount) {
        searchOptions.filters.totalAmount = {};
        if (minAmount) searchOptions.filters.totalAmount.gte = parseFloat(minAmount as string);
        if (maxAmount) searchOptions.filters.totalAmount.lte = parseFloat(maxAmount as string);
      }

      const results = await elasticsearchService.search('orders', searchOptions);

      this.logSearchAnalytics(req.user?.id || 'anonymous', 'orders', query as string);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Order search failed', error);
      res.status(500).json({
        success: false,
        message: 'Search operation failed'
      });
    }
  }

  // Multi-index search
  async searchAll(req: SearchRequest, res: Response): Promise<void> {
    try {
      const {
        q: query = '',
        size = 10,
        from = 0,
        indices
      } = req.query;

      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        res.status(400).json({
          success: false,
          message: 'Query must be at least 2 characters long'
        });
        return;
      }

      const searchIndices = indices
        ? (Array.isArray(indices) ? indices : [indices])
        : ['products', 'companies', 'users'];

      const results = await elasticsearchService.searchAll(query as string, {
        indices: searchIndices as string[],
        size: parseInt(size as string),
        from: parseInt(from as string)
      });

      this.logSearchAnalytics(req.user?.id || 'anonymous', 'global', query as string);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Global search failed', error);
      res.status(500).json({
        success: false,
        message: 'Search operation failed'
      });
    }
  }

  // Get suggestions/autocomplete
  async getProductSuggestions(req: SearchRequest, res: Response): Promise<void> {
    try {
      const { q: query = '', size = 10 } = req.query;

      if (!query || (query as string).length < 2) {
        res.json({
          success: true,
          data: []
        });
        return;
      }

      const suggestions = await elasticsearchService.suggest(
        'products',
        query as string,
        'suggest',
        parseInt(size as string)
      );

      res.json({
        success: true,
        data: suggestions
      });

    } catch (error) {
      logger.error('Product suggestions failed', error);
      res.status(500).json({
        success: false,
        message: 'Suggestions operation failed'
      });
    }
  }

  async getCompanySuggestions(req: SearchRequest, res: Response): Promise<void> {
    try {
      const { q: query = '', size = 10 } = req.query;

      if (!query || (query as string).length < 2) {
        res.json({
          success: true,
          data: []
        });
        return;
      }

      const suggestions = await elasticsearchService.suggest(
        'companies',
        query as string,
        'suggest',
        parseInt(size as string)
      );

      res.json({
        success: true,
        data: suggestions
      });

    } catch (error) {
      logger.error('Company suggestions failed', error);
      res.status(500).json({
        success: false,
        message: 'Suggestions operation failed'
      });
    }
  }

  // Search analytics
  async getPopularSearches(req: SearchRequest, res: Response): Promise<void> {
    try {
      const { days = 7, limit = 20 } = req.query;

      const cacheKey = `analytics:popular_searches:${days}:${limit}`;

      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      // This would typically query a search analytics collection
      // For now, return mock data
      const popularSearches = [
        { query: 'organic vegetables', count: 1250, trend: 'up' },
        { query: 'fresh fruits', count: 980, trend: 'stable' },
        { query: 'dairy products', count: 760, trend: 'down' },
        { query: 'seafood', count: 620, trend: 'up' },
        { query: 'meat products', count: 580, trend: 'stable' }
      ];

      await optimizedCache.set(cacheKey, popularSearches, { ttl: 3600 }); // Cache for 1 hour

      res.json({
        success: true,
        data: popularSearches
      });

    } catch (error) {
      logger.error('Failed to get popular searches', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve popular searches'
      });
    }
  }

  async getSearchTrends(req: SearchRequest, res: Response): Promise<void> {
    try {
      const { period = 'week', category } = req.query;

      const cacheKey = `analytics:search_trends:${period}:${category || 'all'}`;

      const cached = await optimizedCache.get(cacheKey);
      if (cached) {
        res.json({
          success: true,
          data: cached,
          cached: true
        });
        return;
      }

      // Mock trend data
      const trends = {
        period,
        category: category || 'all',
        data: [
          { date: '2024-01-15', searches: 1200, uniqueQueries: 350 },
          { date: '2024-01-16', searches: 1350, uniqueQueries: 380 },
          { date: '2024-01-17', searches: 1100, uniqueQueries: 320 },
          { date: '2024-01-18', searches: 1450, uniqueQueries: 420 },
          { date: '2024-01-19', searches: 1600, uniqueQueries: 480 }
        ]
      };

      await optimizedCache.set(cacheKey, trends, { ttl: 1800 }); // Cache for 30 minutes

      res.json({
        success: true,
        data: trends
      });

    } catch (error) {
      logger.error('Failed to get search trends', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve search trends'
      });
    }
  }

  // Index management
  async syncIndices(req: SearchRequest, res: Response): Promise<void> {
    try {
      // Only allow admins
      if (req.user?.role !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
        return;
      }

      logger.info('Starting index synchronization', { userId: req.user.id });

      const results = {
        products: 0,
        companies: 0,
        users: 0,
        orders: 0
      };

      // Sync products
      const products = await Product.find({ status: 'ACTIVE' }).limit(1000);
      if (products.length > 0) {
        const productDocs = products.map(p => ({
          id: p._id.toString(),
          document: this.transformProductForIndex(p)
        }));
        await elasticsearchService.bulkIndex('products', productDocs, true);
        results.products = products.length;
      }

      // Sync companies
      const companies = await Company.find({ active: true }).limit(1000);
      if (companies.length > 0) {
        const companyDocs = companies.map(c => ({
          id: c._id.toString(),
          document: this.transformCompanyForIndex(c)
        }));
        await elasticsearchService.bulkIndex('companies', companyDocs, true);
        results.companies = companies.length;
      }

      // Sync users (limited fields for privacy)
      const users = await User.find({ active: true }).limit(1000);
      if (users.length > 0) {
        const userDocs = users.map(u => ({
          id: u._id.toString(),
          document: this.transformUserForIndex(u)
        }));
        await elasticsearchService.bulkIndex('users', userDocs, true);
        results.users = users.length;
      }

      logger.info('Index synchronization completed', { results });

      res.json({
        success: true,
        message: 'Indices synchronized successfully',
        data: results
      });

    } catch (error) {
      logger.error('Index synchronization failed', error);
      res.status(500).json({
        success: false,
        message: 'Index synchronization failed'
      });
    }
  }

  async getIndexStats(req: SearchRequest, res: Response): Promise<void> {
    try {
      const { index } = req.params;

      if (!['products', 'companies', 'users', 'orders'].includes(index)) {
        res.status(400).json({
          success: false,
          message: 'Invalid index name'
        });
        return;
      }

      const stats = await elasticsearchService.getIndexStats(index);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get index stats', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve index statistics'
      });
    }
  }

  // Helper methods
  private async logSearchAnalytics(userId: string, index: string, query: string): Promise<void> {
    try {
      // Store search analytics in cache or database
      const analyticsKey = `search_analytics:${new Date().toISOString().split('T')[0]}`;
      const cachedAnalytics = await optimizedCache.get(analyticsKey);
      const analytics = Array.isArray(cachedAnalytics) ? cachedAnalytics : [];

      analytics.push({
        userId,
        index,
        query,
        timestamp: new Date().toISOString()
      });

      await optimizedCache.set(analyticsKey, analytics, { ttl: 86400 }); // 24 hours
    } catch (error) {
      logger.warn('Failed to log search analytics', error);
    }
  }

  private transformProductForIndex(product: any): any {
    return {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      currency: product.currency,
      unit: product.unit,
      supplier: {
        id: product.supplier.toString(),
        name: product.supplierInfo?.name,
        location: product.supplierInfo?.location?.coordinates,
        rating: product.supplierInfo?.rating
      },
      inventory: product.inventory,
      tags: product.tags,
      certifications: product.certifications,
      nutritionalInfo: product.nutritionalInfo,
      images: product.images,
      qualityScore: product.qualityScore || 0,
      popularityScore: product.popularityScore || 0,
      seasonality: product.seasonality,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      status: product.status,
      location: product.location?.coordinates
    };
  }

  private transformCompanyForIndex(company: any): any {
    return {
      name: company.name,
      description: company.description,
      type: company.type,
      industry: company.industry,
      size: company.size,
      location: {
        address: company.address?.full,
        city: company.address?.city,
        state: company.address?.state,
        country: company.address?.country,
        zipCode: company.address?.zipCode,
        coordinates: company.location?.coordinates
      },
      contact: {
        email: company.contactInfo?.email,
        phone: company.contactInfo?.phone,
        website: company.website
      },
      certifications: company.certifications,
      rating: company.rating,
      reviewCount: company.reviewCount,
      verified: company.verified,
      active: company.active,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt
    };
  }

  private transformUserForIndex(user: any): any {
    return {
      name: user.name,
      email: user.email,
      role: user.role,
      company: {
        id: user.company?.toString(),
        name: user.companyInfo?.name,
        type: user.companyInfo?.type
      },
      profile: {
        title: user.profile?.title,
        bio: user.profile?.bio,
        expertise: user.profile?.expertise,
        interests: user.profile?.interests,
        location: user.profile?.location?.coordinates
      },
      active: user.active,
      verified: user.verified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    };
  }
}

export const searchController = new SearchController();
