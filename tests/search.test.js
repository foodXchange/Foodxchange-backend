// ===================================
// 📁 SEARCH SYSTEM TESTING SUITE
// ===================================

// 📄 test/search.test.js
const request = require('supertest');
const app = require('../app');
const { esClient } = require('../config/elasticsearch');
const { testConnection, createIndices } = require('../config/elasticsearch');
const indexingService = require('../services/indexingService');

describe('FoodXchange Search System', () => {
  let authToken;
  let testProductId;

  beforeAll(async () => {
    // Setup test environment
    await testConnection();
    await createIndices();
    
    // Create test user and get auth token
    const userResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        userType: 'buyer'
      });
    
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    authToken = loginResponse.body.token;
  });

  afterAll(async () => {
    // Cleanup test data
    await esClient.indices.delete({ 
      index: 'foodxchange_products',
      ignore_unavailable: true 
    });
  });

  describe('Basic Search Functionality', () => {
    test('should perform basic text search', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ query: 'organic wheat' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('hits');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('aggregations');
    });

    test('should filter by category', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ 
          query: 'wheat',
          category: 'grains'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All results should be in grains category
      response.body.data.hits.forEach(hit => {
        expect(hit.category).toBe('grains');
      });
    });

    test('should filter by price range', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ 
          query: 'wheat',
          priceMin: 10,
          priceMax: 50
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // All results should be within price range
      response.body.data.hits.forEach(hit => {
        if (hit.pricing && hit.pricing.minPrice) {
          expect(hit.pricing.minPrice).toBeGreaterThanOrEqual(10);
          expect(hit.pricing.minPrice).toBeLessThanOrEqual(50);
        }
      });
    });

    test('should filter by certifications', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ 
          query: 'wheat',
          certifications: 'organic,fair-trade'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Results should have organic or fair-trade certification
      response.body.data.hits.forEach(hit => {
        if (hit.certifications && hit.certifications.length > 0) {
          const hasRequiredCert = hit.certifications.some(cert => 
            ['organic', 'fair-trade'].includes(cert)
          );
          expect(hasRequiredCert).toBe(true);
        }
      });
    });

    test('should perform location-based search', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ 
          query: 'wheat',
          lat: 32.0853, // Tel Aviv coordinates
          lon: 34.7818,
          radius: 100
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Results should include distance information
      response.body.data.hits.forEach(hit => {
        if (hit.distance) {
          expect(hit.distance.value).toBeLessThanOrEqual(100);
          expect(hit.distance.unit).toBe('km');
        }
      });
    });
  });

  describe('Advanced Search Features', () => {
    test('should perform advanced search with complex filters', async () => {
      const response = await request(app)
        .post('/api/v1/search/advanced')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'organic products',
          filters: {
            category: 'grains',
            certifications: ['organic', 'fair-trade'],
            priceRange: {
              min: 5,
              max: 100
            },
            availability: {
              inStock: true,
              maxLeadTime: 30
            },
            nutritional: {
              protein: {
                min: 10
              }
            }
          },
          sort: 'price_low',
          limit: 20
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.hits).toBeDefined();
      expect(response.body.searchType).toBe('advanced');
    });

    test('should exclude products with allergens', async () => {
      const response = await request(app)
        .post('/api/v1/search/advanced')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'bread',
          filters: {
            allergens: ['gluten', 'nuts']
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Results should not contain specified allergens
      response.body.data.hits.forEach(hit => {
        if (hit.allergens && hit.allergens.length > 0) {
          const hasExcludedAllergens = hit.allergens.some(allergen => 
            ['gluten', 'nuts'].includes(allergen)
          );
          expect(hasExcludedAllergens).toBe(false);
        }
      });
    });
  });

  describe('Autocomplete & Suggestions', () => {
    test('should provide autocomplete suggestions', async () => {
      const response = await request(app)
        .get('/api/v1/suggest')
        .query({ q: 'whe' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      response.body.data.forEach(suggestion => {
        expect(suggestion).toHaveProperty('text');
        expect(suggestion).toHaveProperty('type');
        expect(suggestion.text.toLowerCase()).toContain('whe');
      });
    });

    test('should provide category suggestions', async () => {
      const response = await request(app)
        .get('/api/v1/suggest')
        .query({ 
          q: 'grain',
          type: 'categories'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      response.body.data.forEach(suggestion => {
        expect(suggestion.type).toBe('category');
        expect(suggestion.text.toLowerCase()).toContain('grain');
      });
    });

    test('should provide supplier suggestions', async () => {
      const response = await request(app)
        .get('/api/v1/suggest')
        .query({ 
          q: 'agri',
          type: 'suppliers'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      response.body.data.forEach(suggestion => {
        expect(suggestion.type).toBe('supplier');
      });
    });
  });

  describe('Similar Products', () => {
    test('should find similar products', async () => {
      // First create a test product
      const productResponse = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Organic Wheat Flour',
          description: 'Premium organic wheat flour',
          category: 'grains',
          subcategory: 'flour',
          certifications: ['organic'],
          pricing: {
            minPrice: 25,
            currency: 'USD'
          }
        });

      testProductId = productResponse.body.data._id;

      // Index the product
      await indexingService.indexProduct(testProductId);

      const response = await request(app)
        .get(`/api/v1/products/${testProductId}/similar`)
        .query({ limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.productId).toBe(testProductId);
      
      response.body.data.forEach(product => {
        expect(product).toHaveProperty('similarity');
        expect(product.id).not.toBe(testProductId);
      });
    });
  });

  describe('Search Filters & Facets', () => {
    test('should get available filters', async () => {
      const response = await request(app)
        .get('/api/v1/filters');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('categories');
      expect(response.body.data).toHaveProperty('certifications');
      expect(response.body.data).toHaveProperty('suppliers');
      expect(response.body.data).toHaveProperty('priceRanges');
      expect(response.body.data).toHaveProperty('priceStats');
    });

    test('should get category-specific filters', async () => {
      const response = await request(app)
        .get('/api/v1/filters/grains');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.category).toBe('grains');
      expect(response.body.data.subcategories).toBeDefined();
    });

    test('should get trending searches', async () => {
      const response = await request(app)
        .get('/api/v1/trending');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Saved Searches', () => {
    let savedSearchId;

    test('should save a search', async () => {
      const response = await request(app)
        .post('/api/v1/search/save')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Organic Grains',
          query: 'organic wheat',
          filters: {
            category: 'grains',
            certifications: ['organic']
          },
          notifications: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('Organic Grains');
      
      savedSearchId = response.body.data._id;
    });

    test('should get saved searches', async () => {
      const response = await request(app)
        .get('/api/v1/search/saved')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should delete saved search', async () => {
      const response = await request(app)
        .delete(`/api/v1/search/saved/${savedSearchId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Search History', () => {
    test('should track search history', async () => {
      // Perform a search to generate history
      await request(app)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ query: 'test search for history' });

      const response = await request(app)
        .get('/api/v1/search/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should clear search history', async () => {
      const response = await request(app)
        .delete('/api/v1/search/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Search Validation', () => {
    test('should validate search parameters', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ 
          query: 'a'.repeat(201), // Too long
          priceMin: -5, // Invalid
          lat: 200 // Out of range
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('should validate advanced search body', async () => {
      const response = await request(app)
        .post('/api/v1/search/advanced')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          query: 'a'.repeat(501), // Too long
          filters: 'invalid', // Should be object
          sort: 'invalid_sort' // Invalid option
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Performance & Load Testing', () => {
    test('should handle concurrent searches', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .get('/api/v1/search')
            .query({ query: `concurrent test ${i}` })
        );
      }

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/v1/search')
        .query({ query: 'performance test' });

      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });
  });
});

// ===================================
// 📁 SEARCH SETUP & CONFIGURATION GUIDE
// ===================================

// 📄 docs/search-setup-guide.md
const setupGuide = `
# FoodXchange Search System Setup Guide

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 16+ installed
- Elasticsearch 8.x running
- Redis server running
- MongoDB database configured

### 2. Environment Variables
Add to your .env file:

\`\`\`env
# Elasticsearch Configuration
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=your_password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password

# Search Configuration
SEARCH_CACHE_TTL=300
SEARCH_MAX_RESULTS=1000
SEARCH_DEFAULT_LIMIT=20
\`\`\`

### 3. Installation

\`\`\`bash
# Install dependencies
npm install @elastic/elasticsearch redis natural fuse.js node-cron

# Initialize search system
npm run search:init

# Start the application
npm start
\`\`\`

### 4. Verify Installation

\`\`\`bash
# Test Elasticsearch connection
curl http://localhost:9200/_cluster/health

# Test search endpoint
curl "http://localhost:3000/api/v1/search?query=wheat"

# Check index status
curl "http://localhost:9200/foodxchange_products/_stats"
\`\`\`

## 🔧 Configuration Options

### Elasticsearch Mapping Customization

\`\`\`javascript
// Customize search analyzers in config/mappings/productMapping.json
{
  "settings": {
    "analysis": {
      "filter": {
        "food_synonyms": {
          "type": "synonym",
          "synonyms": [
            "corn,maize,sweetcorn",
            "wheat,grain,cereal"
            // Add your custom synonyms here
          ]
        }
      }
    }
  }
}
\`\`\`

### Search Performance Tuning

\`\`\`javascript
// config/search.js
module.exports = {
  // Cache settings
  cache: {
    ttl: process.env.SEARCH_CACHE_TTL || 300,
    prefix: 'search:',
    enabled: true
  },
  
  // Pagination limits
  pagination: {
    maxLimit: 100,
    defaultLimit: 20,
    maxPage: 100
  },
  
  // Search timeouts
  timeouts: {
    search: 30000,
    suggest: 5000,
    reindex: 300000
  },
  
  // Relevance scoring
  scoring: {
    boosts: {
      exact_match: 10,
      name_field: 5,
      description_field: 2,
      tag_field: 1.5
    }
  }
};
\`\`\`

## 📊 Monitoring & Analytics

### Search Analytics Dashboard

\`\`\`javascript
// Get search analytics (admin only)
GET /api/v1/admin/analytics?days=30

// Response includes:
{
  "totalSearches": 15432,
  "topQueries": [...],
  "topCategories": [...],
  "zeroResultQueries": [...],
  "dailySearches": [...],
  "averageSearchesPerDay": 514
}
\`\`\`

### Performance Monitoring

\`\`\`bash
# Monitor Elasticsearch performance
curl "http://localhost:9200/_nodes/stats"

# Check index size and document count
curl "http://localhost:9200/foodxchange_products/_stats"

# Monitor search latency
curl "http://localhost:9200/_nodes/stats/indices/search"
\`\`\`

## 🔄 Maintenance Tasks

### Automated Reindexing

\`\`\`javascript
// Schedule regular reindexing
const cron = require('node-cron');

// Daily incremental reindex at 2 AM
cron.schedule('0 2 * * *', async () => {
  await indexingService.incrementalIndex();
});

// Weekly full reindex on Sundays at 3 AM
cron.schedule('0 3 * * 0', async () => {
  await indexingService.reindexAll();
});
\`\`\`

### Cache Management

\`\`\`bash
# Clear search cache
curl -X DELETE "http://localhost:3000/api/v1/admin/cache"

# Clear specific cache pattern
curl -X DELETE "http://localhost:3000/api/v1/admin/cache?pattern=search:category:*"
\`\`\`

## 🐛 Troubleshooting

### Common Issues

1. **Elasticsearch Connection Failed**
   - Check if Elasticsearch is running
   - Verify connection URL and credentials
   - Check firewall settings

2. **Search Returns No Results**
   - Verify products are indexed: \`GET /api/v1/admin/analytics\`
   - Check index mapping: \`GET http://localhost:9200/foodxchange_products/_mapping\`
   - Test with simple queries first

3. **Slow Search Performance**
   - Enable Redis caching
   - Optimize Elasticsearch queries
   - Consider index warming

4. **Memory Issues**
   - Adjust Elasticsearch heap size
   - Optimize query complexity
   - Implement result pagination

### Debug Mode

\`\`\`javascript
// Enable debug logging
process.env.DEBUG = 'search:*';

// Log Elasticsearch queries
process.env.ELASTICSEARCH_TRACE = true;
\`\`\`

## 📈 Scaling Considerations

### Horizontal Scaling

1. **Elasticsearch Cluster**
   - Use multiple nodes for high availability
   - Configure proper shard distribution
   - Set up cross-cluster replication

2. **Redis Cluster**
   - Use Redis Cluster for cache scaling
   - Implement consistent hashing
   - Set up master-slave replication

3. **Application Load Balancing**
   - Use sticky sessions for search state
   - Implement circuit breakers
   - Set up health checks

### Performance Optimization

1. **Index Optimization**
   - Use appropriate shard sizes
   - Implement index lifecycle management
   - Regular index optimization

2. **Query Optimization**
   - Use filter context when possible
   - Implement query result caching
   - Optimize aggregation queries

3. **Caching Strategy**
   - Multi-level caching (Redis + Application)
   - Smart cache invalidation
   - Cache warming strategies

## 🔐 Security Best Practices

### Authentication & Authorization

\`\`\`javascript
// Implement role-based search access
const authorize = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Insufficient permissions' 
    });
  }
  next();
};

// Protect admin endpoints
router.get('/admin/analytics', 
  auth, 
  authorize(['admin']), 
  searchController.getAnalytics
);
\`\`\`

### Input Validation & Sanitization

\`\`\`javascript
// Implement comprehensive input validation
const { body, query } = require('express-validator');

const sanitizeQuery = (req, res, next) => {
  if (req.query.query) {
    // Remove potential script injections
    req.query.query = req.query.query
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }
  next();
};
\`\`\`

## 🚀 Advanced Features

### Custom Search Algorithms

\`\`\`javascript
// Implement business-specific ranking
const customScoring = {
  function_score: {
    query: baseQuery,
    functions: [
      {
        filter: { term: { 'supplier.verified': true } },
        weight: 1.5
      },
      {
        filter: { range: { 'availability.leadTime': { lte: 7 } } },
        weight: 1.3
      },
      {
        field_value_factor: {
          field: 'popularity',
          factor: 0.1,
          modifier: 'log1p'
        }
      }
    ],
    score_mode: 'multiply',
    boost_mode: 'multiply'
  }
};
\`\`\`

### Machine Learning Integration

\`\`\`javascript
// Implement search result ranking ML
const rankingModel = require('./ml/ranking-model');

async function enhanceResults(results, userProfile) {
  return await rankingModel.rank(results, {
    userId: userProfile.id,
    searchHistory: userProfile.searchHistory,
    preferences: userProfile.preferences
  });
}
\`\`\`

## 📞 Support & Resources

- **Documentation**: /docs/search-api.md
- **API Reference**: /docs/api-reference.md
- **Troubleshooting**: /docs/troubleshooting.md
- **Performance Guide**: /docs/performance-optimization.md

For additional support, contact the development team or create an issue in the project repository.
`;

// ===================================
// 📁 PACKAGE.JSON SCRIPTS
// ===================================

const packageScripts = {
  "scripts": {
    // Search-specific scripts
    "search:init": "node scripts/initializeSearch.js",
    "search:reindex": "node scripts/reindexProducts.js",
    "search:test": "jest test/search.test.js",
    "search:benchmark": "node scripts/searchBenchmark.js",
    "search:clear-cache": "node scripts/clearSearchCache.js",
    
    // Development scripts
    "dev:search": "nodemon -w services/searchService.js -w config/elasticsearch.js",
    "debug:search": "DEBUG=search:* npm start",
    
    // Production scripts
    "prod:search:warmup": "node scripts/warmupSearchCache.js",
    "prod:search:monitor": "node scripts/monitorSearchHealth.js"
  },
  
  "dependencies": {
    "@elastic/elasticsearch": "^8.10.0",
    "redis": "^4.6.10",
    "natural": "^6.10.0",
    "fuse.js": "^7.0.0",
    "node-cron": "^3.0.3",
    "express-validator": "^7.0.1"
  },
  
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
};

module.exports = {
  setupGuide,
  packageScripts
};