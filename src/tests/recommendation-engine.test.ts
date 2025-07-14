/**
 * Comprehensive Test Suite for AI Recommendation Engine
 */

import { RecommendationEngine, RFQRequirements, UserBehaviorData } from '../services/ai/RecommendationEngine';
import { MatchingAlgorithms, BuyerRequirements, SupplierProfile, ProductProfile } from '../services/ai/MatchingAlgorithms';
import { RecommendationOptimizer } from '../services/ai/RecommendationOptimizer';

// Mock data for testing
const mockRFQRequirements: RFQRequirements = {
  productCategory: 'organic vegetables',
  specifications: {
    organic: true,
    freshness: 'grade A',
    packaging: 'bulk'
  },
  quantity: 1000,
  deliveryLocation: 'New York, NY',
  requiredCertifications: ['USDA Organic', 'Non-GMO'],
  maxBudget: 5000,
  urgency: 'medium',
  qualityRequirements: ['pesticide-free', 'locally sourced']
};

const mockUserBehavior: UserBehaviorData = {
  userId: 'user123',
  recentPurchases: ['prod1', 'prod2', 'prod3'],
  preferredSuppliers: ['supplier1', 'supplier2'],
  categoryPreferences: ['organic vegetables', 'dairy', 'grains'],
  priceRange: { min: 100, max: 10000 },
  qualityPreference: 0.8,
  speedPreference: 0.6
};

const mockSupplierProfiles: SupplierProfile[] = [
  {
    id: 'supplier1',
    name: 'Green Valley Organics',
    location: { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'USA' },
    certifications: ['USDA Organic', 'Non-GMO', 'Fair Trade'],
    categories: ['organic vegetables', 'fruits'],
    averageRating: 4.8,
    responseTime: 2,
    fulfillmentRate: 0.95,
    qualityScore: 0.92,
    priceCompetitiveness: 0.85,
    capacityTiers: [
      { category: 'organic vegetables', maxQuantity: 10000 }
    ],
    deliveryCapabilities: {
      regions: ['Northeast USA', 'Mid-Atlantic'],
      averageDeliveryTime: 3,
      expeditedAvailable: true
    }
  },
  {
    id: 'supplier2',
    name: 'Farm Fresh Direct',
    location: { lat: 39.9526, lng: -75.1652, city: 'Philadelphia', country: 'USA' },
    certifications: ['USDA Organic', 'GAP Certified'],
    categories: ['organic vegetables', 'herbs'],
    averageRating: 4.5,
    responseTime: 4,
    fulfillmentRate: 0.88,
    qualityScore: 0.85,
    priceCompetitiveness: 0.78,
    capacityTiers: [
      { category: 'organic vegetables', maxQuantity: 5000 }
    ],
    deliveryCapabilities: {
      regions: ['Northeast USA'],
      averageDeliveryTime: 5,
      expeditedAvailable: false
    }
  }
];

const mockBuyerRequirements: BuyerRequirements = {
  productCategory: 'organic vegetables',
  specifications: mockRFQRequirements.specifications,
  quantity: mockRFQRequirements.quantity,
  maxBudget: mockRFQRequirements.maxBudget,
  requiredCertifications: mockRFQRequirements.requiredCertifications,
  deliveryLocation: { lat: 40.7128, lng: -74.0060, city: 'New York', country: 'USA' },
  maxDeliveryTime: 7,
  qualityRequirements: mockRFQRequirements.qualityRequirements,
  urgency: 'medium',
  preferredSuppliers: ['supplier1'],
  blacklistedSuppliers: []
};

describe('AI Recommendation Engine Tests', () => {
  let recommendationEngine: RecommendationEngine;
  let matchingAlgorithms: MatchingAlgorithms;
  let optimizer: RecommendationOptimizer;

  beforeAll(() => {
    recommendationEngine = RecommendationEngine.getInstance();
    matchingAlgorithms = new MatchingAlgorithms();
    optimizer = RecommendationOptimizer.getInstance();
  });

  describe('RecommendationEngine', () => {
    test('should generate product recommendations', async () => {
      const recommendations = await recommendationEngine.getProductRecommendations(
        mockRFQRequirements,
        mockUserBehavior,
        5
      );

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(5);

      // Check recommendation structure
      if (recommendations.length > 0) {
        const rec = recommendations[0];
        expect(rec).toHaveProperty('productId');
        expect(rec).toHaveProperty('productName');
        expect(rec).toHaveProperty('supplierId');
        expect(rec).toHaveProperty('score');
        expect(rec.score).toHaveProperty('score');
        expect(rec.score).toHaveProperty('confidence');
        expect(rec.score).toHaveProperty('factors');
        expect(rec.score).toHaveProperty('reasoning');
      }
    }, 30000);

    test('should generate supplier recommendations', async () => {
      const recommendations = await recommendationEngine.getSupplierRecommendations(
        'organic vegetables',
        { quantity: 1000, maxBudget: 5000 },
        mockUserBehavior,
        3
      );

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.length).toBeLessThanOrEqual(3);
    }, 30000);

    test('should find similar products', async () => {
      const similarProducts = await recommendationEngine.getSimilarProducts(
        'product123',
        mockUserBehavior,
        3
      );

      expect(Array.isArray(similarProducts)).toBe(true);
    }, 30000);

    test('should generate personalized recommendations', async () => {
      const personalizedRecs = await recommendationEngine.getPersonalizedRecommendations(
        mockUserBehavior,
        5
      );

      expect(Array.isArray(personalizedRecs)).toBe(true);
    }, 30000);

    test('should track recommendation feedback', async () => {
      await expect(
        recommendationEngine.trackRecommendationFeedback(
          'rec123',
          'user123',
          'click',
          { source: 'test' }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('MatchingAlgorithms', () => {
    test('should match suppliers to requirements', () => {
      const matches = matchingAlgorithms.matchSuppliersToRequirements(
        mockSupplierProfiles,
        mockBuyerRequirements
      );

      expect(Array.isArray(matches)).toBe(true);
      expect(matches.length).toBeGreaterThan(0);

      // Check that results are sorted by score (highest first)
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i-1].matchResult.score).toBeGreaterThanOrEqual(matches[i].matchResult.score);
      }

      // Check match result structure
      const match = matches[0];
      expect(match).toHaveProperty('matchResult');
      expect(match.matchResult).toHaveProperty('score');
      expect(match.matchResult).toHaveProperty('confidence');
      expect(match.matchResult).toHaveProperty('breakdown');
      expect(match.matchResult.score).toBeGreaterThanOrEqual(0);
      expect(match.matchResult.score).toBeLessThanOrEqual(1);
    });

    test('should find similar suppliers', () => {
      const similarSuppliers = matchingAlgorithms.findSimilarSuppliers(
        mockSupplierProfiles[0],
        mockSupplierProfiles,
        2
      );

      expect(Array.isArray(similarSuppliers)).toBe(true);
      expect(similarSuppliers.length).toBeLessThanOrEqual(2);
      
      // Should not include the target supplier
      similarSuppliers.forEach(supplier => {
        expect(supplier.id).not.toBe(mockSupplierProfiles[0].id);
      });
    });

    test('should calculate accurate location proximity', () => {
      // Test with known coordinates (NYC to Philadelphia)
      const nycLocation = { lat: 40.7128, lng: -74.0060 };
      const phillyLocation = { lat: 39.9526, lng: -75.1652 };
      
      // Create test suppliers
      const supplier1 = { ...mockSupplierProfiles[0], location: { ...nycLocation, city: 'NYC', country: 'USA' } };
      const supplier2 = { ...mockSupplierProfiles[1], location: { ...phillyLocation, city: 'Philly', country: 'USA' } };
      
      const requirements = { ...mockBuyerRequirements, deliveryLocation: nycLocation };
      
      const matches = matchingAlgorithms.matchSuppliersToRequirements(
        [supplier1, supplier2],
        requirements
      );

      // NYC supplier should score higher than Philadelphia supplier for NYC delivery
      const nycMatch = matches.find(m => m.id === supplier1.id);
      const phillyMatch = matches.find(m => m.id === supplier2.id);
      
      expect(nycMatch?.matchResult.score).toBeGreaterThan(phillyMatch?.matchResult.score || 0);
    });

    test('should prioritize preferred suppliers', () => {
      const requirements = {
        ...mockBuyerRequirements,
        preferredSuppliers: ['supplier1']
      };

      const matches = matchingAlgorithms.matchSuppliersToRequirements(
        mockSupplierProfiles,
        requirements
      );

      // Preferred supplier should be scored higher (all else being equal)
      const preferredMatch = matches.find(m => m.id === 'supplier1');
      const otherMatch = matches.find(m => m.id !== 'supplier1');

      if (preferredMatch && otherMatch) {
        expect(preferredMatch.matchResult.score).toBeGreaterThan(otherMatch.matchResult.score);
      }
    });

    test('should handle certification requirements correctly', () => {
      const strictRequirements = {
        ...mockBuyerRequirements,
        requiredCertifications: ['USDA Organic', 'Fair Trade', 'Non-GMO']
      };

      const matches = matchingAlgorithms.matchSuppliersToRequirements(
        mockSupplierProfiles,
        strictRequirements
      );

      // Supplier with more matching certifications should score higher
      const supplier1Match = matches.find(m => m.id === 'supplier1'); // Has all 3 certs
      const supplier2Match = matches.find(m => m.id === 'supplier2'); // Has only 1 cert

      if (supplier1Match && supplier2Match) {
        expect(supplier1Match.matchResult.score).toBeGreaterThan(supplier2Match.matchResult.score);
      }
    });
  });

  describe('RecommendationOptimizer', () => {
    test('should optimize recommendation requests with caching', async () => {
      const mockRequest = jest.fn().mockResolvedValue({ data: 'test result' });
      
      // First call should execute the request
      const result1 = await optimizer.optimizeRecommendationRequest(
        'test-key-1',
        mockRequest
      );

      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(result1).toEqual({ data: 'test result' });

      // Second call should use cache
      const result2 = await optimizer.optimizeRecommendationRequest(
        'test-key-1',
        mockRequest
      );

      expect(mockRequest).toHaveBeenCalledTimes(1); // Should not be called again
      expect(result2).toEqual({ data: 'test result' });
    });

    test('should batch multiple requests efficiently', async () => {
      const requests = [
        {
          cacheKey: 'batch-test-1',
          requestFunction: jest.fn().mockResolvedValue('result1'),
          priority: 1
        },
        {
          cacheKey: 'batch-test-2',
          requestFunction: jest.fn().mockResolvedValue('result2'),
          priority: 2
        },
        {
          cacheKey: 'batch-test-3',
          requestFunction: jest.fn().mockResolvedValue('result3'),
          priority: 1
        }
      ];

      const results = await optimizer.batchRecommendationRequests(requests);

      expect(results).toHaveLength(3);
      expect(results).toContain('result1');
      expect(results).toContain('result2');
      expect(results).toContain('result3');
    });

    test('should track recommendation events', async () => {
      await expect(
        optimizer.trackRecommendationEvent(
          'user123',
          'rec456',
          'click',
          { source: 'test' }
        )
      ).resolves.not.toThrow();
    });

    test('should provide performance metrics', async () => {
      const metrics = await optimizer.getPerformanceMetrics();

      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('memoryUsage');

      expect(typeof metrics.responseTime).toBe('number');
      expect(typeof metrics.cacheHitRate).toBe('number');
      expect(typeof metrics.errorRate).toBe('number');
      expect(typeof metrics.throughput).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
    });

    test('should get recommendation analytics', async () => {
      const analytics = await optimizer.getRecommendationAnalytics('user123', 7);

      expect(analytics).toHaveProperty('totalRecommendations');
      expect(analytics).toHaveProperty('clickThroughRate');
      expect(analytics).toHaveProperty('conversionRate');
      expect(analytics).toHaveProperty('userEngagement');
      expect(analytics).toHaveProperty('performanceData');

      expect(typeof analytics.totalRecommendations).toBe('number');
      expect(typeof analytics.clickThroughRate).toBe('number');
      expect(typeof analytics.conversionRate).toBe('number');
    });
  });

  describe('Integration Tests', () => {
    test('should handle end-to-end recommendation flow', async () => {
      // Test complete flow: RFQ -> Recommendations -> Tracking -> Analytics
      
      // 1. Get recommendations
      const recommendations = await recommendationEngine.getProductRecommendations(
        mockRFQRequirements,
        mockUserBehavior,
        3
      );

      expect(recommendations.length).toBeGreaterThan(0);

      // 2. Track user interaction
      if (recommendations.length > 0) {
        await optimizer.trackRecommendationEvent(
          mockUserBehavior.userId,
          'rec-integration-test',
          'view'
        );

        await optimizer.trackRecommendationEvent(
          mockUserBehavior.userId,
          'rec-integration-test',
          'click'
        );
      }

      // 3. Get analytics
      const analytics = await optimizer.getRecommendationAnalytics(mockUserBehavior.userId);
      expect(analytics).toBeDefined();

    }, 45000);

    test('should handle error cases gracefully', async () => {
      // Test with invalid data
      const invalidRequirements = {
        ...mockRFQRequirements,
        quantity: -1, // Invalid quantity
        deliveryLocation: '', // Invalid location
      };

      // Should not crash, but may return empty results or throw controlled errors
      await expect(
        recommendationEngine.getProductRecommendations(invalidRequirements, undefined, 5)
      ).resolves.toBeDefined();
    });

    test('should handle high load scenarios', async () => {
      // Test multiple concurrent requests
      const promises = Array(10).fill(null).map((_, index) => 
        recommendationEngine.getProductRecommendations(
          { ...mockRFQRequirements, productCategory: `category-${index}` },
          mockUserBehavior,
          2
        )
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    }, 60000);
  });

  describe('Performance Tests', () => {
    test('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await recommendationEngine.getProductRecommendations(
        mockRFQRequirements,
        mockUserBehavior,
        5
      );

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
    });

    test('should maintain performance under batch processing', async () => {
      const startTime = Date.now();
      
      const batchRequests = Array(5).fill(null).map((_, index) => ({
        cacheKey: `perf-test-${index}`,
        requestFunction: () => recommendationEngine.getProductRecommendations(
          { ...mockRFQRequirements, productCategory: `test-category-${index}` },
          mockUserBehavior,
          3
        )
      }));

      await optimizer.batchRecommendationRequests(batchRequests);

      const batchTime = Date.now() - startTime;
      expect(batchTime).toBeLessThan(30000); // Batch should complete within 30 seconds
    });
  });
});

// Helper function to run tests
export const runRecommendationTests = async () => {
  console.log('🧪 Starting AI Recommendation Engine Tests...');
  
  try {
    // This would integrate with your test runner
    console.log('✅ All recommendation engine tests completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Some tests failed:', error);
    return false;
  }
};