import { ABTestingService } from '../../../../services/testing/ABTestingService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';
import { User } from '../../../../models/User';

// Mock dependencies
jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    deletePattern: jest.fn()
  }
}));

jest.mock('../../../../models/User');
jest.mock('../../../../models/Company');

jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('ABTestingService', () => {
  let abTestingService: ABTestingService;
  let mockTestData: any;

  beforeEach(() => {
    abTestingService = new ABTestingService();
    
    mockTestData = {
      name: 'Test AB Test',
      description: 'A test A/B test',
      variants: [
        {
          id: 'control',
          name: 'Control',
          description: 'Control variant',
          trafficSplit: 50,
          configuration: { feature: false },
          isControl: true
        },
        {
          id: 'variant_a',
          name: 'Variant A',
          description: 'Test variant',
          trafficSplit: 50,
          configuration: { feature: true },
          isControl: false
        }
      ],
      targetCriteria: {
        userRoles: ['buyer', 'supplier']
      },
      metrics: [
        {
          id: 'conversion',
          name: 'Conversion Rate',
          type: 'conversion',
          goal: 'increase',
          primaryMetric: true
        }
      ],
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      sampleSize: 1000,
      confidenceLevel: 0.95,
      trafficAllocation: 100,
      createdBy: 'user123',
      companyId: 'company123',
      metadata: {}
    };

    jest.clearAllMocks();
  });

  describe('createTest', () => {
    test('should create a test successfully', async () => {
      const test = await abTestingService.createTest(mockTestData);
      
      expect(test).toBeDefined();
      expect(test.id).toBeDefined();
      expect(test.name).toBe(mockTestData.name);
      expect(test.status).toBe('draft');
      expect(test.variants).toHaveLength(2);
      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('ab_test:'),
        expect.any(Object),
        86400
      );
    });

    test('should validate test configuration', async () => {
      const invalidTestData = {
        ...mockTestData,
        variants: [mockTestData.variants[0]] // Only one variant
      };

      await expect(abTestingService.createTest(invalidTestData))
        .rejects.toThrow('At least 2 variants are required');
    });

    test('should validate traffic splits sum to 100%', async () => {
      const invalidTestData = {
        ...mockTestData,
        variants: [
          { ...mockTestData.variants[0], trafficSplit: 60 },
          { ...mockTestData.variants[1], trafficSplit: 30 }
        ]
      };

      await expect(abTestingService.createTest(invalidTestData))
        .rejects.toThrow('Variant traffic splits must sum to 100%');
    });

    test('should validate exactly one control variant', async () => {
      const invalidTestData = {
        ...mockTestData,
        variants: [
          { ...mockTestData.variants[0], isControl: true },
          { ...mockTestData.variants[1], isControl: true }
        ]
      };

      await expect(abTestingService.createTest(invalidTestData))
        .rejects.toThrow('Exactly one variant must be marked as control');
    });

    test('should validate confidence level range', async () => {
      const invalidTestData = {
        ...mockTestData,
        confidenceLevel: 0.5
      };

      await expect(abTestingService.createTest(invalidTestData))
        .rejects.toThrow('Confidence level must be between 80% and 99%');
    });
  });

  describe('test lifecycle', () => {
    let testId: string;

    beforeEach(async () => {
      const test = await abTestingService.createTest(mockTestData);
      testId = test.id;
    });

    test('should start a test', async () => {
      await abTestingService.startTest(testId);
      
      const test = await abTestingService.getTest(testId);
      expect(test?.status).toBe('active');
      expect(test?.startDate).toBeDefined();
    });

    test('should pause an active test', async () => {
      await abTestingService.startTest(testId);
      await abTestingService.pauseTest(testId);
      
      const test = await abTestingService.getTest(testId);
      expect(test?.status).toBe('paused');
    });

    test('should complete a test', async () => {
      await abTestingService.startTest(testId);
      await abTestingService.completeTest(testId);
      
      const test = await abTestingService.getTest(testId);
      expect(test?.status).toBe('completed');
      expect(test?.endDate).toBeDefined();
    });

    test('should not start non-draft test', async () => {
      await abTestingService.startTest(testId);
      
      await expect(abTestingService.startTest(testId))
        .rejects.toThrow('Only draft tests can be started');
    });

    test('should not pause non-active test', async () => {
      await expect(abTestingService.pauseTest(testId))
        .rejects.toThrow('Only active tests can be paused');
    });
  });

  describe('user assignment', () => {
    let testId: string;

    beforeEach(async () => {
      const test = await abTestingService.createTest(mockTestData);
      testId = test.id;
      await abTestingService.startTest(testId);
      
      // Mock user data
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user123',
        role: 'buyer'
      });
    });

    test('should assign user to test', async () => {
      const assignment = await abTestingService.assignUser(testId, 'user123');
      
      expect(assignment).toBeDefined();
      expect(assignment?.testId).toBe(testId);
      expect(assignment?.userId).toBe('user123');
      expect(['control', 'variant_a']).toContain(assignment?.variantId);
      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('ab_assignment:'),
        expect.any(Object),
        86400
      );
    });

    test('should return existing assignment for already assigned user', async () => {
      const firstAssignment = await abTestingService.assignUser(testId, 'user123');
      const secondAssignment = await abTestingService.assignUser(testId, 'user123');
      
      expect(firstAssignment?.variantId).toBe(secondAssignment?.variantId);
    });

    test('should not assign user to inactive test', async () => {
      await abTestingService.pauseTest(testId);
      
      const assignment = await abTestingService.assignUser(testId, 'user123');
      expect(assignment).toBeNull();
    });

    test('should respect target criteria', async () => {
      (User.findById as jest.Mock).mockResolvedValue({
        _id: 'user123',
        role: 'admin' // Not in target criteria
      });

      const assignment = await abTestingService.assignUser(testId, 'user123');
      expect(assignment).toBeNull();
    });

    test('should get user assignment', async () => {
      await abTestingService.assignUser(testId, 'user123');
      
      const assignment = await abTestingService.getUserAssignment(testId, 'user123');
      expect(assignment).toBeDefined();
      expect(assignment?.userId).toBe('user123');
    });

    test('should get variant configuration for user', async () => {
      await abTestingService.assignUser(testId, 'user123');
      
      const variant = await abTestingService.getVariantForUser(testId, 'user123');
      expect(variant).toBeDefined();
      expect(typeof variant?.feature).toBe('boolean');
    });
  });

  describe('result recording', () => {
    let testId: string;

    beforeEach(async () => {
      const test = await abTestingService.createTest(mockTestData);
      testId = test.id;
      await abTestingService.startTest(testId);
      await abTestingService.assignUser(testId, 'user123');
    });

    test('should record test result', async () => {
      await abTestingService.recordResult(testId, 'user123', 'conversion', 1);
      
      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('ab_result:'),
        expect.any(Object),
        86400
      );
    });

    test('should record conversion', async () => {
      await abTestingService.recordConversion(testId, 'user123', 'signup', 1);
      
      // Should be called for recording the result
      expect(optimizedCache.set).toHaveBeenCalled();
    });

    test('should record revenue', async () => {
      await abTestingService.recordRevenue(testId, 'user123', 100.50, 'USD');
      
      expect(optimizedCache.set).toHaveBeenCalled();
    });

    test('should not record result for unassigned user', async () => {
      await abTestingService.recordResult(testId, 'unassigned_user', 'conversion', 1);
      
      // Should not cache result for unassigned user
      expect(optimizedCache.set).not.toHaveBeenCalledWith(
        expect.stringContaining('ab_result:'),
        expect.any(Object),
        86400
      );
    });
  });

  describe('test analysis', () => {
    let testId: string;

    beforeEach(async () => {
      const test = await abTestingService.createTest(mockTestData);
      testId = test.id;
      await abTestingService.startTest(testId);
      
      // Simulate some users and results
      for (let i = 0; i < 100; i++) {
        const userId = `user${i}`;
        await abTestingService.assignUser(testId, userId);
        
        // Simulate some conversions
        if (i % 10 === 0) {
          await abTestingService.recordConversion(testId, userId);
        }
      }
    });

    test('should generate test analysis', async () => {
      const analysis = await abTestingService.getTestAnalysis(testId);
      
      expect(analysis).toBeDefined();
      expect(analysis?.testId).toBe(testId);
      expect(analysis?.results).toHaveLength(2); // Two variants
      expect(analysis?.recommendation).toBeDefined();
      expect(analysis?.totalParticipants).toBeGreaterThan(0);
    });

    test('should calculate variant statistics', async () => {
      const analysis = await abTestingService.getTestAnalysis(testId);
      
      analysis?.results.forEach(result => {
        expect(result.variantId).toBeDefined();
        expect(result.variantName).toBeDefined();
        expect(result.sampleSize).toBeGreaterThanOrEqual(0);
        expect(result.conversionRate).toBeGreaterThanOrEqual(0);
        expect(result.conversionRate).toBeLessThanOrEqual(1);
        expect(result.confidence).toBe(0.95);
        expect(result.confidenceInterval).toBeDefined();
        expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.confidenceInterval.upper);
      });
    });

    test('should provide recommendations', async () => {
      const analysis = await abTestingService.getTestAnalysis(testId);
      
      expect(analysis?.recommendation).toBeDefined();
      expect(analysis?.recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis?.recommendation.confidence).toBeLessThanOrEqual(1);
      expect(analysis?.recommendation.reasoning).toBeDefined();
      expect(analysis?.recommendation.nextSteps).toBeInstanceOf(Array);
    });

    test('should cache analysis results', async () => {
      await abTestingService.getTestAnalysis(testId);
      
      expect(optimizedCache.set).toHaveBeenCalledWith(
        `ab_analysis:${testId}`,
        expect.any(Object),
        3600
      );
    });
  });

  describe('test management', () => {
    let testId: string;

    beforeEach(async () => {
      const test = await abTestingService.createTest(mockTestData);
      testId = test.id;
    });

    test('should get test details', async () => {
      const test = await abTestingService.getTest(testId);
      
      expect(test).toBeDefined();
      expect(test?.id).toBe(testId);
      expect(test?.name).toBe(mockTestData.name);
    });

    test('should get company tests', async () => {
      const tests = await abTestingService.getCompanyTests('company123');
      
      expect(tests).toBeInstanceOf(Array);
      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0].companyId).toBe('company123');
    });

    test('should delete test', async () => {
      await abTestingService.deleteTest(testId);
      
      const deletedTest = await abTestingService.getTest(testId);
      expect(deletedTest).toBeNull();
      
      expect(optimizedCache.deletePattern).toHaveBeenCalledWith(`ab_*:${testId}*`);
    });

    test('should not delete active test', async () => {
      await abTestingService.startTest(testId);
      
      await expect(abTestingService.deleteTest(testId))
        .rejects.toThrow('Cannot delete active test');
    });

    test('should handle non-existent test', async () => {
      const nonExistentTest = await abTestingService.getTest('non_existent_id');
      expect(nonExistentTest).toBeNull();
    });
  });

  describe('traffic allocation', () => {
    let testId: string;

    beforeEach(async () => {
      // Create test with 50% traffic allocation
      const testData = {
        ...mockTestData,
        trafficAllocation: 50
      };
      const test = await abTestingService.createTest(testData);
      testId = test.id;
      await abTestingService.startTest(testId);
    });

    test('should respect traffic allocation', async () => {
      // Mock Math.random to return values that test traffic allocation
      const originalRandom = Math.random;
      let randomValue = 0.25; // 25% - should be included in 50% allocation
      Math.random = jest.fn(() => randomValue);

      let assignment = await abTestingService.assignUser(testId, 'user1');
      expect(assignment).toBeDefined();

      randomValue = 0.75; // 75% - should be excluded from 50% allocation
      assignment = await abTestingService.assignUser(testId, 'user2');
      expect(assignment).toBeNull();

      Math.random = originalRandom;
    });
  });

  describe('variant selection', () => {
    test('should provide deterministic assignment based on user ID', async () => {
      const test = await abTestingService.createTest(mockTestData);
      await abTestingService.startTest(test.id);

      // Same user should always get same variant
      const assignment1 = await abTestingService.assignUser(test.id, 'consistent_user');
      const assignment2 = await abTestingService.assignUser(test.id, 'consistent_user');

      expect(assignment1?.variantId).toBe(assignment2?.variantId);
    });
  });

  describe('error handling', () => {
    test('should handle cache errors gracefully', async () => {
      (optimizedCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const test = await abTestingService.createTest(mockTestData);
      expect(test).toBeDefined(); // Should still work despite cache error
    });

    test('should handle invalid test ID', async () => {
      await expect(abTestingService.startTest('invalid_id'))
        .rejects.toThrow('Test not found');
    });

    test('should handle user lookup errors', async () => {
      (User.findById as jest.Mock).mockRejectedValue(new Error('User lookup failed'));

      const test = await abTestingService.createTest(mockTestData);
      await abTestingService.startTest(test.id);

      // Should not assign user if lookup fails
      const assignment = await abTestingService.assignUser(test.id, 'user123');
      expect(assignment).toBeNull();
    });
  });

  describe('statistical calculations', () => {
    test('should calculate confidence intervals correctly', async () => {
      const test = await abTestingService.createTest(mockTestData);
      await abTestingService.startTest(test.id);

      // Add enough users for statistical significance
      for (let i = 0; i < 1000; i++) {
        await abTestingService.assignUser(test.id, `user${i}`);
        if (i % 5 === 0) { // 20% conversion rate
          await abTestingService.recordConversion(test.id, `user${i}`);
        }
      }

      const analysis = await abTestingService.getTestAnalysis(test.id);
      expect(analysis).toBeDefined();

      analysis?.results.forEach(result => {
        expect(result.confidenceInterval.lower).toBeLessThanOrEqual(result.conversionRate);
        expect(result.confidenceInterval.upper).toBeGreaterThanOrEqual(result.conversionRate);
        expect(result.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
        expect(result.confidenceInterval.upper).toBeLessThanOrEqual(1);
      });
    });
  });
});