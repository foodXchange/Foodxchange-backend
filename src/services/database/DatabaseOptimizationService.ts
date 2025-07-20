import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';

const logger = new Logger('DatabaseOptimizationService');

export class DatabaseOptimizationService {
  /**
   * Create optimal indexes for all collections
   */
  async createIndexes(): Promise<void> {
    try {
      logger.info('Starting database index optimization...');

      // User indexes
      await this.createUserIndexes();

      // Product indexes
      await this.createProductIndexes();

      // Order indexes
      await this.createOrderIndexes();

      // RFQ indexes
      await this.createRFQIndexes();

      // Company indexes
      await this.createCompanyIndexes();

      // Agent indexes
      await this.createAgentIndexes();

      // Conversation/Message indexes
      await this.createMessagingIndexes();

      logger.info('Database index optimization completed');
    } catch (error) {
      logger.error('Failed to create indexes:', error);
      throw error;
    }
  }

  private async createUserIndexes(): Promise<void> {
    const User = mongoose.connection.collection('users');

    // Single field indexes
    await User.createIndex({ email: 1 }, { unique: true, background: true });
    await User.createIndex({ role: 1 }, { background: true });
    await User.createIndex({ accountStatus: 1 }, { background: true });
    await User.createIndex({ companyVerified: 1 }, { background: true });
    await User.createIndex({ createdAt: -1 }, { background: true });
    await User.createIndex({ lastLoginAt: -1 }, { background: true });

    // Compound indexes for common queries
    await User.createIndex({ role: 1, accountStatus: 1 }, { background: true });
    await User.createIndex({ role: 1, companyVerified: 1, rating: -1 }, { background: true });

    // Text search index
    await User.createIndex(
      { firstName: 'text', lastName: 'text', email: 'text', 'company.name': 'text' },
      { background: true }
    );

    // TTL index for password reset tokens
    await User.createIndex(
      { passwordResetExpires: 1 },
      { expireAfterSeconds: 0, sparse: true, background: true }
    );

    logger.info('User indexes created');
  }

  private async createProductIndexes(): Promise<void> {
    const Product = mongoose.connection.collection('products');

    // Single field indexes
    await Product.createIndex({ sku: 1 }, { unique: true, background: true });
    await Product.createIndex({ supplier: 1 }, { background: true });
    await Product.createIndex({ category: 1 }, { background: true });
    await Product.createIndex({ status: 1 }, { background: true });
    await Product.createIndex({ createdAt: -1 }, { background: true });
    await Product.createIndex({ 'pricing.basePrice': 1 }, { background: true });
    await Product.createIndex({ rating: -1 }, { background: true });

    // Compound indexes for common queries
    await Product.createIndex({ supplier: 1, status: 1 }, { background: true });
    await Product.createIndex({ category: 1, status: 1, rating: -1 }, { background: true });
    await Product.createIndex({ status: 1, createdAt: -1 }, { background: true });

    // Geospatial index if location is stored
    await Product.createIndex({ 'location.coordinates': '2dsphere' }, { sparse: true, background: true });

    // Text search index
    await Product.createIndex(
      { name: 'text', description: 'text', tags: 'text' },
      { background: true }
    );

    logger.info('Product indexes created');
  }

  private async createOrderIndexes(): Promise<void> {
    const Order = mongoose.connection.collection('orders');

    // Single field indexes
    await Order.createIndex({ orderNumber: 1 }, { unique: true, background: true });
    await Order.createIndex({ buyer: 1 }, { background: true });
    await Order.createIndex({ seller: 1 }, { background: true });
    await Order.createIndex({ status: 1 }, { background: true });
    await Order.createIndex({ createdAt: -1 }, { background: true });
    await Order.createIndex({ deliveryDate: 1 }, { background: true });

    // Compound indexes
    await Order.createIndex({ buyer: 1, status: 1, createdAt: -1 }, { background: true });
    await Order.createIndex({ seller: 1, status: 1, createdAt: -1 }, { background: true });
    await Order.createIndex({ status: 1, deliveryDate: 1 }, { background: true });

    logger.info('Order indexes created');
  }

  private async createRFQIndexes(): Promise<void> {
    const RFQ = mongoose.connection.collection('rfqs');

    // Single field indexes
    await RFQ.createIndex({ rfqNumber: 1 }, { unique: true, background: true });
    await RFQ.createIndex({ buyer: 1 }, { background: true });
    await RFQ.createIndex({ status: 1 }, { background: true });
    await RFQ.createIndex({ category: 1 }, { background: true });
    await RFQ.createIndex({ createdAt: -1 }, { background: true });
    await RFQ.createIndex({ expiresAt: 1 }, { background: true });

    // Compound indexes
    await RFQ.createIndex({ buyer: 1, status: 1, createdAt: -1 }, { background: true });
    await RFQ.createIndex({ category: 1, status: 1, expiresAt: -1 }, { background: true });
    await RFQ.createIndex({ status: 1, expiresAt: 1 }, { background: true });

    // TTL index for automatic expiration
    await RFQ.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, background: true }
    );

    logger.info('RFQ indexes created');
  }

  private async createCompanyIndexes(): Promise<void> {
    const Company = mongoose.connection.collection('companies');

    // Single field indexes
    await Company.createIndex({ name: 1 }, { unique: true, background: true });
    await Company.createIndex({ type: 1 }, { background: true });
    await Company.createIndex({ verificationStatus: 1 }, { background: true });
    await Company.createIndex({ createdAt: -1 }, { background: true });

    // Text search index
    await Company.createIndex(
      { name: 'text', description: 'text' },
      { background: true }
    );

    logger.info('Company indexes created');
  }

  private async createAgentIndexes(): Promise<void> {
    const Agent = mongoose.connection.collection('agents');

    // Single field indexes
    await Agent.createIndex({ userId: 1 }, { unique: true, background: true });
    await Agent.createIndex({ agentNumber: 1 }, { unique: true, background: true });
    await Agent.createIndex({ 'personalInfo.email': 1 }, { unique: true, background: true });
    await Agent.createIndex({ status: 1 }, { background: true });
    await Agent.createIndex({ 'performance.tier': 1 }, { background: true });
    await Agent.createIndex({ lastActivity: -1 }, { background: true });

    // Compound indexes
    await Agent.createIndex({ status: 1, 'performance.tier': 1 }, { background: true });
    await Agent.createIndex({ 'territory.geographic.regions': 1 }, { background: true });
    await Agent.createIndex({ 'expertise.specializations': 1 }, { background: true });

    // Text search index
    await Agent.createIndex(
      {
        'personalInfo.firstName': 'text',
        'personalInfo.lastName': 'text',
        'personalInfo.email': 'text',
        'expertise.skills': 'text'
      },
      { background: true }
    );

    logger.info('Agent indexes created');
  }

  private async createMessagingIndexes(): Promise<void> {
    const Conversation = mongoose.connection.collection('conversations');
    const Message = mongoose.connection.collection('messages');

    // Conversation indexes
    await Conversation.createIndex({ participants: 1 }, { background: true });
    await Conversation.createIndex({ type: 1 }, { background: true });
    await Conversation.createIndex({ lastMessageAt: -1 }, { background: true });
    await Conversation.createIndex({ 'metadata.rfqId': 1 }, { sparse: true, background: true });
    await Conversation.createIndex({ 'metadata.orderId': 1 }, { sparse: true, background: true });

    // Message indexes
    await Message.createIndex({ conversation: 1, createdAt: -1 }, { background: true });
    await Message.createIndex({ sender: 1, createdAt: -1 }, { background: true });
    await Message.createIndex({ 'readBy.user': 1 }, { background: true });

    logger.info('Messaging indexes created');
  }

  /**
   * Analyze and optimize slow queries
   */
  async analyzeSlowQueries(): Promise<any[]> {
    try {
      const admin = mongoose.connection.db.admin();
      const result = await admin.command({
        currentOp: true,
        active: true,
        microsecs_running: { $gte: 1000 } // Queries running for more than 1ms
      });

      const slowQueries = result.inprog.filter((op: any) =>
        op.op === 'query' && op.secs_running > 0.1 // More than 100ms
      );

      return slowQueries.map((query: any) => ({
        collection: query.ns,
        duration: query.secs_running,
        query: query.command?.filter || query.command,
        planSummary: query.planSummary
      }));
    } catch (error) {
      logger.error('Failed to analyze slow queries:', error);
      return [];
    }
  }

  /**
   * Optimize collection statistics
   */
  async optimizeCollections(): Promise<void> {
    try {
      const collections = await mongoose.connection.db.collections();

      for (const collection of collections) {
        // Compact collection to reclaim space
        await mongoose.connection.db.command({
          compact: collection.collectionName,
          force: true
        });

        // Update collection statistics
        await collection.stats();

        logger.info(`Optimized collection: ${collection.collectionName}`);
      }
    } catch (error) {
      logger.error('Failed to optimize collections:', error);
    }
  }

  /**
   * Enable query profiling for performance monitoring
   */
  async enableProfiling(level: 0 | 1 | 2 = 1, slowMs: number = 100): Promise<void> {
    try {
      await mongoose.connection.db.setProfilingLevel(level, { slowms: slowMs });
      logger.info(`Database profiling enabled at level ${level} with slowMs: ${slowMs}`);
    } catch (error) {
      logger.error('Failed to enable profiling:', error);
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const stats = await mongoose.connection.db.stats();
      const collections = await mongoose.connection.db.collections();

      const collectionStats = await Promise.all(
        collections.map(async (col) => {
          const colStats = await col.stats();
          const indexes = await col.indexes();

          return {
            name: col.collectionName,
            count: colStats.count,
            size: colStats.size,
            avgObjSize: colStats.avgObjSize,
            indexCount: indexes.length,
            totalIndexSize: colStats.totalIndexSize
          };
        })
      );

      return {
        database: stats.db,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        collectionDetails: collectionStats
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      throw error;
    }
  }
}

export const databaseOptimizationService = new DatabaseOptimizationService();
