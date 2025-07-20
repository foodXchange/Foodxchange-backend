import { ElasticsearchService } from '../../../../services/search/ElasticsearchService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';

// Mock Elasticsearch client
jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    cluster: {
      health: jest.fn().mockResolvedValue({
        cluster_name: 'test-cluster',
        status: 'green'
      })
    },
    indices: {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({ acknowledged: true }),
      stats: jest.fn().mockResolvedValue({
        indices: {
          'test-index': {
            total: {
              store: { size_in_bytes: 1024 },
              search: { query_total: 100 },
              indexing: { index_total: 50 }
            }
          }
        }
      }),
      getMapping: jest.fn().mockResolvedValue({
        'test-index': {
          mappings: { properties: {} }
        }
      })
    },
    search: jest.fn().mockResolvedValue({
      hits: {
        hits: [
          {
            _id: '1',
            _score: 1.0,
            _source: { name: 'Test Product', price: 10.99 },
            highlight: { name: ['<mark>Test</mark> Product'] }
          }
        ],
        total: { value: 1, relation: 'eq' }
      },
      aggregations: {},
      took: 5,
      suggest: {
        text_suggest: [{
          options: [
            { text: 'test suggestion 1' },
            { text: 'test suggestion 2' }
          ]
        }]
      }
    }),
    index: jest.fn().mockResolvedValue({ _id: '1' }),
    bulk: jest.fn().mockResolvedValue({
      errors: false,
      items: [{ index: { _id: '1' } }]
    }),
    delete: jest.fn().mockResolvedValue({ _id: '1' }),
    update: jest.fn().mockResolvedValue({ _id: '1' }),
    count: jest.fn().mockResolvedValue({ count: 100 }),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock cache service
jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    deletePattern: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock logger
jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('ElasticsearchService', () => {
  let elasticsearchService: ElasticsearchService;

  beforeEach(() => {
    elasticsearchService = new ElasticsearchService();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await expect(elasticsearchService.initialize()).resolves.toBeUndefined();
    });

    test('should handle initialization errors', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.cluster.health = jest.fn().mockRejectedValue(new Error('Connection failed'));

      await expect(elasticsearchService.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('search functionality', () => {
    beforeEach(async () => {
      await elasticsearchService.initialize();
    });

    test('should perform basic search', async () => {
      const result = await elasticsearchService.search('products', {
        query: 'test',
        size: 10,
        from: 0
      });

      expect(result).toEqual({
        hits: [{
          _id: '1',
          _score: 1.0,
          _source: { name: 'Test Product', price: 10.99 },
          highlight: { name: ['<mark>Test</mark> Product'] }
        }],
        total: { value: 1, relation: 'eq' },
        aggregations: {},
        took: 5
      });
    });

    test('should handle search with filters', async () => {
      const filters = {
        category: 'electronics',
        price: { gte: 10, lte: 100 }
      };

      await elasticsearchService.search('products', {
        query: 'laptop',
        filters,
        size: 20
      });

      const mockClient = elasticsearchService['client'];
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'products',
          body: expect.objectContaining({
            query: expect.objectContaining({
              bool: {
                must: expect.arrayContaining([
                  expect.objectContaining({
                    multi_match: expect.objectContaining({
                      query: 'laptop'
                    })
                  })
                ]),
                filter: expect.arrayContaining([
                  { term: { category: 'electronics' } },
                  { range: { price: { gte: 10, lte: 100 } } }
                ])
              }
            }),
            size: 20
          })
        })
      );
    });

    test('should perform product search with enhanced filters', async () => {
      const searchOptions = {
        query: 'organic',
        priceRange: { min: 5, max: 50 },
        categories: ['vegetables', 'fruits'],
        inStock: true,
        location: { lat: 40.7128, lon: -74.0060, distance: '10km' }
      };

      const result = await elasticsearchService.searchProducts(searchOptions);

      expect(result).toBeDefined();
      expect(result.hits).toBeInstanceOf(Array);
    });

    test('should perform company search', async () => {
      const searchOptions = {
        query: 'food supplier',
        types: ['SUPPLIER'],
        verified: true,
        minRating: 4.0
      };

      const result = await elasticsearchService.searchCompanies(searchOptions);

      expect(result).toBeDefined();
      expect(result.hits).toBeInstanceOf(Array);
    });

    test('should perform multi-index search', async () => {
      const result = await elasticsearchService.searchAll('test query', {
        indices: ['products', 'companies'],
        size: 5
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('suggestions', () => {
    beforeEach(async () => {
      await elasticsearchService.initialize();
    });

    test('should get suggestions', async () => {
      const suggestions = await elasticsearchService.suggest('products', 'test', 'suggest', 5);

      expect(suggestions).toEqual(['test suggestion 1', 'test suggestion 2']);
    });

    test('should handle suggestion errors gracefully', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.search = jest.fn().mockRejectedValue(new Error('Search failed'));

      const suggestions = await elasticsearchService.suggest('products', 'test');

      expect(suggestions).toEqual([]);
    });
  });

  describe('document management', () => {
    beforeEach(async () => {
      await elasticsearchService.initialize();
    });

    test('should index document', async () => {
      const document = { name: 'Test Product', price: 10.99 };

      await elasticsearchService.indexDocument('products', '1', document);

      const mockClient = elasticsearchService['client'];
      expect(mockClient.index).toHaveBeenCalledWith({
        index: 'products',
        id: '1',
        body: document,
        refresh: false
      });
    });

    test('should bulk index documents', async () => {
      const documents = [
        { id: '1', document: { name: 'Product 1' } },
        { id: '2', document: { name: 'Product 2' } }
      ];

      await elasticsearchService.bulkIndex('products', documents);

      const mockClient = elasticsearchService['client'];
      expect(mockClient.bulk).toHaveBeenCalledWith({
        body: [
          { index: { _index: 'products', _id: '1' } },
          { name: 'Product 1' },
          { index: { _index: 'products', _id: '2' } },
          { name: 'Product 2' }
        ],
        refresh: false
      });
    });

    test('should handle bulk index errors', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.bulk = jest.fn().mockResolvedValue({
        errors: true,
        items: [
          { index: { _id: '1' } },
          { index: { _id: '2', error: { reason: 'Document rejected' } } }
        ]
      });

      const documents = [
        { id: '1', document: { name: 'Product 1' } },
        { id: '2', document: { name: 'Product 2' } }
      ];

      await elasticsearchService.bulkIndex('products', documents);

      // Should complete without throwing, but log warnings
      expect(mockClient.bulk).toHaveBeenCalled();
    });

    test('should delete document', async () => {
      await elasticsearchService.deleteDocument('products', '1');

      const mockClient = elasticsearchService['client'];
      expect(mockClient.delete).toHaveBeenCalledWith({
        index: 'products',
        id: '1',
        refresh: 'wait_for'
      });
    });

    test('should handle delete not found gracefully', async () => {
      const mockClient = elasticsearchService['client'];
      const notFoundError = new Error('Not found');
      (notFoundError as any).statusCode = 404;
      mockClient.delete = jest.fn().mockRejectedValue(notFoundError);

      await expect(elasticsearchService.deleteDocument('products', '1')).resolves.toBeUndefined();
    });

    test('should update document', async () => {
      const updateData = { price: 15.99 };

      await elasticsearchService.updateDocument('products', '1', updateData);

      const mockClient = elasticsearchService['client'];
      expect(mockClient.update).toHaveBeenCalledWith({
        index: 'products',
        id: '1',
        body: {
          doc: updateData,
          doc_as_upsert: false
        },
        refresh: 'wait_for'
      });
    });
  });

  describe('analytics and stats', () => {
    beforeEach(async () => {
      await elasticsearchService.initialize();
    });

    test('should get index stats', async () => {
      const stats = await elasticsearchService.getIndexStats('products');

      expect(stats).toEqual({
        documentCount: 100,
        indexSize: 1024,
        searchCount: 100,
        indexingCount: 50,
        mapping: {}
      });
    });
  });

  describe('query building', () => {
    test('should build search query with filters', () => {
      const service = new ElasticsearchService();
      const query = service['buildSearchQuery'](
        'test query',
        {
          category: 'electronics',
          price: { gte: 10, lte: 100 },
          tags: ['new', 'sale']
        },
        false,
        { name: 2, description: 1 }
      );

      expect(query).toEqual({
        bool: {
          must: [{
            multi_match: {
              query: 'test query',
              fields: ['name^2', 'description^1'],
              type: 'best_fields'
            }
          }],
          filter: [
            { term: { category: 'electronics' } },
            { range: { price: { gte: 10, lte: 100 } } },
            { terms: { tags: ['new', 'sale'] } }
          ]
        }
      });
    });

    test('should build fuzzy search query', () => {
      const service = new ElasticsearchService();
      const query = service['buildSearchQuery'](
        'test query',
        {},
        true,
        { name: 2 }
      );

      expect(query.bool.must[0]).toEqual({
        multi_match: {
          query: 'test query',
          fields: ['name^2'],
          fuzziness: 'AUTO',
          prefix_length: 2
        }
      });
    });

    test('should build match_all query for empty search', () => {
      const service = new ElasticsearchService();
      const query = service['buildSearchQuery']('', {});

      expect(query.bool.must[0]).toEqual({ match_all: {} });
    });
  });

  describe('health check', () => {
    test('should return healthy status', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.cluster.health = jest.fn().mockResolvedValue({ status: 'green' });

      const isHealthy = await elasticsearchService.isHealthy();
      expect(isHealthy).toBe(true);
    });

    test('should return healthy status for yellow cluster', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.cluster.health = jest.fn().mockResolvedValue({ status: 'yellow' });

      const isHealthy = await elasticsearchService.isHealthy();
      expect(isHealthy).toBe(true);
    });

    test('should return unhealthy status for red cluster', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.cluster.health = jest.fn().mockResolvedValue({ status: 'red' });

      const isHealthy = await elasticsearchService.isHealthy();
      expect(isHealthy).toBe(false);
    });

    test('should handle health check errors', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.cluster.health = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await elasticsearchService.isHealthy();
      expect(isHealthy).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('should close connection', async () => {
      await elasticsearchService.close();

      const mockClient = elasticsearchService['client'];
      expect(mockClient.close).toHaveBeenCalled();
    });
  });

  describe('cache invalidation', () => {
    test('should invalidate search cache on document operations', async () => {
      await elasticsearchService.initialize();
      
      await elasticsearchService.indexDocument('products', '1', { name: 'Test' });

      expect(optimizedCache.deletePattern).toHaveBeenCalledWith('search:products:*');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await elasticsearchService.initialize();
    });

    test('should handle search errors', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.search = jest.fn().mockRejectedValue(new Error('Search failed'));

      await expect(elasticsearchService.search('products', { query: 'test' }))
        .rejects.toThrow('Search failed');
    });

    test('should handle indexing errors', async () => {
      const mockClient = elasticsearchService['client'];
      mockClient.index = jest.fn().mockRejectedValue(new Error('Index failed'));

      await expect(elasticsearchService.indexDocument('products', '1', { name: 'Test' }))
        .rejects.toThrow('Index failed');
    });
  });
});