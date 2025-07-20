import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { User } from '../../models/User';

const logger = new Logger('IndexManager');

export interface IndexDefinition {
  fields: Record<string, 1 | -1 | 'text' | '2dsphere'>;
  options?: mongoose.IndexOptions;
  collection: string;
}

export class IndexManager {
  private static instance: IndexManager;
  private readonly indexes: IndexDefinition[] = [];

  private constructor() {
    this.defineIndexes();
  }

  public static getInstance(): IndexManager {
    if (!IndexManager.instance) {
      IndexManager.instance = new IndexManager();
    }
    return IndexManager.instance;
  }

  private defineIndexes(): void {
    // User Collection Indexes
    this.indexes.push(
      // Primary lookups
      { fields: { email: 1 }, options: { unique: true, background: true }, collection: 'users' },
      { fields: { refreshToken: 1 }, options: { sparse: true, background: true }, collection: 'users' },
      { fields: { passwordResetToken: 1 }, options: { sparse: true, background: true }, collection: 'users' },

      // Query optimization indexes
      { fields: { role: 1, accountStatus: 1 }, options: { background: true }, collection: 'users' },
      { fields: { company: 1 }, options: { background: true }, collection: 'users' },
      { fields: { onboardingStep: 1 }, options: { background: true }, collection: 'users' },
      { fields: { isEmailVerified: 1 }, options: { background: true }, collection: 'users' },
      { fields: { companyVerified: 1 }, options: { background: true }, collection: 'users' },

      // Authentication indexes
      { fields: { accountStatus: 1, failedLoginAttempts: 1 }, options: { background: true }, collection: 'users' },
      { fields: { lastLoginAt: -1 }, options: { background: true }, collection: 'users' },
      { fields: { createdAt: -1 }, options: { background: true }, collection: 'users' },

      // Compound indexes for common queries
      { fields: { role: 1, createdAt: -1 }, options: { background: true }, collection: 'users' },
      { fields: { company: 1, role: 1 }, options: { background: true }, collection: 'users' },
      { fields: { accountStatus: 1, lastLoginAt: -1 }, options: { background: true }, collection: 'users' },

      // Search indexes
      { fields: { firstName: 'text', lastName: 'text', email: 'text' }, options: { background: true }, collection: 'users' }
    );

    // Company Collection Indexes
    this.indexes.push(
      // Primary lookups
      { fields: { name: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { createdBy: 1 }, options: { background: true }, collection: 'companies' },

      // Query optimization indexes
      { fields: { verificationStatus: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { businessType: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { size: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { industry: 1 }, options: { background: true }, collection: 'companies' },

      // Compound indexes for filtering
      { fields: { businessType: 1, size: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { verificationStatus: 1, businessType: 1 }, options: { background: true }, collection: 'companies' },
      { fields: { industry: 1, size: 1 }, options: { background: true }, collection: 'companies' },

      // Location-based indexes (if address coordinates are added)
      // { fields: { 'address.location': '2dsphere' }, options: { background: true }, collection: 'companies' },

      // Search indexes
      { fields: { name: 'text', description: 'text', industry: 'text' }, options: { background: true }, collection: 'companies' },

      // Time-based indexes
      { fields: { createdAt: -1 }, options: { background: true }, collection: 'companies' },
      { fields: { updatedAt: -1 }, options: { background: true }, collection: 'companies' }
    );

    // Analytics Collection Indexes (for AnalyticsService)
    this.indexes.push(
      { fields: { eventType: 1, timestamp: -1 }, options: { background: true }, collection: 'analyticsevents' },
      { fields: { userId: 1, timestamp: -1 }, options: { background: true }, collection: 'analyticsevents' },
      { fields: { timestamp: -1 }, options: { background: true }, collection: 'analyticsevents' },
      { fields: { processed: 1, timestamp: -1 }, options: { background: true }, collection: 'analyticsevents' },
      { fields: { batchId: 1 }, options: { background: true }, collection: 'analyticsevents' },
      { fields: { eventType: 1, userId: 1, timestamp: -1 }, options: { background: true }, collection: 'analyticsevents' },

      // TTL index for automatic cleanup (90 days)
      { fields: { timestamp: 1 }, options: { expireAfterSeconds: 7776000, background: true }, collection: 'analyticsevents' }
    );

    logger.info(`Defined ${this.indexes.length} indexes for optimization`);
  }

  public async createAllIndexes(): Promise<void> {
    logger.info('Starting index creation process...');

    const results = await Promise.allSettled(
      this.indexes.map(async (indexDef) => {
        try {
          const collection = mongoose.connection.db.collection(indexDef.collection);
          await collection.createIndex(indexDef.fields, indexDef.options);
          logger.info(`Created index on ${indexDef.collection}:`, indexDef.fields);
          return { success: true, collection: indexDef.collection };
        } catch (error) {
          logger.error(`Failed to create index on ${indexDef.collection}:`, error);
          return { success: false, collection: indexDef.collection, error };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    logger.info(`Index creation completed: ${successful} successful, ${failed} failed`);
  }

  public async analyzeIndexUsage(): Promise<any> {
    logger.info('Analyzing index usage...');

    const collections = ['users', 'companies', 'analyticsevents'];
    const analysis: any = {};

    for (const collectionName of collections) {
      try {
        const collection = mongoose.connection.db.collection(collectionName);
        const stats = await collection.aggregate([
          { $indexStats: {} }
        ]).toArray();

        analysis[collectionName] = stats.map(stat => ({
          name: stat.name,
          accesses: stat.accesses,
          since: stat.since
        }));
      } catch (error) {
        logger.error(`Failed to analyze indexes for ${collectionName}:`, error);
        analysis[collectionName] = { error: error.message };
      }
    }

    return analysis;
  }

  public async getIndexInfo(collectionName: string): Promise<any> {
    try {
      const collection = mongoose.connection.db.collection(collectionName);
      const indexes = await collection.listIndexes().toArray();

      return indexes.map(index => ({
        name: index.name,
        key: index.key,
        unique: index.unique,
        sparse: index.sparse,
        background: index.background,
        expireAfterSeconds: index.expireAfterSeconds
      }));
    } catch (error) {
      logger.error(`Failed to get index info for ${collectionName}:`, error);
      throw error;
    }
  }

  public async dropUnusedIndexes(collectionName: string): Promise<void> {
    logger.warn(`Dropping unused indexes for ${collectionName}...`);

    try {
      const collection = mongoose.connection.db.collection(collectionName);
      const indexStats = await collection.aggregate([{ $indexStats: {} }]).toArray();

      // Find indexes that haven't been used (accesses.ops === 0)
      const unusedIndexes = indexStats.filter(stat =>
        stat.accesses.ops === 0 &&
        stat.name !== '_id_' // Never drop the _id index
      );

      for (const index of unusedIndexes) {
        await collection.dropIndex(index.name);
        logger.info(`Dropped unused index: ${index.name}`);
      }

      logger.info(`Dropped ${unusedIndexes.length} unused indexes from ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to drop unused indexes for ${collectionName}:`, error);
      throw error;
    }
  }

  public async optimizeQueries(): Promise<void> {
    logger.info('Running query optimization analysis...');

    // Analyze slow queries
    const slowQueries = await this.getSlowQueries();
    if (slowQueries.length > 0) {
      logger.warn(`Found ${slowQueries.length} slow queries`);
      slowQueries.forEach(query => {
        logger.warn('Slow query detected:', {
          namespace: query.ns,
          command: query.command,
          duration: query.durationMillis
        });
      });
    }

    // Suggest optimizations
    const suggestions = await this.generateOptimizationSuggestions();
    if (suggestions.length > 0) {
      logger.info('Query optimization suggestions:', suggestions);
    }
  }

  private async getSlowQueries(): Promise<any[]> {
    try {
      const {db} = mongoose.connection;
      const profilerData = await db.collection('system.profile').find({
        durationMillis: { $gt: 100 } // Queries slower than 100ms
      }).sort({ ts: -1 }).limit(10).toArray();

      return profilerData;
    } catch (error) {
      logger.debug('Profiler not enabled or accessible');
      return [];
    }
  }

  private async generateOptimizationSuggestions(): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for missing indexes on common query patterns
    const collections = ['users', 'companies'];

    for (const collectionName of collections) {
      const indexInfo = await this.getIndexInfo(collectionName);

      // Suggest compound indexes if only single field indexes exist
      if (collectionName === 'users') {
        const hasRoleIndex = indexInfo.some(idx => idx.key.role);
        const hasStatusIndex = indexInfo.some(idx => idx.key.accountStatus);
        const hasCompoundIndex = indexInfo.some(idx => idx.key.role && idx.key.accountStatus);

        if (hasRoleIndex && hasStatusIndex && !hasCompoundIndex) {
          suggestions.push('Consider adding compound index on users: { role: 1, accountStatus: 1 }');
        }
      }
    }

    return suggestions;
  }
}
