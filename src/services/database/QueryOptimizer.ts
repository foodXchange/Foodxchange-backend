import mongoose from 'mongoose';
import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';

const logger = new Logger('QueryOptimizer');

export interface QueryAnalysis {
  collection: string;
  query: any;
  executionTime: number;
  indexUsed: boolean;
  indexName?: string;
  docsExamined: number;
  docsReturned: number;
  suggestions: string[];
}

export interface SlowQuery {
  timestamp: Date;
  namespace: string;
  command: any;
  durationMillis: number;
  planSummary?: string;
  keysExamined?: number;
  docsExamined?: number;
  docsReturned?: number;
}

export class QueryOptimizer {
  private static instance: QueryOptimizer;
  private metricsService: MetricsService;
  private slowQueryThreshold: number = 100; // 100ms
  private analysisCache: Map<string, QueryAnalysis> = new Map();

  private constructor() {
    this.metricsService = new MetricsService();
  }

  public static getInstance(): QueryOptimizer {
    if (!QueryOptimizer.instance) {
      QueryOptimizer.instance = new QueryOptimizer();
    }
    return QueryOptimizer.instance;
  }

  public async analyzeQuery(collection: string, query: any): Promise<QueryAnalysis> {
    const cacheKey = `${collection}_${JSON.stringify(query)}`;
    
    // Check cache first
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }

    try {
      const startTime = Date.now();
      const db = mongoose.connection.db;
      const coll = db.collection(collection);
      
      // Get query execution plan
      const explainResult = await coll.find(query).explain('executionStats');
      const executionTime = Date.now() - startTime;
      
      const executionStats = explainResult.executionStats;
      const analysis: QueryAnalysis = {
        collection,
        query,
        executionTime,
        indexUsed: executionStats.totalDocsExamined > 0 && executionStats.totalDocsExamined <= executionStats.totalDocsReturned * 2,
        indexName: executionStats.winningPlan?.inputStage?.indexName,
        docsExamined: executionStats.totalDocsExamined,
        docsReturned: executionStats.totalDocsReturned,
        suggestions: []
      };

      // Generate optimization suggestions
      analysis.suggestions = this.generateSuggestions(analysis, executionStats);

      // Cache the result
      this.analysisCache.set(cacheKey, analysis);
      
      // Record metrics
      this.metricsService.recordTimer('query_execution_time_seconds', executionTime / 1000, {
        collection,
        index_used: analysis.indexUsed.toString()
      });

      if (executionTime > this.slowQueryThreshold) {
        this.metricsService.incrementCounter('slow_queries_total', { collection });
        logger.warn('Slow query detected', {
          collection,
          executionTime,
          query,
          indexUsed: analysis.indexUsed
        });
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze query', { collection, query, error });
      throw error;
    }
  }

  private generateSuggestions(analysis: QueryAnalysis, executionStats: any): string[] {
    const suggestions: string[] = [];

    // High ratio of documents examined vs returned
    if (analysis.docsExamined > analysis.docsReturned * 10) {
      suggestions.push(`Consider adding an index to reduce document scanning. Examined ${analysis.docsExamined} docs but returned only ${analysis.docsReturned}`);
    }

    // No index used
    if (!analysis.indexUsed) {
      const queryFields = Object.keys(analysis.query);
      if (queryFields.length > 0) {
        suggestions.push(`Consider adding an index on: ${queryFields.join(', ')}`);
      }
    }

    // Collection scan detected
    if (executionStats.winningPlan?.stage === 'COLLSCAN') {
      suggestions.push('Query is performing a collection scan. Add appropriate indexes.');
    }

    // Inefficient sorting
    if (executionStats.winningPlan?.stage === 'SORT' && !executionStats.winningPlan?.inputStage?.indexName) {
      suggestions.push('Query is sorting without an index. Consider adding an index that supports the sort operation.');
    }

    // Large result set
    if (analysis.docsReturned > 1000) {
      suggestions.push('Query returns a large number of documents. Consider pagination or filtering.');
    }

    return suggestions;
  }

  public async getSlowQueries(limit: number = 10): Promise<SlowQuery[]> {
    try {
      const db = mongoose.connection.db;
      
      // Try to get from profiler collection
      const profilerData = await db.collection('system.profile')
        .find({
          durationMillis: { $gt: this.slowQueryThreshold }
        })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray();

      return profilerData.map(doc => ({
        timestamp: doc.ts,
        namespace: doc.ns,
        command: doc.command,
        durationMillis: doc.durationMillis,
        planSummary: doc.planSummary,
        keysExamined: doc.keysExamined,
        docsExamined: doc.docsExamined,
        docsReturned: doc.docsReturned
      }));
    } catch (error) {
      logger.debug('Profiler not available or accessible', { error });
      return [];
    }
  }

  public async enableProfiling(slowOpThreshold: number = 100): Promise<void> {
    try {
      const db = mongoose.connection.db;
      await db.admin().command({
        profile: 2, // Profile all operations
        slowOpThreshold
      });
      logger.info('Database profiling enabled', { slowOpThreshold });
    } catch (error) {
      logger.error('Failed to enable database profiling', { error });
    }
  }

  public async disableProfiling(): Promise<void> {
    try {
      const db = mongoose.connection.db;
      await db.admin().command({ profile: 0 });
      logger.info('Database profiling disabled');
    } catch (error) {
      logger.error('Failed to disable database profiling', { error });
    }
  }

  public async getQueryStats(collection: string): Promise<any> {
    try {
      const db = mongoose.connection.db;
      const coll = db.collection(collection);
      
      const stats = await coll.stats();
      const indexStats = await coll.aggregate([{ $indexStats: {} }]).toArray();
      
      return {
        collection,
        documentCount: stats.count,
        indexCount: stats.nindexes,
        totalSize: stats.size,
        avgObjSize: stats.avgObjSize,
        indexes: indexStats.map(idx => ({
          name: idx.name,
          accesses: idx.accesses,
          since: idx.since
        }))
      };
    } catch (error) {
      logger.error('Failed to get query stats', { collection, error });
      throw error;
    }
  }

  public async optimizeCollection(collection: string): Promise<{
    analyzed: number;
    optimized: number;
    suggestions: string[];
  }> {
    logger.info(`Starting optimization analysis for collection: ${collection}`);
    
    const allSuggestions: string[] = [];
    let analyzed = 0;
    let optimized = 0;

    try {
      // Get collection stats
      const stats = await this.getQueryStats(collection);
      
      // Analyze common query patterns
      const commonQueries = await this.getCommonQueryPatterns(collection);
      
      for (const query of commonQueries) {
        const analysis = await this.analyzeQuery(collection, query);
        analyzed++;
        
        if (analysis.suggestions.length > 0) {
          allSuggestions.push(...analysis.suggestions);
          optimized++;
        }
      }

      // Check for unused indexes
      const unusedIndexes = await this.findUnusedIndexes(collection);
      if (unusedIndexes.length > 0) {
        allSuggestions.push(`Consider removing unused indexes: ${unusedIndexes.join(', ')}`);
      }

      // Check index effectiveness
      const indexEffectiveness = await this.analyzeIndexEffectiveness(collection);
      allSuggestions.push(...indexEffectiveness);

      logger.info(`Optimization analysis completed for ${collection}`, {
        analyzed,
        optimized,
        suggestions: allSuggestions.length
      });

      return {
        analyzed,
        optimized,
        suggestions: [...new Set(allSuggestions)] // Remove duplicates
      };
    } catch (error) {
      logger.error('Failed to optimize collection', { collection, error });
      throw error;
    }
  }

  private async getCommonQueryPatterns(collection: string): Promise<any[]> {
    // Define common query patterns based on collection type
    const patterns: Record<string, any[]> = {
      users: [
        { email: { $exists: true } },
        { role: 'buyer' },
        { role: 'seller' },
        { accountStatus: 'active' },
        { isEmailVerified: true },
        { onboardingStep: 'completed' },
        { role: 'buyer', accountStatus: 'active' },
        { company: { $exists: true } }
      ],
      companies: [
        { verificationStatus: 'verified' },
        { businessType: 'restaurant' },
        { businessType: 'supplier' },
        { size: 'medium' },
        { industry: { $exists: true } },
        { createdBy: { $exists: true } }
      ],
      analyticsevents: [
        { eventType: 'user_login' },
        { eventType: 'user_registration' },
        { processed: false },
        { timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    };

    return patterns[collection] || [];
  }

  private async findUnusedIndexes(collection: string): Promise<string[]> {
    try {
      const db = mongoose.connection.db;
      const coll = db.collection(collection);
      
      const indexStats = await coll.aggregate([{ $indexStats: {} }]).toArray();
      
      return indexStats
        .filter(stat => stat.accesses.ops === 0 && stat.name !== '_id_')
        .map(stat => stat.name);
    } catch (error) {
      logger.error('Failed to find unused indexes', { collection, error });
      return [];
    }
  }

  private async analyzeIndexEffectiveness(collection: string): Promise<string[]> {
    const suggestions: string[] = [];
    
    try {
      const db = mongoose.connection.db;
      const coll = db.collection(collection);
      
      const indexStats = await coll.aggregate([{ $indexStats: {} }]).toArray();
      
      for (const stat of indexStats) {
        if (stat.name === '_id_') continue;
        
        // Low usage index
        if (stat.accesses.ops < 10) {
          suggestions.push(`Index '${stat.name}' has low usage (${stat.accesses.ops} operations)`);
        }
        
        // Check if index is too large relative to usage
        if (stat.accesses.ops > 0) {
          const opsPerDay = stat.accesses.ops / ((Date.now() - new Date(stat.since).getTime()) / (24 * 60 * 60 * 1000));
          if (opsPerDay < 1) {
            suggestions.push(`Index '${stat.name}' is rarely used (${opsPerDay.toFixed(2)} ops/day)`);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to analyze index effectiveness', { collection, error });
    }
    
    return suggestions;
  }

  public clearCache(): void {
    this.analysisCache.clear();
    logger.info('Query analysis cache cleared');
  }

  public setCacheSize(maxSize: number): void {
    if (this.analysisCache.size > maxSize) {
      const entries = Array.from(this.analysisCache.entries());
      this.analysisCache.clear();
      // Keep only the most recent entries
      entries.slice(-maxSize).forEach(([key, value]) => {
        this.analysisCache.set(key, value);
      });
    }
  }
}