import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';

const logger = new Logger('QueryOptimizer');

/**
 * Database query optimization utilities
 */
export class QueryOptimizer {
  /**
   * Add indexes to improve query performance
   */
  static async createIndexes() {
    try {
      logger.info('Creating database indexes...');

      // Product indexes
      await mongoose.connection.collection('products').createIndexes([
        { key: { tenantId: 1, status: 1, isPublished: 1 }, name: 'tenant_status_published' },
        { key: { category: 1, subcategory: 1 }, name: 'category_subcategory' },
        { key: { supplier: 1, status: 1 }, name: 'supplier_status' },
        { key: { 'pricing.basePrice': 1 }, name: 'price' },
        { key: { 'inventory.availableQuantity': 1 }, name: 'available_quantity' },
        { key: { name: 'text', description: 'text', tags: 'text' }, name: 'text_search' },
        { key: { createdAt: -1 }, name: 'created_desc' },
        { key: { 'analytics.averageRating': -1 }, name: 'rating_desc' }
      ]);

      // User indexes
      await mongoose.connection.collection('users').createIndexes([
        { key: { email: 1 }, name: 'email_unique', unique: true },
        { key: { tenantId: 1, isActive: 1 }, name: 'tenant_active' },
        { key: { company: 1 }, name: 'company' },
        { key: { role: 1 }, name: 'role' },
        { key: { lastLogin: -1 }, name: 'last_login' }
      ]);

      // Order indexes
      await mongoose.connection.collection('orders').createIndexes([
        { key: { orderNumber: 1 }, name: 'order_number_unique', unique: true },
        { key: { tenantId: 1, status: 1 }, name: 'tenant_status' },
        { key: { buyer: 1, createdAt: -1 }, name: 'buyer_created' },
        { key: { seller: 1, createdAt: -1 }, name: 'seller_created' },
        { key: { 'payment.status': 1 }, name: 'payment_status' },
        { key: { createdAt: -1 }, name: 'created_desc' }
      ]);

      // Company indexes
      await mongoose.connection.collection('companies').createIndexes([
        { key: { tenantId: 1, type: 1 }, name: 'tenant_type' },
        { key: { verificationLevel: 1 }, name: 'verification_level' },
        { key: { country: 1 }, name: 'country' },
        { key: { name: 'text', description: 'text' }, name: 'text_search' }
      ]);

      // RFQ indexes
      await mongoose.connection.collection('rfqs').createIndexes([
        { key: { rfqNumber: 1 }, name: 'rfq_number_unique', unique: true },
        { key: { tenantId: 1, status: 1 }, name: 'tenant_status' },
        { key: { buyer: 1, createdAt: -1 }, name: 'buyer_created' },
        { key: { category: 1 }, name: 'category' },
        { key: { validUntil: 1 }, name: 'valid_until' }
      ]);

      logger.info('Database indexes created successfully');
    } catch (error) {
      logger.error('Error creating indexes:', error);
      throw error;
    }
  }

  /**
   * Analyze slow queries
   */
  static async analyzeSlowQueries(threshold: number = 100) {
    try {
      const admin = mongoose.connection.db.admin();
      const result = await admin.command({
        currentOp: true,
        active: true,
        microsecs_running: { $gte: threshold * 1000 }
      });

      if (result.inprog && result.inprog.length > 0) {
        logger.warn(`Found ${result.inprog.length} slow queries:`);
        result.inprog.forEach((op: any) => {
          logger.warn({
            collection: op.ns,
            operation: op.op,
            duration: op.microsecs_running / 1000,
            query: op.command
          });
        });
      }

      return result.inprog || [];
    } catch (error) {
      logger.error('Error analyzing slow queries:', error);
      return [];
    }
  }

  /**
   * Get collection statistics
   */
  static async getCollectionStats(collectionName: string) {
    try {
      const stats = await mongoose.connection.db.collection(collectionName).stats();
      return {
        documents: stats.count,
        size: stats.size,
        avgDocSize: stats.avgObjSize,
        indexes: stats.nindexes,
        indexSize: stats.totalIndexSize
      };
    } catch (error) {
      logger.error(`Error getting stats for ${collectionName}:`, error);
      return null;
    }
  }

  /**
   * Optimize a specific query with explain
   */
  static async explainQuery(collection: string, query: any, options: any = {}) {
    try {
      const explanation = await mongoose.connection.db
        .collection(collection)
        .find(query, options)
        .explain('executionStats');

      const stats = explanation.executionStats;
      const isOptimal = stats.totalDocsExamined === stats.nReturned;

      return {
        isOptimal,
        executionTime: stats.executionTimeMillis,
        docsExamined: stats.totalDocsExamined,
        docsReturned: stats.nReturned,
        indexUsed: explanation.executionStats.executionStages.indexName || 'NONE',
        stage: explanation.executionStats.executionStages.stage,
        recommendation: isOptimal ? 'Query is optimal' : 'Consider adding an index'
      };
    } catch (error) {
      logger.error('Error explaining query:', error);
      return null;
    }
  }

  /**
   * Reindex a collection
   */
  static async reindexCollection(collectionName: string) {
    try {
      logger.info(`Reindexing collection: ${collectionName}`);
      await mongoose.connection.db.collection(collectionName).reIndex();
      logger.info(`Reindexing complete for: ${collectionName}`);
    } catch (error) {
      logger.error(`Error reindexing ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Get index usage statistics
   */
  static async getIndexUsageStats(collectionName: string) {
    try {
      const indexes = await mongoose.connection.db
        .collection(collectionName)
        .aggregate([
          { $indexStats: {} }
        ])
        .toArray();

      return indexes.map(idx => ({
        name: idx.name,
        operations: idx.accesses.ops,
        since: idx.accesses.since,
        usage: idx.accesses.ops > 0 ? 'USED' : 'UNUSED'
      }));
    } catch (error) {
      logger.error(`Error getting index stats for ${collectionName}:`, error);
      return [];
    }
  }

  /**
   * Clean up unused indexes
   */
  static async cleanupUnusedIndexes(dryRun: boolean = true) {
    const collections = ['products', 'users', 'orders', 'companies', 'rfqs'];
    const unusedIndexes: any[] = [];

    for (const collection of collections) {
      const stats = await this.getIndexUsageStats(collection);
      const unused = stats.filter(idx =>
        idx.usage === 'UNUSED' &&
        idx.name !== '_id_' &&
        !idx.name.includes('unique')
      );

      if (unused.length > 0) {
        unusedIndexes.push({ collection, indexes: unused });

        if (!dryRun) {
          for (const idx of unused) {
            try {
              await mongoose.connection.db
                .collection(collection)
                .dropIndex(idx.name);
              logger.info(`Dropped unused index: ${collection}.${idx.name}`);
            } catch (error) {
              logger.error(`Error dropping index ${idx.name}:`, error);
            }
          }
        }
      }
    }

    return unusedIndexes;
  }

  /**
   * Compact a collection to reclaim disk space
   */
  static async compactCollection(collectionName: string) {
    try {
      logger.info(`Compacting collection: ${collectionName}`);
      await mongoose.connection.db.admin().command({
        compact: collectionName,
        force: true
      });
      logger.info(`Compacting complete for: ${collectionName}`);
    } catch (error) {
      logger.error(`Error compacting ${collectionName}:`, error);
      throw error;
    }
  }
}

/**
 * Query performance monitoring middleware
 */
export const queryPerformanceMonitor = () => {
  // Monitor all mongoose queries
  mongoose.set('debug', (collectionName: string, method: string, query: any, doc: any, options: any) => {
    const start = Date.now();

    // Log slow queries
    process.nextTick(() => {
      const duration = Date.now() - start;
      if (duration > 100) { // Log queries taking more than 100ms
        logger.warn('Slow query detected', {
          collection: collectionName,
          method,
          duration,
          query: JSON.stringify(query).substring(0, 200)
        });
      }
    });
  });
};

/**
 * Aggregation pipeline optimizer
 */
export class AggregationOptimizer {
  /**
   * Optimize aggregation pipeline
   */
  static optimizePipeline(pipeline: any[]): any[] {
    const optimized = [...pipeline];

    // Move $match stages to the beginning
    const matchStages = optimized.filter(stage => '$match' in stage);
    const otherStages = optimized.filter(stage => !('$match' in stage));

    // Combine consecutive $match stages
    const combinedMatch = matchStages.reduce((acc, stage) => {
      return { $match: { ...acc.$match, ...stage.$match } };
    }, { $match: {} });

    // Place combined $match at the beginning if it has conditions
    if (Object.keys(combinedMatch.$match).length > 0) {
      return [combinedMatch, ...otherStages];
    }

    return otherStages;
  }

  /**
   * Add index hints to aggregation
   */
  static addIndexHint(pipeline: any[], indexName: string): any[] {
    return [
      { $hint: indexName },
      ...pipeline
    ];
  }
}

/**
 * Connection pool optimizer
 */
export class ConnectionPoolOptimizer {
  /**
   * Get connection pool statistics
   */
  static getPoolStats() {
    const {connection} = mongoose;
    return {
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name
    };
  }

  /**
   * Optimize connection pool settings
   * Note: poolSize is deprecated - use maxPoolSize in connection options instead
   */
  static optimizePool(options: {
    poolSize?: number;
    serverSelectionTimeoutMS?: number;
    socketTimeoutMS?: number;
  }) {
    // poolSize is deprecated in mongoose - connection pool should be configured via connect options
    console.warn('Warning: poolSize is deprecated. Use maxPoolSize and minPoolSize in connection options instead.');
    mongoose.set('serverSelectionTimeoutMS', options.serverSelectionTimeoutMS || 5000);
    mongoose.set('socketTimeoutMS', options.socketTimeoutMS || 45000);
  }
}
