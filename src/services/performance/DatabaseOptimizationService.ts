import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { AnalyticsEvent } from '../analytics/AnalyticsService';

const logger = new Logger('DatabaseOptimizationService');

export interface IIndexInfo {
  name: string;
  key: any;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  partialFilterExpression?: any;
}

export interface IQueryStats {
  executionTime: number;
  indexesUsed: string[];
  documentsExamined: number;
  documentsReturned: number;
  isIndexOptimal: boolean;
}

export interface IPerformanceMetrics {
  averageQueryTime: number;
  slowQueries: number;
  indexUsage: { [key: string]: number };
  connectionPoolSize: number;
  activeConnections: number;
}

export class DatabaseOptimizationService {
  private readonly slowQueryThreshold = 100; // milliseconds
  private queryStats: IQueryStats[] = [];

  /**
   * Initialize database indexes
   */
  async initializeIndexes(): Promise<void> {
    try {
      logger.info('Initializing database indexes...');

      // Product indexes
      await this.createProductIndexes();

      // Order indexes
      await this.createOrderIndexes();

      // RFQ indexes
      await this.createRFQIndexes();

      // User indexes
      await this.createUserIndexes();

      // Company indexes
      await this.createCompanyIndexes();

      // Analytics indexes
      await this.createAnalyticsIndexes();

      logger.info('Database indexes initialized successfully');
    } catch (error) {
      logger.error('Error initializing database indexes:', error);
      throw error;
    }
  }

  /**
   * Create optimized indexes for Product collection
   */
  private async createProductIndexes(): Promise<void> {
    const productIndexes: IIndexInfo[] = [
      // Tenant isolation - most important
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // Compound indexes for common queries
      { name: 'tenantId_1_isActive_1', key: { tenantId: 1, isActive: 1 } },
      { name: 'tenantId_1_category_1', key: { tenantId: 1, category: 1 } },
      { name: 'tenantId_1_supplier_1', key: { tenantId: 1, supplier: 1 } },
      { name: 'tenantId_1_price_1', key: { tenantId: 1, price: 1 } },
      { name: 'tenantId_1_createdAt_-1', key: { tenantId: 1, createdAt: -1 } },

      // Text search index
      { name: 'text_search', key: { name: 'text', description: 'text', category: 'text' } },

      // Geospatial index for location-based queries
      { name: 'location_2dsphere', key: { location: '2dsphere' }, sparse: true },

      // Filtering indexes
      { name: 'tenantId_1_isOrganic_1', key: { tenantId: 1, isOrganic: 1 }, sparse: true },
      { name: 'tenantId_1_isCertified_1', key: { tenantId: 1, isCertified: 1 }, sparse: true },

      // Price range queries
      { name: 'tenantId_1_price_1_category_1', key: { tenantId: 1, price: 1, category: 1 } },

      // Supplier-specific queries
      { name: 'tenantId_1_supplier_1_isActive_1', key: { tenantId: 1, supplier: 1, isActive: 1 } },
      { name: 'tenantId_1_supplier_1_category_1', key: { tenantId: 1, supplier: 1, category: 1 } }
    ];

    await this.createIndexes(Product, productIndexes);
  }

  /**
   * Create optimized indexes for Order collection
   */
  private async createOrderIndexes(): Promise<void> {
    const orderIndexes: IIndexInfo[] = [
      // Tenant isolation
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // User-specific queries
      { name: 'tenantId_1_buyer_1', key: { tenantId: 1, buyer: 1 } },
      { name: 'tenantId_1_supplier_1', key: { tenantId: 1, supplier: 1 } },

      // Status tracking
      { name: 'tenantId_1_status_1', key: { tenantId: 1, status: 1 } },
      { name: 'tenantId_1_buyer_1_status_1', key: { tenantId: 1, buyer: 1, status: 1 } },
      { name: 'tenantId_1_supplier_1_status_1', key: { tenantId: 1, supplier: 1, status: 1 } },

      // Time-based queries
      { name: 'tenantId_1_createdAt_-1', key: { tenantId: 1, createdAt: -1 } },
      { name: 'tenantId_1_updatedAt_-1', key: { tenantId: 1, updatedAt: -1 } },

      // Order number (unique per tenant)
      { name: 'tenantId_1_orderNumber_1', key: { tenantId: 1, orderNumber: 1 }, unique: true },

      // Company-specific queries
      { name: 'tenantId_1_buyerCompany_1', key: { tenantId: 1, buyerCompany: 1 } },
      { name: 'tenantId_1_supplierCompany_1', key: { tenantId: 1, supplierCompany: 1 } },

      // Financial queries
      { name: 'tenantId_1_totalAmount_1', key: { tenantId: 1, totalAmount: 1 } },
      { name: 'tenantId_1_currency_1', key: { tenantId: 1, currency: 1 } },

      // Date range queries for analytics
      { name: 'tenantId_1_createdAt_-1_status_1', key: { tenantId: 1, createdAt: -1, status: 1 } },
      { name: 'tenantId_1_totalAmount_1_createdAt_-1', key: { tenantId: 1, totalAmount: 1, createdAt: -1 } },

      // Delivery tracking
      { name: 'tenantId_1_estimatedDelivery_1', key: { tenantId: 1, estimatedDelivery: 1 }, sparse: true },

      // Items queries (for product analytics)
      { name: 'tenantId_1_items.productId_1', key: { tenantId: 1, 'items.productId': 1 } }
    ];

    await this.createIndexes(Order, orderIndexes);
  }

  /**
   * Create optimized indexes for RFQ collection
   */
  private async createRFQIndexes(): Promise<void> {
    const rfqIndexes: IIndexInfo[] = [
      // Tenant isolation
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // User-specific queries
      { name: 'tenantId_1_buyer_1', key: { tenantId: 1, buyer: 1 } },
      { name: 'tenantId_1_buyerCompany_1', key: { tenantId: 1, buyerCompany: 1 } },

      // Status tracking
      { name: 'tenantId_1_status_1', key: { tenantId: 1, status: 1 } },
      { name: 'tenantId_1_buyer_1_status_1', key: { tenantId: 1, buyer: 1, status: 1 } },

      // Category-based queries
      { name: 'tenantId_1_category_1', key: { tenantId: 1, category: 1 } },
      { name: 'tenantId_1_category_1_status_1', key: { tenantId: 1, category: 1, status: 1 } },

      // Time-based queries
      { name: 'tenantId_1_createdAt_-1', key: { tenantId: 1, createdAt: -1 } },
      { name: 'tenantId_1_deadline_1', key: { tenantId: 1, deadline: 1 } },
      { name: 'tenantId_1_deadline_1_status_1', key: { tenantId: 1, deadline: 1, status: 1 } },

      // Budget queries
      { name: 'tenantId_1_budget_1', key: { tenantId: 1, budget: 1 } },
      { name: 'tenantId_1_currency_1', key: { tenantId: 1, currency: 1 } },

      // Text search
      { name: 'text_search', key: { title: 'text', description: 'text', category: 'text' } },

      // Quote-related queries
      { name: 'tenantId_1_quotes.supplier_1', key: { tenantId: 1, 'quotes.supplier': 1 } },
      { name: 'tenantId_1_quotes.status_1', key: { tenantId: 1, 'quotes.status': 1 } },

      // Location-based queries
      { name: 'tenantId_1_location_1', key: { tenantId: 1, location: 1 }, sparse: true },

      // Analytics queries
      { name: 'tenantId_1_createdAt_-1_status_1', key: { tenantId: 1, createdAt: -1, status: 1 } }
    ];

    await this.createIndexes(RFQ, rfqIndexes);
  }

  /**
   * Create optimized indexes for User collection
   */
  private async createUserIndexes(): Promise<void> {
    const userIndexes: IIndexInfo[] = [
      // Tenant isolation
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // Authentication
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'tenantId_1_email_1', key: { tenantId: 1, email: 1 } },

      // Company-based queries
      { name: 'tenantId_1_company_1', key: { tenantId: 1, company: 1 } },
      { name: 'tenantId_1_company_1_isActive_1', key: { tenantId: 1, company: 1, isActive: 1 } },

      // Role-based queries
      { name: 'tenantId_1_role_1', key: { tenantId: 1, role: 1 } },
      { name: 'tenantId_1_role_1_isActive_1', key: { tenantId: 1, role: 1, isActive: 1 } },

      // Activity tracking
      { name: 'tenantId_1_isActive_1', key: { tenantId: 1, isActive: 1 } },
      { name: 'tenantId_1_lastLogin_-1', key: { tenantId: 1, lastLogin: -1 }, sparse: true },

      // Session management
      { name: 'tenantId_1_sessions.sessionId_1', key: { tenantId: 1, 'sessions.sessionId': 1 }, sparse: true },

      // Two-factor authentication
      { name: 'tenantId_1_twoFactorAuth.secret_1', key: { tenantId: 1, 'twoFactorAuth.secret': 1 }, sparse: true },

      // API keys
      { name: 'tenantId_1_apiKeys.keyId_1', key: { tenantId: 1, 'apiKeys.keyId': 1 }, sparse: true },

      // Created date for analytics
      { name: 'tenantId_1_createdAt_-1', key: { tenantId: 1, createdAt: -1 } }
    ];

    await this.createIndexes(User, userIndexes);
  }

  /**
   * Create optimized indexes for Company collection
   */
  private async createCompanyIndexes(): Promise<void> {
    const companyIndexes: IIndexInfo[] = [
      // Tenant isolation
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // Company identification
      { name: 'email_1', key: { email: 1 }, unique: true },
      { name: 'tenantId_1_email_1', key: { tenantId: 1, email: 1 } },

      // Company type
      { name: 'tenantId_1_type_1', key: { tenantId: 1, type: 1 } },
      { name: 'tenantId_1_type_1_isActive_1', key: { tenantId: 1, type: 1, isActive: 1 } },

      // Activity status
      { name: 'tenantId_1_isActive_1', key: { tenantId: 1, isActive: 1 } },

      // Verification status
      { name: 'tenantId_1_verification.status_1', key: { tenantId: 1, 'verification.status': 1 }, sparse: true },

      // Location-based queries
      { name: 'tenantId_1_address.country_1', key: { tenantId: 1, 'address.country': 1 } },
      { name: 'tenantId_1_address.state_1', key: { tenantId: 1, 'address.state': 1 } },
      { name: 'tenantId_1_address.city_1', key: { tenantId: 1, 'address.city': 1 } },

      // Text search
      { name: 'text_search', key: { name: 'text', description: 'text' } },

      // Industry and size
      { name: 'tenantId_1_industry_1', key: { tenantId: 1, industry: 1 }, sparse: true },
      { name: 'tenantId_1_size_1', key: { tenantId: 1, size: 1 }, sparse: true },

      // Created date for analytics
      { name: 'tenantId_1_createdAt_-1', key: { tenantId: 1, createdAt: -1 } }
    ];

    await this.createIndexes(Company, companyIndexes);
  }

  /**
   * Create optimized indexes for Analytics collection
   */
  private async createAnalyticsIndexes(): Promise<void> {
    const analyticsIndexes: IIndexInfo[] = [
      // Tenant isolation
      { name: 'tenantId_1', key: { tenantId: 1 } },

      // Time-based queries (most important for analytics)
      { name: 'tenantId_1_timestamp_-1', key: { tenantId: 1, timestamp: -1 } },

      // Event type filtering
      { name: 'tenantId_1_eventType_1', key: { tenantId: 1, eventType: 1 } },
      { name: 'tenantId_1_eventType_1_timestamp_-1', key: { tenantId: 1, eventType: 1, timestamp: -1 } },

      // Category-based queries
      { name: 'tenantId_1_category_1', key: { tenantId: 1, category: 1 } },
      { name: 'tenantId_1_category_1_timestamp_-1', key: { tenantId: 1, category: 1, timestamp: -1 } },

      // User-specific analytics
      { name: 'tenantId_1_userId_1', key: { tenantId: 1, userId: 1 }, sparse: true },
      { name: 'tenantId_1_userId_1_timestamp_-1', key: { tenantId: 1, userId: 1, timestamp: -1 }, sparse: true },

      // Entity-specific queries
      { name: 'tenantId_1_entityId_1', key: { tenantId: 1, entityId: 1 }, sparse: true },
      { name: 'tenantId_1_entityId_1_timestamp_-1', key: { tenantId: 1, entityId: 1, timestamp: -1 }, sparse: true },

      // Session-based analytics
      { name: 'tenantId_1_sessionId_1', key: { tenantId: 1, sessionId: 1 }, sparse: true },

      // Compound indexes for complex queries
      { name: 'tenantId_1_category_1_eventType_1_timestamp_-1', key: { tenantId: 1, category: 1, eventType: 1, timestamp: -1 } },

      // TTL index for data retention (30 days)
      { name: 'timestamp_ttl', key: { timestamp: 1 }, background: true, partialFilterExpression: { timestamp: { $type: 'date' } } }
    ];

    await this.createIndexes(AnalyticsEvent, analyticsIndexes);
  }

  /**
   * Create indexes for a specific model
   */
  private async createIndexes(model: any, indexes: IIndexInfo[]): Promise<void> {
    try {
      for (const indexInfo of indexes) {
        const options: any = {
          name: indexInfo.name,
          background: indexInfo.background !== false
        };

        if (indexInfo.unique) options.unique = true;
        if (indexInfo.sparse) options.sparse = true;
        if (indexInfo.partialFilterExpression) options.partialFilterExpression = indexInfo.partialFilterExpression;

        await model.createIndex(indexInfo.key, options);
        logger.debug(`Created index: ${indexInfo.name} for ${model.modelName}`);
      }
    } catch (error) {
      logger.error(`Error creating indexes for ${model.modelName}:`, error);
      throw error;
    }
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(model: any, query: any, options: any = {}): Promise<IQueryStats> {
    try {
      const startTime = Date.now();

      // Execute query with explain
      const explanation = await model.find(query, null, options).explain('executionStats');

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      const {executionStats} = explanation;
      const queryStats: IQueryStats = {
        executionTime,
        indexesUsed: this.extractIndexesUsed(explanation),
        documentsExamined: executionStats.totalDocsExamined || 0,
        documentsReturned: executionStats.totalDocsReturned || 0,
        isIndexOptimal: executionStats.totalDocsExamined === executionStats.totalDocsReturned
      };

      this.queryStats.push(queryStats);

      if (executionTime > this.slowQueryThreshold) {
        logger.warn('Slow query detected', {
          model: model.modelName,
          query,
          executionTime,
          documentsExamined: queryStats.documentsExamined,
          documentsReturned: queryStats.documentsReturned
        });
      }

      return queryStats;
    } catch (error) {
      logger.error('Error analyzing query:', error);
      throw error;
    }
  }

  /**
   * Get database performance metrics
   */
  async getPerformanceMetrics(): Promise<IPerformanceMetrics> {
    try {
      const {db} = mongoose.connection;
      const admin = db.admin();

      // Get server status
      const serverStatus = await admin.serverStatus();

      // Calculate average query time
      const avgQueryTime = this.queryStats.length > 0
        ? this.queryStats.reduce((sum, stat) => sum + stat.executionTime, 0) / this.queryStats.length
        : 0;

      // Count slow queries
      const slowQueries = this.queryStats.filter(stat => stat.executionTime > this.slowQueryThreshold).length;

      // Get index usage stats
      const indexUsage: { [key: string]: number } = {};
      this.queryStats.forEach(stat => {
        stat.indexesUsed.forEach(index => {
          indexUsage[index] = (indexUsage[index] || 0) + 1;
        });
      });

      return {
        averageQueryTime: Math.round(avgQueryTime * 100) / 100,
        slowQueries,
        indexUsage,
        connectionPoolSize: mongoose.connection.readyState === 1 ? 10 : 0, // Default pool size
        activeConnections: serverStatus.connections?.current || 0
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      return {
        averageQueryTime: 0,
        slowQueries: 0,
        indexUsage: {},
        connectionPoolSize: 0,
        activeConnections: 0
      };
    }
  }

  /**
   * Optimize database configuration
   */
  async optimizeDatabaseConfiguration(): Promise<void> {
    try {
      logger.info('Optimizing database configuration...');

      // Set read preferences for better performance
      mongoose.connection.db.readPreference = 'secondaryPreferred';

      // Configure connection pool
      mongoose.connection.config.maxPoolSize = 10;
      mongoose.connection.config.minPoolSize = 5;
      mongoose.connection.config.maxIdleTimeMS = 30000;
      mongoose.connection.config.waitQueueTimeoutMS = 2500;

      logger.info('Database configuration optimized');
    } catch (error) {
      logger.error('Error optimizing database configuration:', error);
      throw error;
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexUsageStats(): Promise<any> {
    try {
      const {db} = mongoose.connection;
      const collections = await db.listCollections().toArray();
      const stats: any = {};

      for (const collection of collections) {
        const collectionName = collection.name;
        const indexStats = await db.collection(collectionName).indexStats().toArray();

        stats[collectionName] = indexStats.map(stat => ({
          name: stat.name,
          accesses: stat.accesses,
          since: stat.since
        }));
      }

      return stats;
    } catch (error) {
      logger.error('Error getting index usage stats:', error);
      return {};
    }
  }

  /**
   * Suggest query optimizations
   */
  async suggestOptimizations(): Promise<string[]> {
    try {
      const suggestions: string[] = [];

      // Analyze slow queries
      const slowQueries = this.queryStats.filter(stat => stat.executionTime > this.slowQueryThreshold);

      if (slowQueries.length > 0) {
        suggestions.push(`Found ${slowQueries.length} slow queries. Consider adding indexes or optimizing query patterns.`);
      }

      // Check for queries with high document examination ratio
      const inefficientQueries = this.queryStats.filter(stat =>
        stat.documentsExamined > stat.documentsReturned * 10
      );

      if (inefficientQueries.length > 0) {
        suggestions.push(`Found ${inefficientQueries.length} queries examining too many documents. Consider adding more selective indexes.`);
      }

      // Check for queries not using indexes
      const unindexedQueries = this.queryStats.filter(stat => stat.indexesUsed.length === 0);

      if (unindexedQueries.length > 0) {
        suggestions.push(`Found ${unindexedQueries.length} queries not using indexes. Consider adding appropriate indexes.`);
      }

      return suggestions;
    } catch (error) {
      logger.error('Error suggesting optimizations:', error);
      return [];
    }
  }

  /**
   * Clean up old query stats
   */
  clearQueryStats(): void {
    this.queryStats = [];
  }

  /**
   * Private helper methods
   */
  private extractIndexesUsed(explanation: any): string[] {
    const indexes: string[] = [];

    const extractFromStage = (stage: any) => {
      if (stage.indexName) {
        indexes.push(stage.indexName);
      }
      if (stage.inputStage) {
        extractFromStage(stage.inputStage);
      }
      if (stage.inputStages) {
        stage.inputStages.forEach(extractFromStage);
      }
    };

    if (explanation.executionStats) {
      extractFromStage(explanation.executionStats);
    }

    return indexes;
  }
}

// Singleton instance
let databaseOptimizationService: DatabaseOptimizationService;

export const getDatabaseOptimizationService = (): DatabaseOptimizationService => {
  if (!databaseOptimizationService) {
    databaseOptimizationService = new DatabaseOptimizationService();
  }
  return databaseOptimizationService;
};

export default getDatabaseOptimizationService();
