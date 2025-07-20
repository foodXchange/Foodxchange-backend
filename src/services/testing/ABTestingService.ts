import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

interface ABTest {
  id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  variants: ABTestVariant[];
  targetCriteria: TargetCriteria;
  metrics: Metric[];
  startDate: Date;
  endDate: Date;
  sampleSize: number;
  confidenceLevel: number;
  trafficAllocation: number; // Percentage of users to include in test
  createdBy: string;
  companyId?: string;
  metadata: Record<string, any>;
}

interface ABTestVariant {
  id: string;
  name: string;
  description: string;
  trafficSplit: number; // Percentage of test users for this variant
  configuration: Record<string, any>;
  isControl: boolean;
}

interface TargetCriteria {
  userSegments?: string[];
  geographicRegions?: string[];
  deviceTypes?: string[];
  userRoles?: string[];
  companyTypes?: string[];
  customCriteria?: Record<string, any>;
}

interface Metric {
  id: string;
  name: string;
  type: 'conversion' | 'revenue' | 'engagement' | 'retention' | 'custom';
  goal: 'increase' | 'decrease';
  primaryMetric: boolean;
  customEventName?: string;
}

interface ABTestAssignment {
  testId: string;
  variantId: string;
  userId: string;
  assignedAt: Date;
  metadata?: Record<string, any>;
}

interface ABTestResult {
  testId: string;
  variantId: string;
  metric: string;
  value: number;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

interface StatisticalResult {
  variantId: string;
  variantName: string;
  sampleSize: number;
  conversionRate: number;
  revenue: number;
  confidence: number;
  pValue: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  isStatisticallySignificant: boolean;
  lift: number; // Percentage improvement over control
}

interface ABTestAnalysis {
  testId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  duration: number; // in days
  totalParticipants: number;
  results: StatisticalResult[];
  recommendation: {
    winningVariant?: string;
    confidence: number;
    reasoning: string;
    nextSteps: string[];
  };
  metadata: {
    lastUpdated: Date;
    dataQuality: string;
    assumptions: string[];
  };
}

export class ABTestingService {
  private readonly logger: Logger;
  private readonly tests: Map<string, ABTest> = new Map();
  private readonly assignments: Map<string, Map<string, ABTestAssignment>> = new Map(); // testId -> userId -> assignment
  private readonly results: Map<string, ABTestResult[]> = new Map(); // testId -> results[]

  constructor() {
    this.logger = new Logger('ABTestingService');
  }

  /**
   * Create a new A/B test
   */
  async createTest(testData: Omit<ABTest, 'id'>): Promise<ABTest> {
    try {
      // Validate test configuration
      this.validateTestConfiguration(testData);

      const test: ABTest = {
        id: this.generateTestId(),
        ...testData,
        status: 'draft'
      };

      // Store test
      this.tests.set(test.id, test);
      await this.cacheTest(test);

      // Initialize assignments and results maps
      this.assignments.set(test.id, new Map());
      this.results.set(test.id, []);

      this.logger.info(`A/B test created: ${test.id} - ${test.name}`);
      return test;
    } catch (error) {
      this.logger.error('Failed to create A/B test:', error);
      throw error;
    }
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<void> {
    try {
      const test = await this.getTest(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (test.status !== 'draft') {
        throw new Error('Only draft tests can be started');
      }

      // Update test status
      test.status = 'active';
      test.startDate = new Date();

      this.tests.set(testId, test);
      await this.cacheTest(test);

      this.logger.info(`A/B test started: ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to start test ${testId}:`, error);
      throw error;
    }
  }

  /**
   * Pause an A/B test
   */
  async pauseTest(testId: string): Promise<void> {
    try {
      const test = await this.getTest(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (test.status !== 'active') {
        throw new Error('Only active tests can be paused');
      }

      test.status = 'paused';
      this.tests.set(testId, test);
      await this.cacheTest(test);

      this.logger.info(`A/B test paused: ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to pause test ${testId}:`, error);
      throw error;
    }
  }

  /**
   * Complete an A/B test
   */
  async completeTest(testId: string): Promise<void> {
    try {
      const test = await this.getTest(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (!['active', 'paused'].includes(test.status)) {
        throw new Error('Only active or paused tests can be completed');
      }

      test.status = 'completed';
      test.endDate = new Date();

      this.tests.set(testId, test);
      await this.cacheTest(test);

      this.logger.info(`A/B test completed: ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to complete test ${testId}:`, error);
      throw error;
    }
  }

  /**
   * Assign a user to a test variant
   */
  async assignUser(testId: string, userId: string, context?: Record<string, any>): Promise<ABTestAssignment | null> {
    try {
      const test = await this.getTest(testId);
      if (!test || test.status !== 'active') {
        return null;
      }

      // Check if user is already assigned
      const existingAssignment = await this.getUserAssignment(testId, userId);
      if (existingAssignment) {
        return existingAssignment;
      }

      // Check if user meets target criteria
      const meetsTargetCriteria = await this.checkTargetCriteria(test.targetCriteria, userId, context);
      if (!meetsTargetCriteria) {
        return null;
      }

      // Check traffic allocation
      if (!this.shouldIncludeInTest(test.trafficAllocation)) {
        return null;
      }

      // Assign to variant based on traffic split
      const variant = this.selectVariant(test.variants, userId);
      if (!variant) {
        return null;
      }

      const assignment: ABTestAssignment = {
        testId,
        variantId: variant.id,
        userId,
        assignedAt: new Date(),
        metadata: context
      };

      // Store assignment
      const testAssignments = this.assignments.get(testId) || new Map();
      testAssignments.set(userId, assignment);
      this.assignments.set(testId, testAssignments);

      // Cache assignment
      await this.cacheAssignment(assignment);

      this.logger.debug(`User assigned to test: ${userId} -> ${testId}:${variant.id}`);
      return assignment;
    } catch (error) {
      this.logger.error(`Failed to assign user to test ${testId}:`, error);
      return null;
    }
  }

  /**
   * Get user's assignment for a test
   */
  async getUserAssignment(testId: string, userId: string): Promise<ABTestAssignment | null> {
    try {
      // Check cache first
      const cached = await optimizedCache.get(`ab_assignment:${testId}:${userId}`);
      if (cached) {
        return cached;
      }

      // Check in-memory storage
      const testAssignments = this.assignments.get(testId);
      return testAssignments?.get(userId) || null;
    } catch (error) {
      this.logger.error(`Failed to get user assignment: ${testId}:${userId}`, error);
      return null;
    }
  }

  /**
   * Get variant configuration for a user
   */
  async getVariantForUser(testId: string, userId: string): Promise<Record<string, any> | null> {
    try {
      const assignment = await this.getUserAssignment(testId, userId);
      if (!assignment) {
        return null;
      }

      const test = await this.getTest(testId);
      if (!test) {
        return null;
      }

      const variant = test.variants.find(v => v.id === assignment.variantId);
      return variant?.configuration || null;
    } catch (error) {
      this.logger.error(`Failed to get variant for user: ${testId}:${userId}`, error);
      return null;
    }
  }

  /**
   * Record a test result/conversion
   */
  async recordResult(
    testId: string,
    userId: string,
    metricName: string,
    value: number = 1,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const assignment = await this.getUserAssignment(testId, userId);
      if (!assignment) {
        return; // User not in test
      }

      const result: ABTestResult = {
        testId,
        variantId: assignment.variantId,
        metric: metricName,
        value,
        timestamp: new Date(),
        userId,
        metadata
      };

      // Store result
      const testResults = this.results.get(testId) || [];
      testResults.push(result);
      this.results.set(testId, testResults);

      // Cache result for analytics
      await this.cacheResult(result);

      this.logger.debug(`Test result recorded: ${testId}:${metricName} = ${value}`);
    } catch (error) {
      this.logger.error(`Failed to record test result: ${testId}:${metricName}`, error);
    }
  }

  /**
   * Record a conversion event
   */
  async recordConversion(testId: string, userId: string, conversionType: string = 'default', value: number = 1): Promise<void> {
    await this.recordResult(testId, userId, `conversion_${conversionType}`, value);
  }

  /**
   * Record a revenue event
   */
  async recordRevenue(testId: string, userId: string, amount: number, currency: string = 'USD'): Promise<void> {
    await this.recordResult(testId, userId, 'revenue', amount, { currency });
  }

  /**
   * Get test analysis results
   */
  async getTestAnalysis(testId: string): Promise<ABTestAnalysis | null> {
    try {
      const test = await this.getTest(testId);
      if (!test) {
        return null;
      }

      const testResults = this.results.get(testId) || [];
      const testAssignments = this.assignments.get(testId) || new Map();

      // Calculate statistical results for each variant
      const variantResults: StatisticalResult[] = [];

      for (const variant of test.variants) {
        const variantAssignments = Array.from(testAssignments.values())
          .filter(a => a.variantId === variant.id);

        const variantMetrics = testResults.filter(r => r.variantId === variant.id);

        const result = this.calculateVariantStatistics(
          variant,
          variantAssignments,
          variantMetrics,
          test.confidenceLevel
        );

        variantResults.push(result);
      }

      // Generate recommendation
      const recommendation = this.generateRecommendation(test, variantResults);

      const analysis: ABTestAnalysis = {
        testId,
        status: test.status,
        startDate: test.startDate,
        endDate: test.endDate,
        duration: test.endDate
          ? Math.ceil((test.endDate.getTime() - test.startDate.getTime()) / (1000 * 60 * 60 * 24))
          : Math.ceil((new Date().getTime() - test.startDate.getTime()) / (1000 * 60 * 60 * 24)),
        totalParticipants: testAssignments.size,
        results: variantResults,
        recommendation,
        metadata: {
          lastUpdated: new Date(),
          dataQuality: this.assessDataQuality(testAssignments.size, testResults.length),
          assumptions: [
            'Normal distribution of metrics',
            'Independent observations',
            'Consistent user behavior during test period'
          ]
        }
      };

      // Cache analysis
      await optimizedCache.set(`ab_analysis:${testId}`, analysis, 3600); // 1 hour cache

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to get test analysis for ${testId}:`, error);
      return null;
    }
  }

  /**
   * Get all tests for a company
   */
  async getCompanyTests(companyId: string): Promise<ABTest[]> {
    try {
      const companyTests = Array.from(this.tests.values())
        .filter(test => test.companyId === companyId);

      return companyTests;
    } catch (error) {
      this.logger.error(`Failed to get company tests for ${companyId}:`, error);
      return [];
    }
  }

  /**
   * Get test details
   */
  async getTest(testId: string): Promise<ABTest | null> {
    try {
      // Check cache first
      const cached = await optimizedCache.get(`ab_test:${testId}`);
      if (cached) {
        return cached;
      }

      // Check in-memory storage
      return this.tests.get(testId) || null;
    } catch (error) {
      this.logger.error(`Failed to get test ${testId}:`, error);
      return null;
    }
  }

  /**
   * Delete a test
   */
  async deleteTest(testId: string): Promise<void> {
    try {
      const test = await this.getTest(testId);
      if (!test) {
        throw new Error('Test not found');
      }

      if (test.status === 'active') {
        throw new Error('Cannot delete active test. Pause or complete it first.');
      }

      // Remove from storage
      this.tests.delete(testId);
      this.assignments.delete(testId);
      this.results.delete(testId);

      // Clear cache
      await optimizedCache.deletePattern(`ab_*:${testId}*`);

      this.logger.info(`A/B test deleted: ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to delete test ${testId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private validateTestConfiguration(testData: Omit<ABTest, 'id'>): void {
    if (!testData.name || testData.name.trim().length === 0) {
      throw new Error('Test name is required');
    }

    if (!testData.variants || testData.variants.length < 2) {
      throw new Error('At least 2 variants are required');
    }

    // Validate traffic splits sum to 100%
    const totalTrafficSplit = testData.variants.reduce((sum, v) => sum + v.trafficSplit, 0);
    if (Math.abs(totalTrafficSplit - 100) > 0.01) {
      throw new Error('Variant traffic splits must sum to 100%');
    }

    // Ensure exactly one control variant
    const controlVariants = testData.variants.filter(v => v.isControl);
    if (controlVariants.length !== 1) {
      throw new Error('Exactly one variant must be marked as control');
    }

    if (testData.confidenceLevel < 0.8 || testData.confidenceLevel > 0.99) {
      throw new Error('Confidence level must be between 80% and 99%');
    }

    if (testData.trafficAllocation < 1 || testData.trafficAllocation > 100) {
      throw new Error('Traffic allocation must be between 1% and 100%');
    }
  }

  private generateTestId(): string {
    return `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async checkTargetCriteria(criteria: TargetCriteria, userId: string, context?: Record<string, any>): Promise<boolean> {
    try {
      // For now, implement basic targeting
      // In a real implementation, you'd check against user/company data

      if (criteria.userRoles && criteria.userRoles.length > 0) {
        const user = await User.findById(userId);
        if (!user || !criteria.userRoles.includes(user.role)) {
          return false;
        }
      }

      if (criteria.deviceTypes && criteria.deviceTypes.length > 0 && context?.deviceType) {
        if (!criteria.deviceTypes.includes(context.deviceType)) {
          return false;
        }
      }

      if (criteria.geographicRegions && criteria.geographicRegions.length > 0 && context?.region) {
        if (!criteria.geographicRegions.includes(context.region)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Error checking target criteria:', error);
      return false;
    }
  }

  private shouldIncludeInTest(trafficAllocation: number): boolean {
    return Math.random() * 100 < trafficAllocation;
  }

  private selectVariant(variants: ABTestVariant[], userId: string): ABTestVariant | null {
    // Use deterministic assignment based on user ID
    const hash = this.hashUserId(userId);
    const random = hash % 100;

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.trafficSplit;
      if (random < cumulativeWeight) {
        return variant;
      }
    }

    return variants[0]; // Fallback to first variant
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private calculateVariantStatistics(
    variant: ABTestVariant,
    assignments: ABTestAssignment[],
    results: ABTestResult[],
    confidenceLevel: number
  ): StatisticalResult {
    const sampleSize = assignments.length;

    // Calculate conversion rate
    const conversions = results.filter(r => r.metric.startsWith('conversion_')).length;
    const conversionRate = sampleSize > 0 ? conversions / sampleSize : 0;

    // Calculate total revenue
    const revenue = results
      .filter(r => r.metric === 'revenue')
      .reduce((sum, r) => sum + r.value, 0);

    // Simple statistical calculations (in practice, use proper statistical libraries)
    const standardError = Math.sqrt((conversionRate * (1 - conversionRate)) / sampleSize);
    const zScore = this.getZScore(confidenceLevel);
    const marginOfError = zScore * standardError;

    return {
      variantId: variant.id,
      variantName: variant.name,
      sampleSize,
      conversionRate,
      revenue,
      confidence: confidenceLevel,
      pValue: sampleSize > 30 ? this.calculatePValue(conversionRate, standardError) : 1.0,
      confidenceInterval: {
        lower: Math.max(0, conversionRate - marginOfError),
        upper: Math.min(1, conversionRate + marginOfError)
      },
      isStatisticallySignificant: sampleSize > 30 && marginOfError < 0.05,
      lift: 0 // Will be calculated relative to control
    };
  }

  private generateRecommendation(test: ABTest, results: StatisticalResult[]): ABTestAnalysis['recommendation'] {
    const controlVariant = test.variants.find(v => v.isControl);
    const controlResult = results.find(r => r.variantId === controlVariant?.id);

    if (!controlResult) {
      return {
        confidence: 0,
        reasoning: 'No control variant data available',
        nextSteps: ['Ensure control variant is receiving traffic']
      };
    }

    // Calculate lift for each variant relative to control
    const variantsWithLift = results.map(result => ({
      ...result,
      lift: controlResult.conversionRate > 0
        ? ((result.conversionRate - controlResult.conversionRate) / controlResult.conversionRate) * 100
        : 0
    }));

    // Find best performing variant
    const bestVariant = variantsWithLift
      .filter(v => v.variantId !== controlVariant?.id)
      .sort((a, b) => b.conversionRate - a.conversionRate)[0];

    if (!bestVariant?.isStatisticallySignificant) {
      return {
        confidence: 0.3,
        reasoning: 'No statistically significant winner found. May need more data or longer test duration.',
        nextSteps: [
          'Continue test to collect more data',
          'Check if sample size is adequate',
          'Review test setup and metrics'
        ]
      };
    }

    return {
      winningVariant: bestVariant.variantId,
      confidence: bestVariant.confidence,
      reasoning: `Variant ${bestVariant.variantName} shows ${bestVariant.lift.toFixed(2)}% improvement over control with ${(bestVariant.confidence * 100).toFixed(1)}% confidence.`,
      nextSteps: [
        'Implement winning variant',
        'Monitor performance post-implementation',
        'Document learnings for future tests'
      ]
    };
  }

  private assessDataQuality(participants: number, results: number): string {
    if (participants < 100) return 'Low - Need more participants';
    if (results < participants * 0.1) return 'Low - Low engagement rate';
    if (participants > 1000 && results > participants * 0.2) return 'High';
    return 'Medium';
  }

  private getZScore(confidenceLevel: number): number {
    const zScores: Record<number, number> = {
      0.80: 1.28,
      0.85: 1.44,
      0.90: 1.64,
      0.95: 1.96,
      0.99: 2.58
    };
    return zScores[confidenceLevel] || 1.96;
  }

  private calculatePValue(conversionRate: number, standardError: number): number {
    // Simplified p-value calculation
    // In practice, use proper statistical libraries
    const zScore = conversionRate / standardError;
    return Math.min(1.0, 2 * (1 - this.normalCDF(Math.abs(zScore))));
  }

  private normalCDF(x: number): number {
    // Approximation of normal CDF
    return (1 + this.erf(x / Math.sqrt(2))) / 2;
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private async cacheTest(test: ABTest): Promise<void> {
    await optimizedCache.set(`ab_test:${test.id}`, test, 86400); // 24 hours
  }

  private async cacheAssignment(assignment: ABTestAssignment): Promise<void> {
    await optimizedCache.set(`ab_assignment:${assignment.testId}:${assignment.userId}`, assignment, 86400);
  }

  private async cacheResult(result: ABTestResult): Promise<void> {
    await optimizedCache.set(`ab_result:${result.testId}:${result.userId}:${Date.now()}`, result, 86400);
  }
}

// Singleton instance
export const abTestingService = new ABTestingService();
