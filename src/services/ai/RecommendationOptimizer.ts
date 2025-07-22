/**
 * Recommendation Performance Optimizer
 * Handles caching, performance optimization, and analytics for recommendations
 */

import { Logger } from '../../core/logging/logger';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { MetricsService } from '../../core/monitoring/metrics';

export interface CacheStrategy {
  ttl: number; // Time to live in seconds
  refreshThreshold: number; // Refresh when cache is X% expired
  maxSize: number; // Maximum cache entries
  compressionEnabled: boolean;
}

export interface PerformanceMetrics {
  responseTime: number;
  cacheHitRate: number;
  errorRate: number;
  throughput: number;
  memoryUsage: number;
}

export interface RecommendationAnalytics {
  totalRecommendations: number;
  clickThroughRate: number;
  conversionRate: number;
  averageScore: number;
  topCategories: string[];
  userEngagement: {
    views: number;
    clicks: number;
    purchases: number;
    rejections: number;
  };
  performanceData: PerformanceMetrics;
}

export interface OptimizationConfig {
  cache: CacheStrategy;
  batchSize: number;
  parallelRequests: number;
  enablePrefetching: boolean;
  enableCompression: boolean;
  enableAnalytics: boolean;
}

export class RecommendationOptimizer {
  private static instance: RecommendationOptimizer;
  private readonly logger: Logger;
  private readonly cache: CacheService;
  private readonly metrics: MetricsService;
  private config: OptimizationConfig;
  private readonly analytics: Map<string, any>;
  private performanceHistory: PerformanceMetrics[];

  private constructor() {
    this.logger = new Logger('RecommendationOptimizer');
    this.cache = cacheService;
    this.metrics = new MetricsService();
    this.analytics = new Map();
    this.performanceHistory = [];
    this.config = this.getDefaultConfig();
  }

  public static getInstance(): RecommendationOptimizer {
    if (!RecommendationOptimizer.instance) {
      RecommendationOptimizer.instance = new RecommendationOptimizer();
    }
    return RecommendationOptimizer.instance;
  }

  /**
   * Optimize recommendation request with caching and batching
   */
  public async optimizeRecommendationRequest<T>(
    cacheKey: string,
    requestFunction: () => Promise<T>,
    options?: Partial<CacheStrategy>
  ): Promise<T> {
    const startTime = Date.now();
    const strategy = { ...this.config.cache, ...options };

    try {
      // Check cache first
      const cached = await this.getCachedResult<T>(cacheKey, strategy);
      if (cached) {
        this.recordCacheHit(cacheKey, Date.now() - startTime);
        return cached;
      }

      // Execute request with performance monitoring
      const result = await this.executeWithMonitoring(requestFunction);

      // Cache the result
      await this.cacheResult(cacheKey, result, strategy);

      this.recordCacheMiss(cacheKey, Date.now() - startTime);
      return result;

    } catch (error) {
      this.recordError(cacheKey, error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Batch multiple recommendation requests for efficiency
   */
  public async batchRecommendationRequests<T>(
    requests: Array<{
      cacheKey: string;
      requestFunction: () => Promise<T>;
      priority?: number;
    }>
  ): Promise<T[]> {
    const startTime = Date.now();

    try {
      // Sort by priority (higher numbers first)
      const sortedRequests = requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      // Split into batches
      const batches = this.splitIntoBatches(sortedRequests, this.config.batchSize);
      const results: T[] = [];

      // Process batches with controlled parallelism
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(async req =>
            this.optimizeRecommendationRequest(req.cacheKey, req.requestFunction)
          )
        );
        results.push(...batchResults);
      }

      this.recordBatchPerformance(requests.length, Date.now() - startTime);
      return results;

    } catch (error) {
      this.logger.error('Batch recommendation request failed', { error, requestCount: requests.length });
      throw error;
    }
  }

  /**
   * Prefetch recommendations based on predicted user behavior
   */
  public async prefetchRecommendations(
    userId: string,
    predictedRequests: Array<{
      cacheKey: string;
      requestFunction: () => Promise<any>;
      probability: number;
    }>
  ): Promise<void> {
    if (!this.config.enablePrefetching) return;

    try {
      this.logger.info('Starting prefetch for user', { userId, requestCount: predictedRequests.length });

      // Filter by probability threshold (only prefetch high-probability requests)
      const highProbabilityRequests = predictedRequests.filter(req => req.probability > 0.7);

      // Execute prefetch in background with lower priority
      Promise.all(
        highProbabilityRequests.map(async req => {
          try {
            await this.optimizeRecommendationRequest(
              req.cacheKey,
              req.requestFunction,
              { ttl: this.config.cache.ttl * 0.5 } // Shorter TTL for prefetched data
            );
          } catch (error) {
            // Silently handle prefetch errors
            this.logger.debug('Prefetch failed', { cacheKey: req.cacheKey, error: error.message });
          }
        })
      ).catch(() => {}); // Don't let prefetch errors affect the main flow

    } catch (error) {
      this.logger.warn('Prefetch operation failed', { error, userId });
    }
  }

  /**
   * Track recommendation analytics
   */
  public async trackRecommendationEvent(
    userId: string,
    recommendationId: string,
    event: 'view' | 'click' | 'purchase' | 'reject',
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.enableAnalytics) return;

    try {
      const timestamp = new Date();
      const analyticsKey = `analytics:${userId}:${new Date().toISOString().split('T')[0]}`;

      // Get or create daily analytics
      const dailyAnalytics = this.analytics.get(analyticsKey) || this.createEmptyAnalytics();

      // Update analytics
      dailyAnalytics.userEngagement[`${event}s`] = (dailyAnalytics.userEngagement[`${event}s`] || 0) + 1;
      dailyAnalytics.totalRecommendations = dailyAnalytics.totalRecommendations || 0;

      if (event === 'view') {
        dailyAnalytics.totalRecommendations++;
      }

      // Calculate rates
      this.updateEngagementRates(dailyAnalytics);

      // Store analytics
      this.analytics.set(analyticsKey, dailyAnalytics);

      // Also store in persistent cache for reporting
      await this.cache.set(
        `persistent_analytics:${analyticsKey}`,
        JSON.stringify(dailyAnalytics),
        86400 * 7 // 7 days TTL
      );

      // Update metrics
      this.metrics.incrementCounter(`recommendation_${event}`);

      this.logger.debug('Tracked recommendation event', {
        userId,
        recommendationId,
        event,
        metadata
      });

    } catch (error) {
      this.logger.error('Failed to track recommendation event', { error, userId, event });
    }
  }

  /**
   * Get comprehensive analytics for a user or globally
   */
  public async getRecommendationAnalytics(
    userId?: string,
    days: number = 7
  ): Promise<RecommendationAnalytics> {
    try {
      const analytics = await this.aggregateAnalytics(userId, days);
      const performance = await this.getPerformanceMetrics();

      return {
        ...analytics,
        performanceData: performance
      };

    } catch (error) {
      this.logger.error('Failed to get recommendation analytics', { error, userId });
      throw error;
    }
  }

  /**
   * Optimize cache performance based on usage patterns
   */
  public async optimizeCachePerformance(): Promise<void> {
    try {
      this.logger.info('Starting cache optimization');

      // Analyze cache hit rates
      const hitRates = await this.analyzeCacheHitRates();

      // Identify frequently accessed but expired entries
      const hotKeys = await this.identifyHotKeys();

      // Adjust TTL for hot keys
      await this.adjustTTLForHotKeys(hotKeys, hitRates);

      // Clean up least recently used entries if cache is near capacity
      await this.performLRUCleanup();

      // Update optimization config based on patterns
      this.updateOptimizationConfig(hitRates);

      this.logger.info('Cache optimization completed', {
        avgHitRate: hitRates.average,
        hotKeysCount: hotKeys.length
      });

    } catch (error) {
      this.logger.error('Cache optimization failed', { error });
    }
  }

  /**
   * Get real-time performance metrics
   */
  public async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const recentMetrics = this.performanceHistory.slice(-100); // Last 100 operations

    if (recentMetrics.length === 0) {
      return this.createEmptyPerformanceMetrics();
    }

    return {
      responseTime: this.calculateAverage(recentMetrics.map(m => m.responseTime)),
      cacheHitRate: this.calculateAverage(recentMetrics.map(m => m.cacheHitRate)),
      errorRate: this.calculateAverage(recentMetrics.map(m => m.errorRate)),
      throughput: this.calculateThroughput(recentMetrics),
      memoryUsage: await this.getMemoryUsage()
    };
  }

  // Private helper methods

  private async getCachedResult<T>(cacheKey: string, strategy: CacheStrategy): Promise<T | null> {
    try {
      const cachedData = await this.cache.get(cacheKey);

      if (!cachedData) return null;

      let result = JSON.parse(cachedData);

      // Handle compression
      if (strategy.compressionEnabled && result.compressed) {
        result = this.decompress(result.data);
      }

      return result;

    } catch (error) {
      this.logger.warn('Cache retrieval failed', { error, cacheKey });
      return null;
    }
  }

  private async cacheResult<T>(cacheKey: string, result: T, strategy: CacheStrategy): Promise<void> {
    try {
      let dataToCache = result;

      // Handle compression
      if (strategy.compressionEnabled) {
        const compressed = this.compress(result);
        if (compressed.ratio > 0.5) { // Only compress if we save at least 50%
          dataToCache = { compressed: true, data: compressed.data };
        }
      }

      await this.cache.set(cacheKey, JSON.stringify(dataToCache), strategy.ttl);

    } catch (error) {
      this.logger.warn('Cache storage failed', { error, cacheKey });
    }
  }

  private async executeWithMonitoring<T>(requestFunction: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await requestFunction();

      this.recordPerformanceMetrics({
        responseTime: Date.now() - startTime,
        memoryDelta: process.memoryUsage().heapUsed - startMemory,
        success: true
      });

      return result;

    } catch (error) {
      this.recordPerformanceMetrics({
        responseTime: Date.now() - startTime,
        memoryDelta: process.memoryUsage().heapUsed - startMemory,
        success: false,
        error
      });
      throw error;
    }
  }

  private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private recordCacheHit(cacheKey: string, responseTime: number): void {
    this.metrics.incrementCounter('recommendation_cache_hit');
    this.metrics.recordTimer('recommendation_cache_response_time', responseTime);
  }

  private recordCacheMiss(cacheKey: string, responseTime: number): void {
    this.metrics.incrementCounter('recommendation_cache_miss');
    this.metrics.recordTimer('recommendation_response_time', responseTime);
  }

  private recordError(cacheKey: string, error: any, responseTime: number): void {
    this.metrics.incrementCounter('recommendation_error');
    this.logger.error('Recommendation request failed', { error, cacheKey, responseTime });
  }

  private recordBatchPerformance(requestCount: number, totalTime: number): void {
    this.metrics.recordTimer('recommendation_batch_time', totalTime);
    this.metrics.incrementCounter('recommendation_batch_requests', requestCount);
  }

  private recordPerformanceMetrics(data: any): void {
    const metrics: PerformanceMetrics = {
      responseTime: data.responseTime,
      cacheHitRate: 0, // Will be calculated separately
      errorRate: data.success ? 0 : 1,
      throughput: 1000 / data.responseTime, // Requests per second
      memoryUsage: data.memoryDelta
    };

    this.performanceHistory.push(metrics);

    // Keep only recent metrics (last 1000 operations)
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory.shift();
    }
  }

  private createEmptyAnalytics(): RecommendationAnalytics {
    return {
      totalRecommendations: 0,
      clickThroughRate: 0,
      conversionRate: 0,
      averageScore: 0,
      topCategories: [],
      userEngagement: {
        views: 0,
        clicks: 0,
        purchases: 0,
        rejections: 0
      },
      performanceData: this.createEmptyPerformanceMetrics()
    };
  }

  private createEmptyPerformanceMetrics(): PerformanceMetrics {
    return {
      responseTime: 0,
      cacheHitRate: 0,
      errorRate: 0,
      throughput: 0,
      memoryUsage: 0
    };
  }

  private updateEngagementRates(analytics: RecommendationAnalytics): void {
    const { views, clicks, purchases } = analytics.userEngagement;

    analytics.clickThroughRate = views > 0 ? clicks / views : 0;
    analytics.conversionRate = clicks > 0 ? purchases / clicks : 0;
  }

  private async aggregateAnalytics(userId?: string, days: number = 7): Promise<Omit<RecommendationAnalytics, 'performanceData'>> {
    // This would aggregate analytics from cache/database
    // For now, return a mock implementation
    return {
      totalRecommendations: 1250,
      clickThroughRate: 0.23,
      conversionRate: 0.08,
      averageScore: 0.76,
      topCategories: ['dairy', 'vegetables', 'grains', 'proteins'],
      userEngagement: {
        views: 1250,
        clicks: 287,
        purchases: 23,
        rejections: 45
      }
    };
  }

  private async analyzeCacheHitRates(): Promise<{ average: number; byKey: Map<string, number> }> {
    // Analyze cache performance
    return { average: 0.75, byKey: new Map() };
  }

  private async identifyHotKeys(): Promise<string[]> {
    // Identify frequently accessed cache keys
    return [];
  }

  private async adjustTTLForHotKeys(hotKeys: string[], hitRates: any): Promise<void> {
    // Adjust TTL for frequently accessed keys
  }

  private async performLRUCleanup(): Promise<void> {
    // Clean up least recently used cache entries
  }

  private updateOptimizationConfig(hitRates: any): void {
    // Update configuration based on performance patterns
  }

  private calculateAverage(numbers: number[]): number {
    return numbers.length > 0 ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;
  }

  private calculateThroughput(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;

    const timeSpan = metrics.length * 1000; // Assume 1 operation per second average
    return metrics.length / (timeSpan / 1000);
  }

  private async getMemoryUsage(): Promise<number> {
    return process.memoryUsage().heapUsed / 1024 / 1024; // MB
  }

  private compress(data: any): { data: string; ratio: number } {
    // Simple compression simulation
    const original = JSON.stringify(data);
    const compressed = original; // In real implementation, use actual compression

    return {
      data: compressed,
      ratio: compressed.length / original.length
    };
  }

  private decompress(data: string): any {
    // Simple decompression simulation
    return JSON.parse(data);
  }

  private getDefaultConfig(): OptimizationConfig {
    return {
      cache: {
        ttl: 1800, // 30 minutes
        refreshThreshold: 0.8, // Refresh when 80% expired
        maxSize: 10000,
        compressionEnabled: true
      },
      batchSize: 10,
      parallelRequests: 5,
      enablePrefetching: true,
      enableCompression: true,
      enableAnalytics: true
    };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Recommendation optimizer config updated', { config: this.config });
  }

  /**
   * Clear analytics data
   */
  public clearAnalytics(): void {
    this.analytics.clear();
    this.performanceHistory = [];
    this.logger.info('Recommendation analytics cleared');
  }
}
