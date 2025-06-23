// ===================================
// 📁 ENHANCED SEARCH SERVICE
// ===================================

const { esClient } = require('../config/elasticsearch');
const redisClient = require('../config/redis');
const { SearchHistory, SavedSearch } = require('../models');

class EnhancedSearchService {
  constructor() {
    this.indexName = 'foodxchange_products';
    this.cachePrefix = 'search:';
    this.cacheTTL = 300; // 5 minutes
    this.maxResults = 1000;
  }

  // ===================================
  // 🔍 MAIN SEARCH FUNCTIONALITY
  // ===================================

  async search(params) {
    const {
      query,
      category,
      subcategory,
      certifications,
      allergens,
      priceRange,
      location,
      radius,
      supplier,
      availability,
      nutritional,
      sort = 'relevance',
      page = 1,
      limit = 20,
      userId,
      includeAggregations = true
    } = params;

    // Generate cache key
    const cacheKey = this.generateCacheKey(params);
    
    // Check cache first
    if (includeAggregations) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        await this.trackSearchFromCache(params, userId);
        return cached;
      }
    }

    try {
      // Build the search query
      const searchBody = await this.buildSearchQuery(params);
      
      // Execute search
      const response = await esClient.search({
        index: this.indexName,
        body: searchBody,
        from: (page - 1) * limit,
        size: Math.min(limit, 100) // Limit max results per page
      });

      // Format results
      const results = this.formatSearchResults(response, params);
      
      // Cache results if aggregations included
      if (includeAggregations) {
        await this.saveToCache(cacheKey, results);
      }
      
      // Track search analytics
      await this.trackSearch(params, results.total, userId);
      
      return results;

    } catch (error) {
      console.error('Search error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  // ===================================
  // 🏗️ QUERY BUILDING
  // ===================================

  async buildSearchQuery(params) {
    const {
      query,
      category,
      subcategory,
      certifications,
      allergens,
      priceRange,
      location,
      radius,
      supplier,
      availability,
      nutritional,
      sort,
      includeAggregations = true
    } = params;

    const must = [];
    const filter = [];
    const mustNot = [];
    const should = [];

    // ===== TEXT SEARCH =====
    if (query && query.trim()) {
      const cleanQuery = query.trim();
      
      // Multi-match across relevant fields
      must.push({
        bool: {
          should: [
            {
              multi_match: {
                query: cleanQuery,
                fields: [
                  'name^5',
                  'name.autocomplete^3',
                  'description^2',
                  'category.text^2',
                  'supplier.name^2',
                  'tags^1.5',
                  'ingredients',
                  'all_searchable'
                ],
                type: 'best_fields',
                fuzziness: 'AUTO',
                prefix_length: 2,
                boost: 2
              }
            },
            {
              // Exact phrase match gets highest boost
              match_phrase: {
                'name': {
                  query: cleanQuery,
                  boost: 10
                }
              }
            },
            {
              // Partial name match
              wildcard: {
                'name.keyword': {
                  value: `*${cleanQuery.toLowerCase()}*`,
                  boost: 3
                }
              }
            }
          ],
          minimum_should_match: 1
        }
      });
    }

    // ===== CATEGORY FILTERS =====
    if (category) {
      filter.push({ term: { category } });
    }
    if (subcategory) {
      filter.push({ term: { subcategory } });
    }

    // ===== CERTIFICATION FILTERS =====
    if (certifications && certifications.length > 0) {
      filter.push({
        terms: { certifications: certifications }
      });
    }

    // ===== ALLERGEN FILTERS =====
    if (allergens && allergens.length > 0) {
      // Exclude products containing specified allergens
      mustNot.push({
        terms: { allergens: allergens }
      });
    }

    // ===== PRICE RANGE FILTER =====
    if (priceRange) {
      const priceFilter = {};
      if (priceRange.min !== undefined) priceFilter.gte = priceRange.min;
      if (priceRange.max !== undefined) priceFilter.lte = priceRange.max;
      
      if (Object.keys(priceFilter).length > 0) {
        filter.push({
          range: { 'pricing.minPrice': priceFilter }
        });
      }
    }

    // ===== LOCATION-BASED SEARCH =====
    if (location && radius) {
      filter.push({
        geo_distance: {
          distance: `${radius}km`,
          location: {
            lat: parseFloat(location.lat),
            lon: parseFloat(location.lon)
          }
        }
      });
    }

    // ===== SUPPLIER FILTERS =====
    if (supplier) {
      if (typeof supplier === 'string') {
        // Search by supplier name or ID
        should.push(
          { term: { 'supplier.id': supplier } },
          { match: { 'supplier.name': supplier } },
          { match: { 'supplier.companyName': supplier } }
        );
      } else if (supplier.verified !== undefined) {
        filter.push({ term: { 'supplier.verified': supplier.verified } });
      }
    }

    // ===== AVAILABILITY FILTERS =====
    if (availability) {
      if (availability.inStock !== undefined) {
        filter.push({ term: { 'availability.inStock': availability.inStock } });
      }
      if (availability.maxLeadTime) {
        filter.push({
          range: { 'availability.leadTime': { lte: availability.maxLeadTime } }
        });
      }
      if (availability.seasonality) {
        filter.push({ term: { 'availability.seasonality': availability.seasonality } });
      }
    }

    // ===== NUTRITIONAL FILTERS =====
    if (nutritional) {
      Object.entries(nutritional).forEach(([nutrient, range]) => {
        if (range && (range.min !== undefined || range.max !== undefined)) {
          const nutritionalFilter = {};
          if (range.min !== undefined) nutritionalFilter.gte = range.min;
          if (range.max !== undefined) nutritionalFilter.lte = range.max;
          
          filter.push({
            range: { [`nutritionalInfo.${nutrient}`]: nutritionalFilter }
          });
        }
      });
    }

    // ===== BUILD FINAL QUERY =====
    const searchQuery = {
      bool: {
        must: must.length > 0 ? must : [{ match_all: {} }],
        filter,
        must_not: mustNot,
        should: should.length > 0 ? should : undefined,
        minimum_should_match: should.length > 0 ? 1 : undefined
      }
    };
// Update the indexProduct method in enhancedSearchService.js
async indexProduct(productData) {
  try {
    // Add safety check
    if (!productData || !productData.projectId) {
      console.log('⚠️ Invalid product data for indexing');
      return { success: false, error: 'Invalid product data' };
    }

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
    // Don't throw, just return error info
    return { success: false, error: error.message };
  }
}
3. Update Product Search Integration
    // ===== SORTING =====
    const sortOptions = this.buildSort(sort, location);

    // ===== HIGHLIGHTING =====
    const highlight = {
      fields: {
        name: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fragment_size: 150
        },
        description: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fragment_size: 200,
          number_of_fragments: 2
        }
      }
    };

    // ===== AGGREGATIONS =====
    const aggs = includeAggregations ? {
      categories: {
        terms: { 
          field: 'category', 
          size: 20,
          order: { _count: 'desc' }
        }
      },
      subcategories: {
        terms: { 
          field: 'subcategory', 
          size: 30 
        }
      },
      certifications: {
        terms: { 
          field: 'certifications', 
          size: 20 
        }
      },
      suppliers: {
        terms: { 
          field: 'supplier.companyName', 
          size: 50 
        }
      },
      countries: {
        terms: { 
          field: 'supplier.country', 
          size: 30 
        }
      },
      price_ranges: {
        range: {
          field: 'pricing.minPrice',
          ranges: [
            { key: 'under_10', to: 10 },
            { key: '10_50', from: 10, to: 50 },
            { key: '50_100', from: 50, to: 100 },
            { key: '100_500', from: 100, to: 500 },
            { key: 'over_500', from: 500 }
          ]
        }
      },
      price_stats: {
        stats: { field: 'pricing.minPrice' }
      },
      availability_status: {
        terms: { field: 'availability.inStock' }
      },
      lead_time_ranges: {
        range: {
          field: 'availability.leadTime',
          ranges: [
            { key: 'immediate', to: 7 },
            { key: 'week', from: 7, to: 14 },
            { key: 'month', from: 14, to: 30 },
            { key: 'longer', from: 30 }
          ]
        }
      }
    } : undefined;

    return {
      query: searchQuery,
      sort: sortOptions,
      highlight,
      aggs
    };
  }

  // ===================================
  // 📊 SORTING LOGIC
  // ===================================

  buildSort(sortOption, location) {
    const sortOptions = [];

    switch (sortOption) {
      case 'price_low':
        sortOptions.push({ 'pricing.minPrice': { order: 'asc', missing: '_last' } });
        break;
      
      case 'price_high':
        sortOptions.push({ 'pricing.maxPrice': { order: 'desc', missing: '_last' } });
        break;
      
      case 'newest':
        sortOptions.push({ createdAt: { order: 'desc' } });
        break;
      
      case 'rating':
        sortOptions.push({ 'supplier.rating': { order: 'desc', missing: '_last' } });
        break;
      
      case 'popularity':
        sortOptions.push({ popularity: { order: 'desc' } });
        break;
      
      case 'lead_time':
        sortOptions.push({ 'availability.leadTime': { order: 'asc', missing: '_last' } });
        break;
      
      case 'distance':
        if (location) {
          sortOptions.push({
            _geo_distance: {
              location: {
                lat: parseFloat(location.lat),
                lon: parseFloat(location.lon)
              },
              order: 'asc',
              unit: 'km',
              mode: 'min',
              distance_type: 'arc',
              ignore_unmapped: true
            }
          });
        }
        break;
      
      case 'supplier_response':
        sortOptions.push({ 
          'supplier.responseTime': { 
            order: 'asc', 
            missing: '_last' 
          } 
        });
        break;
      
      case 'relevance':
      default:
        sortOptions.push({ _score: { order: 'desc' } });
        break;
    }

    // Add secondary sort by popularity
    if (sortOption !== 'popularity') {
      sortOptions.push({ popularity: { order: 'desc' } });
    }

    // Add tertiary sort by creation date
    if (sortOption !== 'newest') {
      sortOptions.push({ createdAt: { order: 'desc' } });
    }

    return sortOptions;
  }

  // ===================================
  // 🎯 AUTOCOMPLETE & SUGGESTIONS
  // ===================================

  async suggest(query, type = 'all', limit = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const suggestions = [];

      // Product name suggestions
      if (type === 'all' || type === 'products') {
        const productSuggestions = await this.getProductSuggestions(query, limit);
        suggestions.push(...productSuggestions);
      }

      // Category suggestions
      if (type === 'all' || type === 'categories') {
        const categorySuggestions = await this.getCategorySuggestions(query, 5);
        suggestions.push(...categorySuggestions);
      }

      // Supplier suggestions
      if (type === 'all' || type === 'suppliers') {
        const supplierSuggestions = await this.getSupplierSuggestions(query, 5);
        suggestions.push(...supplierSuggestions);
      }

      // Remove duplicates and sort by relevance
      const uniqueSuggestions = suggestions
        .filter((item, index, self) => 
          index === self.findIndex(s => s.text === item.text && s.type === item.type)
        )
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit);

      return uniqueSuggestions;

    } catch (error) {
      console.error('Suggestion error:', error);
      return [];
    }
  }

  async getProductSuggestions(query, limit) {
    const response = await esClient.search({
      index: this.indexName,
      body: {
        query: {
          bool: {
            should: [
              {
                match: {
                  'name.autocomplete': {
                    query: query,
                    boost: 3
                  }
                }
              },
              {
                prefix: {
                  'name.keyword': {
                    value: query.toLowerCase(),
                    boost: 2
                  }
                }
              },
              {
                wildcard: {
                  'name.keyword': {
                    value: `*${query.toLowerCase()}*`,
                    boost: 1
                  }
                }
              }
            ]
          }
        },
        _source: ['name', 'category', 'supplier.companyName', 'images'],
        size: limit
      }
    });

    return response.hits.hits.map(hit => ({
      text: hit._source.name,
      type: 'product',
      category: hit._source.category,
      supplier: hit._source.supplier?.companyName,
      image: hit._source.images?.[0],
      score: hit._score
    }));
  }

  async getCategorySuggestions(query, limit) {
    const response = await esClient.search({
      index: this.indexName,
      body: {
        query: {
          wildcard: {
            'category': `*${query.toLowerCase()}*`
          }
        },
        aggs: {
          categories: {
            terms: {
              field: 'category',
              size: limit
            }
          }
        },
        size: 0
      }
    });

    return response.aggregations.categories.buckets.map(bucket => ({
      text: bucket.key,
      type: 'category',
      count: bucket.doc_count,
      score: bucket.doc_count
    }));
  }

  async getSupplierSuggestions(query, limit) {
    const response = await esClient.search({
      index: this.indexName,
      body: {
        query: {
          bool: {
            should: [
              {
                wildcard: {
                  'supplier.name': `*${query.toLowerCase()}*`
                }
              },
              {
                wildcard: {
                  'supplier.companyName': `*${query.toLowerCase()}*`
                }
              }
            ]
          }
        },
        aggs: {
          suppliers: {
            terms: {
              field: 'supplier.companyName',
              size: limit
            }
          }
        },
        size: 0
      }
    });

    return response.aggregations.suppliers.buckets.map(bucket => ({
      text: bucket.key,
      type: 'supplier',
      count: bucket.doc_count,
      score: bucket.doc_count
    }));
  }

  // ===================================
  // 🔗 SIMILAR PRODUCTS
  // ===================================

  async getSimilarProducts(productId, limit = 10) {
    try {
      // Get the original product
      const originalProduct = await esClient.get({
        index: this.indexName,
        id: productId
      });

      if (!originalProduct.found) {
        return [];
      }

      const product = originalProduct._source;

      // Build more_like_this query
      const response = await esClient.search({
        index: this.indexName,
        body: {
          query: {
            bool: {
              should: [
                {
                  more_like_this: {
                    fields: ['name^3', 'description^2', 'category^2', 'tags'],
                    like: [{
                      _index: this.indexName,
                      _id: productId
                    }],
                    min_term_freq: 1,
                    max_query_terms: 12,
                    boost: 2
                  }
                },
                {
                  // Products from same category
                  bool: {
                    must: [
                      { term: { category: product.category } }
                    ],
                    must_not: [
                      { term: { _id: productId } }
                    ],
                    boost: 1.5
                  }
                },
                {
                  // Products with similar price range
                  bool: {
                    must: [
                      {
                        range: {
                          'pricing.minPrice': {
                            gte: (product.pricing?.minPrice || 0) * 0.7,
                            lte: (product.pricing?.minPrice || 0) * 1.3
                          }
                        }
                      }
                    ],
                    must_not: [
                      { term: { _id: productId } }
                    ],
                    boost: 1.2
                  }
                }
              ],
              must_not: [
                { term: { _id: productId } }
              ]
            }
          },
          size: limit + 5 // Get extra to filter out the original
        }
      });

      // Format and filter results
      const similar = response.hits.hits
        .filter(hit => hit._id !== productId)
        .slice(0, limit)
        .map(hit => ({
          ...hit._source,
          id: hit._id,
          score: hit._score,
          similarity: this.calculateSimilarity(product, hit._source)
        }));

      return similar;

    } catch (error) {
      console.error('Similar products error:', error);
      return [];
    }
  }

  calculateSimilarity(product1, product2) {
    const factors = [];
    
    // Same category
    if (product1.category === product2.category) {
      factors.push('Same category');
    }
    
    // Similar price
    const price1 = product1.pricing?.minPrice || 0;
    const price2 = product2.pricing?.minPrice || 0;
    if (price1 && price2 && Math.abs(price1 - price2) < price1 * 0.3) {
      factors.push('Similar price range');
    }
    
    // Common certifications
    const commonCerts = (product1.certifications || [])
      .filter(cert => (product2.certifications || []).includes(cert));
    if (commonCerts.length > 0) {
      factors.push(`Common certifications: ${commonCerts.join(', ')}`);
    }
    
    // Same supplier
    if (product1.supplier?.id === product2.supplier?.id) {
      factors.push('Same supplier');
    }
    
    return factors.join('; ') || 'Content similarity';
  }

  // ===================================
  // 📈 ANALYTICS & TRACKING
  // ===================================

  async trackSearch(params, resultCount, userId) {
    try {
      // Save to search history
      const searchRecord = {
        userId: userId || null,
        query: params.query || '',
        filters: {
          category: params.category,
          certifications: params.certifications,
          priceRange: params.priceRange,
          location: params.location,
          radius: params.radius
        },
        resultCount,
        timestamp: new Date(),
        sessionId: params.sessionId,
        device: params.device || 'unknown'
      };

      await SearchHistory.create(searchRecord);

      // Update search term popularity
      if (params.query) {
        await this.updateSearchTermPopularity(params.query);
      }

    } catch (error) {
      console.error('Search tracking error:', error);
      // Don't throw - tracking errors shouldn't break search
    }
  }

  async trackSearchFromCache(params, userId) {
    // Track cached searches with lower priority
    if (Math.random() < 0.1) { // Only track 10% of cached searches
      await this.trackSearch(params, 0, userId);
    }
  }

  async updateSearchTermPopularity(query) {
    const cacheKey = `search_popularity:${query.toLowerCase()}`;
    try {
      await redisClient.incr(cacheKey);
      await redisClient.expire(cacheKey, 86400 * 30); // 30 days
    } catch (error) {
      // Ignore cache errors
    }
  }

  // ===================================
  // 🎨 RESULT FORMATTING
  // ===================================

  formatSearchResults(response, params) {
    const hits = response.hits.hits.map(hit => {
      const source = hit._source;
      const result = {
        id: hit._id,
        ...source,
        score: hit._score,
        highlight: hit.highlight || {}
      };

      // Add distance if location search
      if (params.location && hit.sort && hit.sort[0] !== undefined) {
        result.distance = {
          value: parseFloat(hit.sort[0]),
          unit: 'km'
        };
      }

      return result;
    });

    const aggregations = response.aggregations ? {
      categories: this.formatAggregation(response.aggregations.categories),
      subcategories: this.formatAggregation(response.aggregations.subcategories),
      certifications: this.formatAggregation(response.aggregations.certifications),
      suppliers: this.formatAggregation(response.aggregations.suppliers),
      countries: this.formatAggregation(response.aggregations.countries),
      priceRanges: this.formatRangeAggregation(response.aggregations.price_ranges),
      priceStats: response.aggregations.price_stats,
      availabilityStatus: this.formatAggregation(response.aggregations.availability_status),
      leadTimeRanges: this.formatRangeAggregation(response.aggregations.lead_time_ranges)
    } : {};

    return {
      total: response.hits.total.value,
      hits,
      aggregations,
      took: response.took,
      maxScore: response.hits.max_score
    };
  }

  formatAggregation(agg) {
    return agg ? agg.buckets.map(bucket => ({
      key: bucket.key,
      count: bucket.doc_count
    })) : [];
  }

  formatRangeAggregation(agg) {
    return agg ? agg.buckets.map(bucket => ({
      key: bucket.key,
      from: bucket.from,
      to: bucket.to,
      count: bucket.doc_count
    })) : [];
  }

  // ===================================
  // 💾 CACHING
  // ===================================

  generateCacheKey(params) {
    const normalized = {
      query: params.query || '',
      category: params.category || '',
      subcategory: params.subcategory || '',
      certifications: (params.certifications || []).sort().join(','),
      priceMin: params.priceRange?.min || '',
      priceMax: params.priceRange?.max || '',
      location: params.location ? `${params.location.lat},${params.location.lon}` : '',
      radius: params.radius || '',
      sort: params.sort || 'relevance',
      page: params.page || 1,
      limit: params.limit || 20
    };
    
    const keyString = Object.entries(normalized)
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    
    return `${this.cachePrefix}${Buffer.from(keyString).toString('base64')}`;
  }

  async getFromCache(key) {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async saveToCache(key, data) {
    try {
      await redisClient.setex(key, this.cacheTTL, JSON.stringify(data));
    } catch (error) {
      console.error('Cache save error:', error);
      // Don't throw - cache errors shouldn't break search
    }
  }

  async clearCache(pattern = null) {
    try {
      const searchPattern = pattern || `${this.cachePrefix}*`;
      const keys = await redisClient.keys(searchPattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`🗑️ Cleared ${keys.length} cache keys`);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache clear error:', error);
      return 0;
    }
  }
}

module.exports = new EnhancedSearchService();