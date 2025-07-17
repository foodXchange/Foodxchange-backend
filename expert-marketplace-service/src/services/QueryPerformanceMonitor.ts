import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService.cleaned';
import mongoose from 'mongoose';

const logger = new Logger('QueryPerformanceMonitor');

export interface QueryMetrics {
  operation: string;
  collection: string;
  duration: number;
  documentsExamined: number;
  documentsReturned: number;
  indexesUsed: string[];
  queryPlan: any;
  timestamp: Date;
  queryHash: string;
  isSlowQuery: boolean;
}

export interface QueryOptimizationSuggestion {
  queryHash: string;
  collection: string;
  operation: string;
  currentPerformance: {
    avgDuration: number;
    documentsExamined: number;
    documentsReturned: number;
    executionCount: number;
  };
  suggestions: {
    type: 'index' | 'query' | 'schema' | 'aggregation';
    description: string;
    implementation: string;
    expectedImprovement: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }[];
  potentialImpact: number;
  createdAt: Date;
}

export interface PerformanceAnalytics {
  totalQueries: number;
  slowQueries: number;
  averageResponseTime: number;
  queryDistribution: Record<string, number>;
  topSlowQueries: QueryMetrics[];
  optimizationOpportunities: QueryOptimizationSuggestion[];
  indexEfficiency: Record<string, number>;
  collectionStats: Record<string, any>;
}

/**
 * Advanced query performance monitoring and optimization service
 */
export class QueryPerformanceMonitor {
  private metrics: QueryMetrics[] = [];
  private optimizationSuggestions: QueryOptimizationSuggestion[] = [];
  private readonly slowQueryThreshold = 100; // 100ms
  private readonly maxMetricsHistory = 10000;
  private readonly analysisInterval = 60000; // 1 minute
  private analysisTimer?: NodeJS.Timeout;

  constructor() {
    this.initializeMonitoring();
    this.startPeriodicAnalysis();
  }

  /**
   * Initialize MongoDB query monitoring
   */
  private initializeMonitoring(): void {
    // Enable MongoDB profiling for slow queries
    mongoose.set('debug', (collectionName: string, method: string, query: any, doc?: any) => {
      const startTime = Date.now();
      
      // Capture query execution time
      const originalMethod = mongoose.Collection.prototype[method];
      if (originalMethod) {
        const wrappedMethod = function(...args: any[]) {
          const result = originalMethod.apply(this, args);
          
          // Handle promise-based operations
          if (result && typeof result.then === 'function') {
            return result.then((response: any) => {
              const duration = Date.now() - startTime;
              this.recordQueryMetrics(collectionName, method, query, duration, response);
              return response;
            }).catch((error: any) => {
              const duration = Date.now() - startTime;
              this.recordQueryMetrics(collectionName, method, query, duration, null, error);
              throw error;
            });
          }
          
          return result;
        }.bind(this);
        
        mongoose.Collection.prototype[method] = wrappedMethod;
      }
    });

    logger.info('Query performance monitoring initialized');
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(
    collection: string,
    operation: string,
    query: any,
    duration: number,
    result?: any,
    error?: any
  ): void {
    try {
      const queryHash = this.generateQueryHash(query);
      const isSlowQuery = duration > this.slowQueryThreshold;
      
      const metrics: QueryMetrics = {
        operation,
        collection,
        duration,
        documentsExamined: this.extractDocumentsExamined(result),
        documentsReturned: this.extractDocumentsReturned(result),
        indexesUsed: this.extractIndexesUsed(result),
        queryPlan: this.extractQueryPlan(result),
        timestamp: new Date(),
        queryHash,
        isSlowQuery
      };

      this.metrics.push(metrics);

      // Log slow queries immediately
      if (isSlowQuery) {
        logger.warn('Slow query detected', {
          collection,
          operation,
          duration,
          query: JSON.stringify(query),
          queryHash
        });
      }

      // Maintain metrics history size
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics = this.metrics.slice(-this.maxMetricsHistory);
      }

      // Cache frequently accessed query results
      if (this.isFrequentQuery(queryHash) && !error) {
        this.cacheQueryResult(queryHash, result);
      }

    } catch (error) {
      logger.error('Failed to record query metrics', { error: error.message });
    }
  }

  /**
   * Analyze query performance and generate optimization suggestions
   */
  async analyzePerformance(): Promise<PerformanceAnalytics> {
    try {
      const analytics: PerformanceAnalytics = {
        totalQueries: this.metrics.length,
        slowQueries: this.metrics.filter(m => m.isSlowQuery).length,
        averageResponseTime: this.calculateAverageResponseTime(),
        queryDistribution: this.calculateQueryDistribution(),
        topSlowQueries: this.getTopSlowQueries(),
        optimizationOpportunities: await this.generateOptimizationSuggestions(),
        indexEfficiency: await this.analyzeIndexEfficiency(),
        collectionStats: await this.getCollectionStats()
      };

      // Cache analytics for dashboard
      await advancedCacheService.set('query_analytics', analytics, {
        ttl: 300, // 5 minutes
        tags: ['analytics', 'performance'],
        priority: 'high'
      });

      return analytics;
    } catch (error) {
      logger.error('Failed to analyze query performance', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate optimization suggestions based on query patterns
   */
  private async generateOptimizationSuggestions(): Promise<QueryOptimizationSuggestion[]> {
    const suggestions: QueryOptimizationSuggestion[] = [];
    const queryGroups = this.groupQueriesByHash();

    for (const [queryHash, queries] of Object.entries(queryGroups)) {
      if (queries.length < 5) continue; // Skip infrequent queries

      const avgDuration = queries.reduce((sum, q) => sum + q.duration, 0) / queries.length;
      const avgDocsExamined = queries.reduce((sum, q) => sum + q.documentsExamined, 0) / queries.length;
      const avgDocsReturned = queries.reduce((sum, q) => sum + q.documentsReturned, 0) / queries.length;

      const suggestion: QueryOptimizationSuggestion = {
        queryHash,
        collection: queries[0].collection,
        operation: queries[0].operation,
        currentPerformance: {
          avgDuration,
          documentsExamined: avgDocsExamined,
          documentsReturned: avgDocsReturned,
          executionCount: queries.length
        },
        suggestions: [],
        potentialImpact: 0,
        createdAt: new Date()
      };

      // Analyze and generate specific suggestions
      await this.analyzeQueryPattern(suggestion, queries);

      if (suggestion.suggestions.length > 0) {
        suggestions.push(suggestion);
      }
    }

    // Sort by potential impact
    return suggestions.sort((a, b) => b.potentialImpact - a.potentialImpact);
  }

  /**
   * Analyze query pattern and generate specific suggestions
   */
  private async analyzeQueryPattern(
    suggestion: QueryOptimizationSuggestion,
    queries: QueryMetrics[]
  ): Promise<void> {
    const sampleQuery = queries[0];
    const avgDuration = suggestion.currentPerformance.avgDuration;
    const avgDocsExamined = suggestion.currentPerformance.documentsExamined;
    const avgDocsReturned = suggestion.currentPerformance.documentsReturned;

    // 1. Check if query is slow
    if (avgDuration > this.slowQueryThreshold) {
      suggestion.potentialImpact += 3;

      // 2. Check index usage efficiency
      if (avgDocsExamined > avgDocsReturned * 10) {
        suggestion.suggestions.push({
          type: 'index',
          description: 'Query examines too many documents relative to results returned',
          implementation: `Create compound index on ${sampleQuery.collection} for frequently queried fields`,
          expectedImprovement: 70,
          priority: 'high'
        });
        suggestion.potentialImpact += 2;
      }

      // 3. Check for collection scans
      if (sampleQuery.indexesUsed.length === 0) {
        suggestion.suggestions.push({
          type: 'index',
          description: 'Query performing collection scan without index',
          implementation: `db.${sampleQuery.collection}.createIndex({ /* query fields */ })`,
          expectedImprovement: 90,
          priority: 'critical'
        });
        suggestion.potentialImpact += 5;
      }

      // 4. Check aggregation optimization opportunities
      if (sampleQuery.operation === 'aggregate' && avgDuration > 500) {
        suggestion.suggestions.push({
          type: 'aggregation',
          description: 'Aggregation pipeline can be optimized',
          implementation: 'Reorder pipeline stages to filter early and use $match before $lookup',
          expectedImprovement: 50,
          priority: 'medium'
        });
        suggestion.potentialImpact += 2;
      }

      // 5. Check query structure optimization
      if (this.hasSuboptimalQueryStructure(sampleQuery)) {
        suggestion.suggestions.push({
          type: 'query',
          description: 'Query structure can be optimized',
          implementation: 'Restructure query to use more efficient operators',
          expectedImprovement: 30,
          priority: 'medium'
        });
        suggestion.potentialImpact += 1;
      }
    }

    // 6. Check for frequent queries that could benefit from caching
    if (queries.length > 100 && avgDuration > 50) {
      suggestion.suggestions.push({
        type: 'query',
        description: 'Frequent query could benefit from caching',
        implementation: 'Implement application-level caching for this query pattern',
        expectedImprovement: 80,
        priority: 'high'
      });
      suggestion.potentialImpact += 3;
    }
  }

  /**
   * Analyze index efficiency across collections
   */
  private async analyzeIndexEfficiency(): Promise<Record<string, number>> {
    const efficiency: Record<string, number> = {};
    
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        const stats = await mongoose.connection.db.collection(collection.name).stats();
        const indexes = await mongoose.connection.db.collection(collection.name).indexes();
        
        // Calculate index efficiency based on usage
        let totalIndexSize = 0;
        let usedIndexes = 0;
        
        for (const index of indexes) {
          totalIndexSize += index.size || 0;
          
          // Check if index is used in recent queries
          const isUsed = this.metrics.some(m => 
            m.collection === collection.name && 
            m.indexesUsed.includes(index.name)
          );
          
          if (isUsed) usedIndexes++;
        }
        
        efficiency[collection.name] = indexes.length > 0 ? (usedIndexes / indexes.length) * 100 : 0;
      }
    } catch (error) {
      logger.error('Failed to analyze index efficiency', { error: error.message });
    }
    
    return efficiency;
  }

  /**
   * Get collection statistics
   */
  private async getCollectionStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        const collectionStats = await mongoose.connection.db.collection(collection.name).stats();
        stats[collection.name] = {
          documentCount: collectionStats.count,
          avgDocumentSize: collectionStats.avgObjSize,
          totalSize: collectionStats.size,
          indexCount: collectionStats.nindexes,
          indexSize: collectionStats.totalIndexSize
        };
      }
    } catch (error) {
      logger.error('Failed to get collection stats', { error: error.message });
    }
    
    return stats;
  }

  /**
   * Get real-time query performance metrics
   */
  getRealtimeMetrics(): any {
    const recentMetrics = this.metrics.filter(m => 
      Date.now() - m.timestamp.getTime() < 300000 // Last 5 minutes
    );

    return {
      totalQueries: recentMetrics.length,
      slowQueries: recentMetrics.filter(m => m.isSlowQuery).length,
      averageResponseTime: recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length || 0,
      queryTypes: this.getQueryTypeDistribution(recentMetrics),
      topCollections: this.getTopCollections(recentMetrics),
      timestamp: new Date()
    };
  }

  /**
   * Apply optimization suggestions
   */
  async applyOptimizations(): Promise<void> {
    logger.info('Applying query optimizations');
    
    try {
      // Get pending suggestions
      const suggestions = await this.generateOptimizationSuggestions();
      const highPrioritySuggestions = suggestions.filter(s => 
        s.suggestions.some(suggestion => suggestion.priority === 'critical' || suggestion.priority === 'high')
      );

      for (const suggestion of highPrioritySuggestions) {
        await this.applySuggestion(suggestion);
      }

      logger.info('Query optimizations applied', { count: highPrioritySuggestions.length });
    } catch (error) {
      logger.error('Failed to apply optimizations', { error: error.message });
    }
  }

  /**
   * Apply individual optimization suggestion
   */
  private async applySuggestion(suggestion: QueryOptimizationSuggestion): Promise<void> {
    for (const opt of suggestion.suggestions) {
      if (opt.type === 'index' && opt.priority === 'critical') {
        await this.createOptimalIndex(suggestion.collection, opt);
      } else if (opt.type === 'query' && opt.description.includes('caching')) {
        await this.enableQueryCaching(suggestion.queryHash);
      }
    }
  }

  /**
   * Create optimal index based on suggestion
   */
  private async createOptimalIndex(collection: string, suggestion: any): Promise<void> {
    try {
      // This is a simplified implementation
      // In production, you would analyze the actual query patterns
      // and create appropriate indexes
      
      const indexSpec = this.generateIndexSpec(collection, suggestion);
      if (indexSpec) {
        await mongoose.connection.db.collection(collection).createIndex(indexSpec);
        logger.info('Index created', { collection, indexSpec });
      }
    } catch (error) {
      logger.error('Failed to create index', { collection, error: error.message });
    }
  }

  /**
   * Enable query caching for frequently accessed queries
   */
  private async enableQueryCaching(queryHash: string): Promise<void> {
    // Add query hash to cache whitelist
    await advancedCacheService.set(`cache_enabled:${queryHash}`, true, {
      ttl: 3600,
      tags: ['query_caching'],
      priority: 'medium'
    });
  }

  /**
   * Start periodic analysis
   */
  private startPeriodicAnalysis(): void {
    this.analysisTimer = setInterval(() => {
      this.analyzePerformance().catch(error => {
        logger.error('Periodic analysis failed', { error: error.message });
      });
    }, this.analysisInterval);

    logger.info('Periodic query analysis started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }
    logger.info('Query performance monitoring stopped');
  }

  // Helper methods
  private generateQueryHash(query: any): string {
    return require('crypto').createHash('md5').update(JSON.stringify(query)).digest('hex');
  }

  private extractDocumentsExamined(result: any): number {
    return result?.executionStats?.totalDocsExamined || 0;
  }

  private extractDocumentsReturned(result: any): number {
    return result?.executionStats?.totalDocsReturned || 0;
  }

  private extractIndexesUsed(result: any): string[] {
    return result?.executionStats?.indexesUsed || [];
  }

  private extractQueryPlan(result: any): any {
    return result?.executionStats?.queryPlan || null;
  }

  private isFrequentQuery(queryHash: string): boolean {
    const queryCount = this.metrics.filter(m => m.queryHash === queryHash).length;
    return queryCount > 10; // Threshold for frequent queries
  }

  private async cacheQueryResult(queryHash: string, result: any): Promise<void> {
    if (result && typeof result === 'object') {
      await advancedCacheService.set(`query_result:${queryHash}`, result, {
        ttl: 300, // 5 minutes
        tags: ['query_cache'],
        priority: 'low'
      });
    }
  }

  private calculateAverageResponseTime(): number {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length;
  }

  private calculateQueryDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};
    this.metrics.forEach(m => {
      const key = `${m.collection}.${m.operation}`;
      distribution[key] = (distribution[key] || 0) + 1;
    });
    return distribution;
  }

  private getTopSlowQueries(): QueryMetrics[] {
    return this.metrics
      .filter(m => m.isSlowQuery)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }

  private groupQueriesByHash(): Record<string, QueryMetrics[]> {
    const groups: Record<string, QueryMetrics[]> = {};
    this.metrics.forEach(m => {
      if (!groups[m.queryHash]) {
        groups[m.queryHash] = [];
      }
      groups[m.queryHash].push(m);
    });
    return groups;
  }

  private hasSuboptimalQueryStructure(query: QueryMetrics): boolean {
    // Simplified check - in production, implement more sophisticated analysis
    return query.duration > 200 && query.documentsExamined > query.documentsReturned * 5;
  }

  private getQueryTypeDistribution(metrics: QueryMetrics[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    metrics.forEach(m => {
      distribution[m.operation] = (distribution[m.operation] || 0) + 1;
    });
    return distribution;
  }

  private getTopCollections(metrics: QueryMetrics[]): Record<string, number> {
    const collections: Record<string, number> = {};
    metrics.forEach(m => {
      collections[m.collection] = (collections[m.collection] || 0) + 1;
    });
    return collections;
  }

  private generateIndexSpec(collection: string, suggestion: any): any {
    // Simplified index spec generation
    // In production, analyze actual query patterns
    return { createdAt: -1, status: 1 };
  }
}

// Export singleton instance
export const queryPerformanceMonitor = new QueryPerformanceMonitor();