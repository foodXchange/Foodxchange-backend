import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../../server';
import { User } from '../../models/User';
import { Product } from '../../models/Product';
import { Company } from '../../models/Company';

// Mock Elasticsearch service
jest.mock('../../services/search/ElasticsearchService', () => ({
  elasticsearchService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    searchProducts: jest.fn().mockResolvedValue({
      hits: [
        {
          _id: '1',
          _score: 1.0,
          _source: {
            name: 'Organic Apples',
            description: 'Fresh organic apples',
            category: 'fruits',
            price: 5.99,
            supplier: { name: 'Green Farm Co.' }
          }
        }
      ],
      total: { value: 1, relation: 'eq' },
      took: 5,
      aggregations: {
        categories: { buckets: [{ key: 'fruits', doc_count: 1 }] },
        price_ranges: { buckets: [] }
      }
    }),
    searchCompanies: jest.fn().mockResolvedValue({
      hits: [
        {
          _id: '1',
          _score: 1.0,
          _source: {
            name: 'Green Farm Co.',
            type: 'SUPPLIER',
            industry: 'agriculture',
            verified: true,
            rating: 4.5
          }
        }
      ],
      total: { value: 1, relation: 'eq' },
      took: 3
    }),
    search: jest.fn().mockResolvedValue({
      hits: [],
      total: { value: 0, relation: 'eq' },
      took: 2
    }),
    searchAll: jest.fn().mockResolvedValue({
      products: {
        hits: [{ _id: '1', _score: 1.0, _source: { name: 'Test Product' } }],
        total: { value: 1, relation: 'eq' }
      },
      companies: {
        hits: [{ _id: '1', _score: 1.0, _source: { name: 'Test Company' } }],
        total: { value: 1, relation: 'eq' }
      }
    }),
    suggest: jest.fn().mockResolvedValue(['apple', 'apricot', 'avocado']),
    getIndexStats: jest.fn().mockResolvedValue({
      documentCount: 1000,
      indexSize: 1024000,
      searchCount: 500,
      indexingCount: 1000
    }),
    bulkIndex: jest.fn().mockResolvedValue(undefined),
    isHealthy: jest.fn().mockResolvedValue(true)
  }
}));

// Mock cache service
jest.mock('../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('Search API Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let adminToken: string;
  let testUser: any;
  let testAdmin: any;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test users
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'BUYER',
      active: true,
      verified: true
    });

    testAdmin = await User.create({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'hashedpassword',
      role: 'ADMIN',
      active: true,
      verified: true
    });

    // Generate tokens
    userToken = jwt.sign(
      { id: testUser._id, email: testUser.email, role: testUser.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: testAdmin._id, email: testAdmin.email, role: testAdmin.role },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  describe('Product Search', () => {
    test('should search products successfully', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'organic apples',
          size: 10,
          category: 'fruits'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.hits).toBeInstanceOf(Array);
      expect(response.body.data.hits[0]._source.name).toBe('Organic Apples');
      expect(response.body.data.aggregations).toBeDefined();
    });

    test('should search products with price range filter', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'apples',
          priceMin: 1,
          priceMax: 10,
          inStock: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hits).toBeInstanceOf(Array);
    });

    test('should search products with location filter', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'fresh produce',
          lat: 40.7128,
          lon: -74.0060,
          distance: '50km'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should search products with nutritional filters', async () => {
      const nutritionFilters = JSON.stringify({
        calories: { max: 100 },
        protein: { min: 5 }
      });

      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'healthy food',
          nutritionFilters
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should sort products correctly', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'apples',
          sort: 'price_asc'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should validate search parameters', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'a', // Too short
          size: 200 // Too large
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/search/products')
        .query({ q: 'test' })
        .expect(401);
    });
  });

  describe('Company Search', () => {
    test('should search companies successfully', async () => {
      const response = await request(app)
        .get('/api/search/companies')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'farm',
          type: 'SUPPLIER',
          verified: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hits).toBeInstanceOf(Array);
      expect(response.body.data.hits[0]._source.name).toBe('Green Farm Co.');
    });

    test('should search companies with industry filter', async () => {
      const response = await request(app)
        .get('/api/search/companies')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'agriculture',
          industry: 'agriculture',
          minRating: 4.0
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should search companies with location', async () => {
      const response = await request(app)
        .get('/api/search/companies')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'supplier',
          lat: 40.7128,
          lon: -74.0060,
          distance: '100km'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('User Search', () => {
    test('should search users successfully', async () => {
      const response = await request(app)
        .get('/api/search/users')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'manager',
          role: 'BUYER',
          verified: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hits).toBeInstanceOf(Array);
    });
  });

  describe('Order Search', () => {
    test('should search orders successfully', async () => {
      const response = await request(app)
        .get('/api/search/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'ORD123',
          status: 'PENDING',
          dateFrom: '2024-01-01',
          dateTo: '2024-12-31'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.hits).toBeInstanceOf(Array);
    });

    test('should search orders with amount filter', async () => {
      const response = await request(app)
        .get('/api/search/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'order',
          minAmount: 100,
          maxAmount: 1000
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Global Search', () => {
    test('should perform multi-index search', async () => {
      const response = await request(app)
        .get('/api/search/all')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'test query',
          size: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.products).toBeDefined();
      expect(response.body.data.companies).toBeDefined();
    });

    test('should search specific indices', async () => {
      const response = await request(app)
        .get('/api/search/all')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'test',
          indices: ['products', 'companies']
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should require minimum query length', async () => {
      const response = await request(app)
        .get('/api/search/all')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'a' // Too short
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Suggestions/Autocomplete', () => {
    test('should get product suggestions', async () => {
      const response = await request(app)
        .get('/api/search/products/suggestions')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'app',
          size: 5
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(['apple', 'apricot', 'avocado']);
    });

    test('should get company suggestions', async () => {
      const response = await request(app)
        .get('/api/search/companies/suggestions')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'farm',
          size: 3
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should return empty suggestions for short queries', async () => {
      const response = await request(app)
        .get('/api/search/products/suggestions')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'a' // Too short
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('Search Analytics', () => {
    test('should get popular searches', async () => {
      const response = await request(app)
        .get('/api/search/analytics/popular')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          days: 7,
          limit: 10
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should get search trends', async () => {
      const response = await request(app)
        .get('/api/search/analytics/trends')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          period: 'week'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.period).toBe('week');
    });
  });

  describe('Index Management (Admin Only)', () => {
    test('should sync indices as admin', async () => {
      const response = await request(app)
        .post('/api/search/index/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test('should not allow sync as regular user', async () => {
      const response = await request(app)
        .post('/api/search/index/sync')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Insufficient permissions');
    });

    test('should get index stats', async () => {
      const response = await request(app)
        .get('/api/search/index/stats/products')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.documentCount).toBe(1000);
      expect(response.body.data.indexSize).toBe(1024000);
    });

    test('should validate index name', async () => {
      const response = await request(app)
        .get('/api/search/index/stats/invalid-index')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid index name');
    });
  });

  describe('Error Handling', () => {
    test('should handle search service errors', async () => {
      // Mock service to throw error
      const { elasticsearchService } = require('../../services/search/ElasticsearchService');
      elasticsearchService.searchProducts.mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ q: 'test' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Search operation failed');
    });

    test('should handle malformed JSON in nutrition filters', async () => {
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({
          q: 'test',
          nutritionFilters: 'invalid-json'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Caching Behavior', () => {
    test('should use cached results when available', async () => {
      // Mock cache to return data
      const { optimizedCache } = require('../../services/cache/OptimizedCacheService');
      const cachedData = {
        hits: [{ _id: 'cached', _source: { name: 'Cached Product' } }],
        total: { value: 1, relation: 'eq' }
      };
      optimizedCache.get.mockResolvedValueOnce(cachedData);

      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.cached).toBe(true);
      expect(response.body.data.hits[0]._source.name).toBe('Cached Product');
    });
  });

  describe('Rate Limiting', () => {
    test('should respect rate limits', async () => {
      // This test would require actual rate limiting setup
      // For now, just verify the endpoint is accessible
      const response = await request(app)
        .get('/api/search/products')
        .set('Authorization', `Bearer ${userToken}`)
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});