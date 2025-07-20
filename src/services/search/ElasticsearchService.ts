import { Client } from '@elastic/elasticsearch';

import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('ElasticsearchService');

export interface SearchResult<T = any> {
  hits: Array<{
    _id: string;
    _score: number;
    _source: T;
    highlight?: Record<string, string[]>;
  }>;
  total: {
    value: number;
    relation: 'eq' | 'gte';
  };
  aggregations?: Record<string, any>;
  took: number;
}

export interface SearchOptions {
  query?: string;
  filters?: Record<string, any>;
  sort?: Array<Record<string, any>>;
  size?: number;
  from?: number;
  highlight?: boolean;
  aggregations?: Record<string, any>;
  fuzzy?: boolean;
  boost?: Record<string, number>;
}

export interface IndexMapping {
  properties: Record<string, any>;
  settings?: {
    number_of_shards?: number;
    number_of_replicas?: number;
    analysis?: any;
  };
}

export class ElasticsearchService {
  private readonly client: Client;
  private readonly indices: Map<string, IndexMapping> = new Map();
  private isConnected: boolean = false;

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD
      } : undefined,
      requestTimeout: 30000,
      maxRetries: 3,
      compression: 'gzip',
      ssl: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });

    this.setupIndices();
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const health = await this.client.cluster.health();
      logger.info('Elasticsearch connection established', {
        cluster: health.cluster_name,
        status: health.status
      });

      // Create indices if they don't exist
      await this.createIndices();

      this.isConnected = true;
      logger.info('Elasticsearch service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Elasticsearch service', error);
      throw error;
    }
  }

  private setupIndices(): void {
    // Product index mapping
    this.indices.set('products', {
      properties: {
        name: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: { type: 'keyword' },
            suggest: {
              type: 'completion',
              analyzer: 'simple',
              search_analyzer: 'simple'
            }
          }
        },
        description: {
          type: 'text',
          analyzer: 'standard'
        },
        category: {
          type: 'keyword',
          fields: {
            text: { type: 'text' }
          }
        },
        price: { type: 'float' },
        currency: { type: 'keyword' },
        unit: { type: 'keyword' },
        supplier: {
          type: 'object',
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            location: { type: 'geo_point' },
            rating: { type: 'float' }
          }
        },
        inventory: {
          type: 'object',
          properties: {
            current: { type: 'integer' },
            lowStockThreshold: { type: 'integer' },
            status: { type: 'keyword' }
          }
        },
        tags: { type: 'keyword' },
        certifications: { type: 'keyword' },
        nutritionalInfo: {
          type: 'object',
          properties: {
            calories: { type: 'float' },
            protein: { type: 'float' },
            fat: { type: 'float' },
            carbohydrates: { type: 'float' },
            fiber: { type: 'float' },
            vitamins: { type: 'keyword' }
          }
        },
        images: {
          type: 'object',
          properties: {
            url: { type: 'keyword' },
            alt: { type: 'text' }
          }
        },
        qualityScore: { type: 'float' },
        popularityScore: { type: 'float' },
        seasonality: {
          type: 'object',
          properties: {
            months: { type: 'keyword' },
            regions: { type: 'keyword' }
          }
        },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
        status: { type: 'keyword' },
        location: { type: 'geo_point' }
      },
      settings: {
        number_of_shards: 2,
        number_of_replicas: 1,
        analysis: {
          analyzer: {
            food_analyzer: {
              type: 'custom',
              tokenizer: 'standard',
              filter: [
                'lowercase',
                'stop',
                'synonym_filter',
                'stemmer'
              ]
            }
          },
          filter: {
            synonym_filter: {
              type: 'synonym',
              synonyms: [
                'tomato,tomatoes',
                'potato,potatoes',
                'apple,apples',
                'organic,bio,natural',
                'fresh,new'
              ]
            }
          }
        }
      }
    });

    // Company index mapping
    this.indices.set('companies', {
      properties: {
        name: {
          type: 'text',
          analyzer: 'standard',
          fields: {
            keyword: { type: 'keyword' },
            suggest: { type: 'completion' }
          }
        },
        description: { type: 'text' },
        type: { type: 'keyword' },
        industry: { type: 'keyword' },
        size: { type: 'keyword' },
        location: {
          type: 'object',
          properties: {
            address: { type: 'text' },
            city: { type: 'keyword' },
            state: { type: 'keyword' },
            country: { type: 'keyword' },
            zipCode: { type: 'keyword' },
            coordinates: { type: 'geo_point' }
          }
        },
        contact: {
          type: 'object',
          properties: {
            email: { type: 'keyword' },
            phone: { type: 'keyword' },
            website: { type: 'keyword' }
          }
        },
        certifications: { type: 'keyword' },
        rating: { type: 'float' },
        reviewCount: { type: 'integer' },
        verified: { type: 'boolean' },
        active: { type: 'boolean' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' }
      }
    });

    // Order index mapping for order history search
    this.indices.set('orders', {
      properties: {
        orderNumber: { type: 'keyword' },
        buyer: {
          type: 'object',
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            company: { type: 'text' }
          }
        },
        supplier: {
          type: 'object',
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            company: { type: 'text' }
          }
        },
        items: {
          type: 'nested',
          properties: {
            productId: { type: 'keyword' },
            productName: { type: 'text' },
            category: { type: 'keyword' },
            quantity: { type: 'integer' },
            unitPrice: { type: 'float' },
            totalPrice: { type: 'float' }
          }
        },
        totalAmount: { type: 'float' },
        currency: { type: 'keyword' },
        status: { type: 'keyword' },
        paymentStatus: { type: 'keyword' },
        deliveryDate: { type: 'date' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' }
      }
    });

    // User/Profile index for people search
    this.indices.set('users', {
      properties: {
        name: {
          type: 'text',
          fields: {
            keyword: { type: 'keyword' },
            suggest: { type: 'completion' }
          }
        },
        email: { type: 'keyword' },
        role: { type: 'keyword' },
        company: {
          type: 'object',
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            type: { type: 'keyword' }
          }
        },
        profile: {
          type: 'object',
          properties: {
            title: { type: 'text' },
            bio: { type: 'text' },
            expertise: { type: 'keyword' },
            interests: { type: 'keyword' },
            location: { type: 'geo_point' }
          }
        },
        active: { type: 'boolean' },
        verified: { type: 'boolean' },
        lastLoginAt: { type: 'date' },
        createdAt: { type: 'date' }
      }
    });
  }

  private async createIndices(): Promise<void> {
    for (const [indexName, mapping] of this.indices.entries()) {
      try {
        const exists = await this.client.indices.exists({ index: indexName });

        if (!exists) {
          await this.client.indices.create({
            index: indexName,
            body: {
              mappings: { properties: mapping.properties },
              settings: mapping.settings
            }
          });

          logger.info(`Created Elasticsearch index: ${indexName}`);
        }
      } catch (error) {
        logger.error(`Failed to create index ${indexName}`, error);
        throw error;
      }
    }
  }

  // Generic search method
  async search<T = any>(
    index: string,
    options: SearchOptions = {}
  ): Promise<SearchResult<T>> {
    try {
      const {
        query = '*',
        filters = {},
        sort = [],
        size = 20,
        from = 0,
        highlight = false,
        aggregations = {},
        fuzzy = false,
        boost = {}
      } = options;

      // Build search query
      const searchQuery = this.buildSearchQuery(query, filters, fuzzy, boost);

      // Build search request
      const searchRequest: any = {
        index,
        body: {
          query: searchQuery,
          sort: sort.length > 0 ? sort : undefined,
          size,
          from,
          highlight: highlight ? this.buildHighlight() : undefined,
          aggs: Object.keys(aggregations).length > 0 ? aggregations : undefined
        }
      };

      const response = await this.client.search(searchRequest);

      return {
        hits: response.hits.hits.map((hit: any) => ({
          _id: hit._id,
          _score: hit._score,
          _source: hit._source,
          highlight: hit.highlight
        })),
        total: response.hits.total,
        aggregations: response.aggregations,
        took: response.took
      };

    } catch (error) {
      logger.error('Search operation failed', { index, options, error });
      throw error;
    }
  }

  // Product-specific search with enhanced features
  async searchProducts(options: SearchOptions & {
    priceRange?: { min?: number; max?: number };
    location?: { lat: number; lon: number; distance?: string };
    inStock?: boolean;
    categories?: string[];
    suppliers?: string[];
    certifications?: string[];
    nutritionalFilters?: Record<string, { min?: number; max?: number }>;
  } = {}): Promise<SearchResult> {
    const {
      priceRange,
      location,
      inStock,
      categories,
      suppliers,
      certifications,
      nutritionalFilters,
      ...searchOptions
    } = options;

    // Enhanced filters for products
    const filters: any = { ...searchOptions.filters };

    if (priceRange) {
      filters.price = {};
      if (priceRange.min !== undefined) filters.price.gte = priceRange.min;
      if (priceRange.max !== undefined) filters.price.lte = priceRange.max;
    }

    if (inStock) {
      filters['inventory.current'] = { gt: 0 };
    }

    if (categories && categories.length > 0) {
      filters.category = categories;
    }

    if (suppliers && suppliers.length > 0) {
      filters['supplier.id'] = suppliers;
    }

    if (certifications && certifications.length > 0) {
      filters.certifications = certifications;
    }

    if (nutritionalFilters) {
      for (const [nutrient, range] of Object.entries(nutritionalFilters)) {
        const filterKey = `nutritionalInfo.${nutrient}`;
        filters[filterKey] = {};
        if (range.min !== undefined) filters[filterKey].gte = range.min;
        if (range.max !== undefined) filters[filterKey].lte = range.max;
      }
    }

    // Add location-based sorting if location is provided
    const sort = [...(searchOptions.sort || [])];
    if (location) {
      sort.unshift({
        _geo_distance: {
          location,
          order: 'asc',
          unit: 'km'
        }
      });

      // Add geo distance filter if distance is specified
      if (location.distance) {
        filters._geo_distance = {
          distance: location.distance,
          location
        };
      }
    }

    // Enhanced aggregations for products
    const aggregations = {
      categories: { terms: { field: 'category', size: 20 } },
      price_ranges: {
        range: {
          field: 'price',
          ranges: [
            { to: 10 },
            { from: 10, to: 50 },
            { from: 50, to: 100 },
            { from: 100 }
          ]
        }
      },
      suppliers: { terms: { field: 'supplier.name.keyword', size: 10 } },
      certifications: { terms: { field: 'certifications', size: 15 } },
      avg_price: { avg: { field: 'price' } },
      avg_rating: { avg: { field: 'qualityScore' } }
    };

    return this.search('products', {
      ...searchOptions,
      filters,
      sort,
      aggregations,
      boost: {
        'name': 3,
        'description': 1,
        'tags': 2,
        'supplier.name': 1.5,
        ...searchOptions.boost
      }
    });
  }

  // Company search with location and industry filters
  async searchCompanies(options: SearchOptions & {
    location?: { lat: number; lon: number; distance?: string };
    types?: string[];
    industries?: string[];
    verified?: boolean;
    minRating?: number;
  } = {}): Promise<SearchResult> {
    const {
      location,
      types,
      industries,
      verified,
      minRating,
      ...searchOptions
    } = options;

    const filters: any = { ...searchOptions.filters };

    if (types && types.length > 0) {
      filters.type = types;
    }

    if (industries && industries.length > 0) {
      filters.industry = industries;
    }

    if (verified !== undefined) {
      filters.verified = verified;
    }

    if (minRating !== undefined) {
      filters.rating = { gte: minRating };
    }

    const sort = [...(searchOptions.sort || [])];
    if (location) {
      sort.unshift({
        _geo_distance: {
          'location.coordinates': location,
          order: 'asc',
          unit: 'km'
        }
      });

      if (location.distance) {
        filters._geo_distance = {
          distance: location.distance,
          'location.coordinates': location
        };
      }
    }

    const aggregations = {
      types: { terms: { field: 'type', size: 10 } },
      industries: { terms: { field: 'industry', size: 20 } },
      locations: { terms: { field: 'location.city', size: 50 } },
      rating_ranges: {
        range: {
          field: 'rating',
          ranges: [
            { from: 4.5 },
            { from: 4.0, to: 4.5 },
            { from: 3.0, to: 4.0 },
            { to: 3.0 }
          ]
        }
      }
    };

    return this.search('companies', {
      ...searchOptions,
      filters,
      sort,
      aggregations,
      boost: {
        'name': 3,
        'description': 1,
        'location.city': 1.5,
        ...searchOptions.boost
      }
    });
  }

  // Multi-index search across different entity types
  async searchAll(
    query: string,
    options: {
      indices?: string[];
      size?: number;
      from?: number;
    } = {}
  ): Promise<Record<string, SearchResult>> {
    const {
      indices = ['products', 'companies', 'users'],
      size = 10,
      from = 0
    } = options;

    const results: Record<string, SearchResult> = {};

    const searchPromises = indices.map(async (index) => {
      try {
        const result = await this.search(index, {
          query,
          size,
          from,
          highlight: true
        });
        return { index, result };
      } catch (error) {
        logger.error(`Failed to search index ${index}`, error);
        return { index, result: null };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    for (const { index, result } of searchResults) {
      if (result) {
        results[index] = result;
      }
    }

    return results;
  }

  // Suggestion/autocomplete functionality
  async suggest(
    index: string,
    text: string,
    field: string = 'suggest',
    size: number = 10
  ): Promise<string[]> {
    try {
      const response = await this.client.search({
        index,
        body: {
          suggest: {
            text_suggest: {
              prefix: text,
              completion: {
                field: `${field === 'suggest' ? 'name.suggest' : field}`,
                size
              }
            }
          }
        }
      });

      const suggestions = response.suggest?.text_suggest?.[0]?.options || [];
      return suggestions.map((option: any) => option.text);

    } catch (error) {
      logger.error('Suggestion operation failed', { index, text, error });
      return [];
    }
  }

  // Index document
  async indexDocument(
    index: string,
    id: string,
    document: any,
    refresh: boolean = false
  ): Promise<void> {
    try {
      await this.client.index({
        index,
        id,
        body: document,
        refresh: refresh ? 'wait_for' : false
      });

      // Invalidate cache
      await this.invalidateSearchCache(index);

    } catch (error) {
      logger.error('Failed to index document', { index, id, error });
      throw error;
    }
  }

  // Bulk index documents
  async bulkIndex(
    index: string,
    documents: Array<{ id: string; document: any }>,
    refresh: boolean = false
  ): Promise<void> {
    try {
      const body = documents.flatMap(({ id, document }) => [
        { index: { _index: index, _id: id } },
        document
      ]);

      const response = await this.client.bulk({
        body,
        refresh: refresh ? 'wait_for' : false
      });

      if (response.errors) {
        const errorItems = response.items.filter((item: any) =>
          item.index?.error
        );
        logger.warn('Bulk index completed with errors', {
          errorCount: errorItems.length,
          errors: errorItems
        });
      }

      await this.invalidateSearchCache(index);

    } catch (error) {
      logger.error('Bulk index operation failed', { index, error });
      throw error;
    }
  }

  // Delete document
  async deleteDocument(index: string, id: string): Promise<void> {
    try {
      await this.client.delete({
        index,
        id,
        refresh: 'wait_for'
      });

      await this.invalidateSearchCache(index);

    } catch (error) {
      if (error.statusCode !== 404) {
        logger.error('Failed to delete document', { index, id, error });
        throw error;
      }
    }
  }

  // Update document
  async updateDocument(
    index: string,
    id: string,
    document: Partial<any>,
    upsert: boolean = false
  ): Promise<void> {
    try {
      await this.client.update({
        index,
        id,
        body: {
          doc: document,
          doc_as_upsert: upsert
        },
        refresh: 'wait_for'
      });

      await this.invalidateSearchCache(index);

    } catch (error) {
      logger.error('Failed to update document', { index, id, error });
      throw error;
    }
  }

  // Get analytics/stats for an index
  async getIndexStats(index: string): Promise<any> {
    try {
      const [stats, mapping, count] = await Promise.all([
        this.client.indices.stats({ index }),
        this.client.indices.getMapping({ index }),
        this.client.count({ index })
      ]);

      return {
        documentCount: count.count,
        indexSize: stats.indices[index]?.total?.store?.size_in_bytes || 0,
        searchCount: stats.indices[index]?.total?.search?.query_total || 0,
        indexingCount: stats.indices[index]?.total?.indexing?.index_total || 0,
        mapping: mapping[index]?.mappings || {}
      };

    } catch (error) {
      logger.error('Failed to get index stats', { index, error });
      throw error;
    }
  }

  // Helper methods
  private buildSearchQuery(
    query: string,
    filters: Record<string, any>,
    fuzzy: boolean = false,
    boost: Record<string, number> = {}
  ): any {
    const must: any[] = [];
    const filter: any[] = [];

    // Main query
    if (query && query !== '*') {
      if (fuzzy) {
        must.push({
          multi_match: {
            query,
            fields: Object.keys(boost).length > 0
              ? Object.entries(boost).map(([field, boostValue]) => `${field}^${boostValue}`)
              : ['_all'],
            fuzziness: 'AUTO',
            prefix_length: 2
          }
        });
      } else {
        must.push({
          multi_match: {
            query,
            fields: Object.keys(boost).length > 0
              ? Object.entries(boost).map(([field, boostValue]) => `${field}^${boostValue}`)
              : ['_all'],
            type: 'best_fields'
          }
        });
      }
    } else {
      must.push({ match_all: {} });
    }

    // Filters
    for (const [field, value] of Object.entries(filters)) {
      if (field === '_geo_distance') {
        filter.push({ geo_distance: value });
      } else if (Array.isArray(value)) {
        filter.push({ terms: { [field]: value } });
      } else if (typeof value === 'object' && value !== null) {
        filter.push({ range: { [field]: value } });
      } else {
        filter.push({ term: { [field]: value } });
      }
    }

    return {
      bool: {
        must,
        filter
      }
    };
  }

  private buildHighlight(): any {
    return {
      fields: {
        'name': { number_of_fragments: 0 },
        'description': { fragment_size: 150, number_of_fragments: 2 },
        'tags': { number_of_fragments: 0 }
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>']
    };
  }

  private async invalidateSearchCache(index: string): Promise<void> {
    try {
      // Invalidate cached search results for this index
      const cachePattern = `search:${index}:*`;
      await optimizedCache.deletePattern(cachePattern);
    } catch (error) {
      logger.warn('Failed to invalidate search cache', { index, error });
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.client.cluster.health();
      return health.status === 'green' || health.status === 'yellow';
    } catch (error) {
      return false;
    }
  }

  // Close connection
  async close(): Promise<void> {
    try {
      await this.client.close();
      this.isConnected = false;
      logger.info('Elasticsearch connection closed');
    } catch (error) {
      logger.error('Failed to close Elasticsearch connection', error);
    }
  }
}

export const elasticsearchService = new ElasticsearchService();
