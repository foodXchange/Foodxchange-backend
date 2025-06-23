// search/services/searchService.js
const { redis, setWithTTL, get } = require('../../config/redis');
const Project = require('../../models/Project');
const User = require('../../models/User');

class SearchService {
  constructor() {
    this.cachePrefix = 'search:';
    this.cacheTTL = 300; // 5 minutes
  }

  // Main search function using MongoDB
  async searchProjects(params) {
    const {
      query,
      category,
      certifications,
      priceMin,
      priceMax,
      location,
      status = 'active',
      page = 1,
      limit = 20,
      sort = '-createdAt',
      userId
    } = params;

    // Generate cache key
    const cacheKey = this.generateCacheKey(params);
    
    // Check cache first
    const cached = await get(cacheKey);
    if (cached) {
      console.log('📋 Returning cached search results');
      return cached;
    }

    try {
      // Build MongoDB query
      const mongoQuery = {};

      // Text search
      if (query) {
        mongoQuery.$or = [
          { title: new RegExp(query, 'i') },
          { description: new RegExp(query, 'i') },
          { 'specifications.productName': new RegExp(query, 'i') }
        ];
      }

      // Status filter
      if (status !== 'all') {
        mongoQuery.status = status;
      }

      // Category filter
      if (category) {
        mongoQuery.category = category.toLowerCase();
      }

      // Certifications filter
      if (certifications && certifications.length > 0) {
        mongoQuery['specifications.quality.certifications'] = {
          $in: Array.isArray(certifications) ? certifications : [certifications]
        };
      }

      // Price range filter
      if (priceMin || priceMax) {
        mongoQuery['budget.max'] = {};
        if (priceMin) mongoQuery['budget.max'].$gte = Number(priceMin);
        if (priceMax) mongoQuery['budget.max'].$lte = Number(priceMax);
      }

      // Location filter
      if (location) {
        mongoQuery['specifications.delivery.location'] = new RegExp(location, 'i');
      }

      // Visibility filter
      if (!userId) {
        mongoQuery.visibility = 'public';
      }

      // Execute query
      const skip = (page - 1) * limit;
      
      const [projects, total] = await Promise.all([
        Project.find(mongoQuery)
          .populate('buyer', 'companyName country verified')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Project.countDocuments(mongoQuery)
      ]);

      // Get aggregations
      const aggregations = await this.getAggregations(mongoQuery);

      const results = {
        success: true,
        data: projects,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        },
        aggregations
      };

      // Cache results
      await setWithTTL(cacheKey, results, this.cacheTTL);

      return results;
    } catch (error) {
      console.error('Search error:', error);
      throw new Error('Search failed');
    }
  }

  // Search suppliers
  async searchSuppliers(params) {
    const {
      query,
      category,
      country,
      certifications,
      verified,
      page = 1,
      limit = 20
    } = params;

    try {
      const mongoQuery = { userType: 'vendor' };

      if (query) {
        mongoQuery.$or = [
          { companyName: new RegExp(query, 'i') },
          { description: new RegExp(query, 'i') }
        ];
      }

      if (country) {
        mongoQuery.country = country;
      }

      if (certifications && certifications.length > 0) {
        mongoQuery.certifications = {
          $in: Array.isArray(certifications) ? certifications : [certifications]
        };
      }

      if (verified !== undefined) {
        mongoQuery.isVerified = verified === 'true';
      }

      const skip = (page - 1) * limit;

      const [suppliers, total] = await Promise.all([
        User.find(mongoQuery)
          .select('-password')
          .sort('-createdAt')
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(mongoQuery)
      ]);

      return {
        success: true,
        data: suppliers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Supplier search error:', error);
      throw new Error('Supplier search failed');
    }
  }

  // Get search suggestions
  async getSuggestions(query) {
    if (!query || query.length < 2) return [];

    const cacheKey = `${this.cachePrefix}suggestions:${query}`;
    const cached = await get(cacheKey);
    if (cached) return cached;

    try {
      const suggestions = [];

      // Get category suggestions
      const categories = await Project.distinct('category', {
        category: new RegExp(query, 'i'),
        status: 'active'
      });
      
      categories.forEach(cat => {
        suggestions.push({
          type: 'category',
          value: cat,
          label: `in ${cat}`
        });
      });

      // Get product suggestions
      const products = await Project.find({
        title: new RegExp(query, 'i'),
        status: 'active'
      })
      .select('title')
      .limit(5)
      .lean();

      products.forEach(product => {
        suggestions.push({
          type: 'product',
          value: product.title,
          label: product.title
        });
      });

      // Cache suggestions
      await setWithTTL(cacheKey, suggestions, 60); // 1 minute cache

      return suggestions;
    } catch (error) {
      console.error('Suggestions error:', error);
      return [];
    }
  }

  // Get aggregations for filters
  async getAggregations(baseQuery = {}) {
    try {
      const [categories, locations, certifications] = await Promise.all([
        // Category counts
        Project.aggregate([
          { $match: { ...baseQuery, status: 'active' } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),
        
        // Location counts
        Project.aggregate([
          { $match: { ...baseQuery, status: 'active' } },
          { $group: { _id: '$specifications.delivery.location', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),
        
        // Certification counts
        Project.aggregate([
          { $match: { ...baseQuery, status: 'active' } },
          { $unwind: '$specifications.quality.certifications' },
          { $group: { _id: '$specifications.quality.certifications', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);

      return {
        categories: categories.map(c => ({ name: c._id, count: c.count })),
        locations: locations.filter(l => l._id).map(l => ({ name: l._id, count: l.count })),
        certifications: certifications.map(c => ({ name: c._id, count: c.count }))
      };
    } catch (error) {
      console.error('Aggregation error:', error);
      return {
        categories: [],
        locations: [],
        certifications: []
      };
    }
  }

  // Generate cache key
  generateCacheKey(params) {
    const sorted = Object.keys(params).sort().reduce((obj, key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        obj[key] = params[key];
      }
      return obj;
    }, {});
    
    return `${this.cachePrefix}${JSON.stringify(sorted)}`;
  }

  // Clear search cache
  async clearCache(pattern = null) {
    try {
      if (pattern) {
        const keys = await redis.keys(`${this.cachePrefix}${pattern}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        const keys = await redis.keys(`${this.cachePrefix}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
      return true;
    } catch (error) {
      console.error('Clear cache error:', error);
      return false;
    }
  }
}

module.exports = new SearchService();