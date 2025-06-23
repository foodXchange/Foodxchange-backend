// src/services/enhancedSearchService.js - UPDATE with advanced filtering
const { esClient } = require('../config/elasticsearch');
const redis = require('../config/redis');

class EnhancedSearchService {
  constructor() {
    this.indexName = 'foodxchange_products';
    this.cachePrefix = 'search:';
    this.cacheTTL = 300; // 5 minutes
  }

  async search(params) {
    const {
      query,
      category,
      subcategory,
      sort = 'relevance',
      page = 1,
      limit = 20,
      filters = {},
      userId
    } = params;

    console.log('🔍 Search params:', params);

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(params);
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        console.log('⚡ Returning cached results');
        return cached;
      }

      // Build search query
      const searchBody = this.buildAdvancedSearchQuery(params);
      
      // Execute search
      const response = await esClient.search({
        index: this.indexName,
        body: searchBody,
        from: (page - 1) * limit,
        size: Math.min(limit, 100)
      });

      // Format results
      const results = this.formatSearchResults(response, params);
      
      // Cache results
      await this.setCache(cacheKey, results);
      
      console.log(`✅ Search completed: ${results.total} results found`);
      return results;

    } catch (error) {
      console.error('❌ Search error:', error.message);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  buildAdvancedSearchQuery(params) {
    const { query, category, subcategory, sort, filters = {} } = params;
    
    const must = [];
    const filter = [];
    const should = [];

    // Text search with boost for different fields
    if (query && query.trim()) {
      must.push({
        multi_match: {
          query: query.trim(),
          fields: [
            'title^4',
            'shortDescription^3', 
            'description^2',
            'tags^2',
            'searchTerms^1.5',
            'category^1',
            'subcategory^1',
            'supplier.name^1.5'
          ],
          type: 'best_fields',
          fuzziness: 'AUTO',
          minimum_should_match: '70%'
        }
      });

      // Add synonym and related term matching
      should.push({
        multi_match: {
          query: query.trim(),
          fields: ['searchTerms^2'],
          type: 'phrase',
          boost: 2
        }
      });
    }

    // Category filters
    if (category) filter.push({ term: { category } });
    if (subcategory) filter.push({ term: { subcategory } });

    // Advanced filters
    this.addAdvancedFilters(filter, filters);

    // Build final query
    const searchQuery = {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
        should: should.length > 0 ? should : undefined,
        minimum_should_match: should.length > 0 ? 1 : undefined
      }
    };

    // Add sorting and aggregations
    const sortOptions = this.buildSort(sort);
    const aggregations = this.buildAggregations();

    return {
      query: searchQuery,
      sort: sortOptions,
      aggs: aggregations,
      highlight: {
        fields: {
          title: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
          description: { pre_tags: ['<mark>'], post_tags: ['</mark>'] },
          shortDescription: { pre_tags: ['<mark>'], post_tags: ['</mark>'] }
        },
        fragment_size: 150,
        number_of_fragments: 3
      }
    };
  }

  addAdvancedFilters(filter, filters) {
    // Country filter
    if (filters.country) {
      filter.push({ 
        term: { 'specifications.origin': filters.country.toUpperCase() }
      });
    }

    // Organic filter
    if (filters.organic !== undefined) {
      filter.push({ 
        term: { 'specifications.organic': filters.organic }
      });
    }

    // In stock filter
    if (filters.inStock !== undefined) {
      filter.push({ 
        term: { 'availability.inStock': filters.inStock }
      });
    }

    // Verified products/suppliers filter
    if (filters.verified !== undefined) {
      filter.push({ 
        bool: {
          should: [
            { term: { 'verified': filters.verified } },
            { term: { 'supplier.verified': filters.verified } }
          ]
        }
      });
    }

    // Certifications filter
    if (filters.certifications && filters.certifications.length > 0) {
      filter.push({
        terms: { 
          'specifications.certifications': Array.isArray(filters.certifications) 
            ? filters.certifications 
            : [filters.certifications]
        }
      });
    }

    // Price range filter
    if (filters.priceRange) {
      const priceFilter = { range: { 'pricing.basePrice': {} } };
      
      if (filters.priceRange.min !== undefined) {
        priceFilter.range['pricing.basePrice'].gte = filters.priceRange.min;
      }
      if (filters.priceRange.max !== undefined) {
        priceFilter.range['pricing.basePrice'].lte = filters.priceRange.max;
      }
      
      filter.push(priceFilter);
    }

    // Minimum order quantity filter
    if (filters.maxMinOrder) {
      filter.push({
        range: {
          'availability.minimumOrder': { lte: filters.maxMinOrder }
        }
      });
    }

    // Lead time filter
    if (filters.maxLeadTime) {
      filter.push({
        range: {
          'availability.leadTime': { lte: filters.maxLeadTime }
        }
      });
    }
  }

  buildSort(sortOption) {
    const sortMap = {
      'relevance': [{ _score: { order: 'desc' } }],
      'newest': [{ createdAt: { order: 'desc' } }, { _score: { order: 'desc' } }],
      'oldest': [{ createdAt: { order: 'asc' } }, { _score: { order: 'desc' } }],
      'price_low': [{ 'pricing.basePrice': { order: 'asc' } }, { _score: { order: 'desc' } }],
      'price_high': [{ 'pricing.basePrice': { order: 'desc' } }, { _score: { order: 'desc' } }],
      'popular': [{ 'metrics.views': { order: 'desc' } }, { _score: { order: 'desc' } }],
      'rating': [{ 'metrics.rating': { order: 'desc' } }, { _score: { order: 'desc' } }],
      'orders': [{ 'metrics.orders': { order: 'desc' } }, { _score: { order: 'desc' } }]
    };

    return sortMap[sortOption] || sortMap['relevance'];
  }

  buildAggregations() {
    return {
      categories: {
        terms: { 
          field: 'category',
          size: 20
        }
      },
      subcategories: {
        terms: { 
          field: 'subcategory',
          size: 50
        }
      },
      countries: {
        terms: { 
          field: 'specifications.origin',
          size: 30
        }
      },
      certifications: {
        terms: { 
          field: 'specifications.certifications',
          size: 20
        }
      },
      price_ranges: {
        range: {
          field: 'pricing.basePrice',
          ranges: [
            { key: 'under_1', to: 1 },
            { key: '1_to_5', from: 1, to: 5 },
            { key: '5_to_10', from: 5, to: 10 },
            { key: '10_to_50', from: 10, to: 50 },
            { key: 'over_50', from: 50 }
          ]
        }
      },
      suppliers: {
        terms: { 
          field: 'supplier.name.keyword',
          size: 20
        }
      }
    };
  }

  formatSearchResults(response, params) {
    const hits = response.hits.hits.map(hit => ({
      id: hit._id,
      ...hit._source,
      score: hit._score,
      highlight: hit.highlight || {}
    }));

    const aggregations = this.formatAggregations(response.aggregations);

    return {
      total: response.hits.total.value,
      hits,
      aggregations,
      took: response.took,
      maxScore: response.hits.max_score,
      page: params.page || 1,
      limit: params.limit || 20,
      totalPages: Math.ceil(response.hits.total.value / (params.limit || 20))
    };
  }

  formatAggregations(aggs) {
    if (!aggs) return {};

    const formatted = {};
    
    Object.keys(aggs).forEach(key => {
      if (aggs[key].buckets) {
        formatted[key] = aggs[key].buckets.map(bucket => ({
          key: bucket.key,
          count: bucket.doc_count,
          label: this.formatAggregationLabel(key, bucket.key)
        }));
      }
    });

    return formatted;
  }

  formatAggregationLabel(aggregationType, key) {
    const labelMap = {
      categories: {
        grains: 'Grains & Cereals',
        dairy: 'Dairy Products',
        oils: 'Oils & Fats',
        spices: 'Spices & Seasonings',
        meat: 'Meat & Poultry',
        seafood: 'Seafood',
        produce: 'Fresh Produce',
        processed: 'Processed Foods',
        beverages: 'Beverages'
      },
      price_ranges: {
        under_1: 'Under $1',
        '1_to_5': '$1 - $5',
        '5_to_10': '$5 - $10',
        '10_to_50': '$10 - $50',
        over_50: 'Over $50'
      }
    };

    return labelMap[aggregationType]?.[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Autocomplete with enhanced suggestions
  async suggest(query, limit = 10) {
    if (!query || query.length < 2) return [];

    try {
      const response = await esClient.search({
        index: this.indexName,
        body: {
          query: {
            bool: {
              should: [
                {
                  match: {
                    title: {
                      query: query,
                      boost: 3,
                      fuzziness: 'AUTO'
                    }
                  }
                },
                {
                  prefix: {
                    'title.keyword': {
                      value: query.toLowerCase(),
                      boost: 2
                    }
                  }
                },
                {
                  wildcard: {
                    searchTerms: {
                      value: `*${query.toLowerCase()}*`,
                      boost: 1
                    }
                  }
                }
              ]
            }
          },
          _source: ['title', 'category', 'subcategory', 'supplier.name'],
          size: limit
        }
      });

      return response.hits.hits.map(hit => ({
        text: hit._source.title,
        type: 'product',
        category: hit._source.category,
        subcategory: hit._source.subcategory,
        supplier: hit._source.supplier?.name,
        score: hit._score
      }));

    } catch (error) {
      console.error('Suggestion error:', error);
      return [];
    }
  }

  // Cache management
  generateCacheKey(params) {
    const keyObj = {
      q: params.query || '',
      c: params.category || '',
      sc: params.subcategory || '',
      s: params.sort || 'relevance',
      p: params.page || 1,
      l: params.limit || 20,
      f: params.filters || {}
    };
    return `${this.cachePrefix}${Buffer.from(JSON.stringify(keyObj)).toString('base64')}`;
  }

  async getFromCache(key) {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async setCache(key, data) {
    try {
      await redis.setex(key, this.cacheTTL, JSON.stringify(data));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  // Product indexing
  async indexProduct(productData) {
    try {
      const result = await esClient.index({
        index: this.indexName,
        id: productData.projectId || productData.id,
        body: productData,
        refresh: true
      });

      console.log('✅ Product indexed:', result._id);
      
      // Clear related cache entries
      await this.clearRelatedCache(productData);
      
      return result;
    } catch (error) {
      console.error('❌ Index product error:', error.message);
      throw error;
    }
  }

  async removeProduct(productId) {
    try {
      await esClient.delete({
        index: this.indexName,
        id: productId,
        refresh: true
      });
      console.log('🗑️ Product removed from index:', productId);
    } catch (error) {
      if (error.statusCode !== 404) {
        console.error('❌ Remove product error:', error.message);
      }
    }
  }

  async clearRelatedCache(productData) {
    try {
      // Clear cache patterns that might include this product
      const patterns = [
        `${this.cachePrefix}*${productData.category}*`,
        `${this.cachePrefix}*${productData.subcategory}*`
      ];
      
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

module.exports = new EnhancedSearchService();