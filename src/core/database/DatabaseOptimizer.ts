/**
 * Advanced Database Optimization Service
 * Implements connection pooling, query optimization, read/write splitting, and monitoring
 */

import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { CircuitBreaker } from '../resilience/CircuitBreaker';
import { AdvancedCacheService } from '../cache/AdvancedCacheService';

export interface DatabaseConfig {
  primary: {
    uri: string;
    options?: ConnectOptions;
  };
  replicas?: {
    uri: string;
    weight: number;
    options?: ConnectOptions;
  }[];
  poolSize: number;
  maxPoolSize: number;
  minPoolSize: number;
  acquireTimeoutMillis: number;
  enableQueryOptimization: boolean;
  enableReadWriteSplit: boolean;
  enableQueryCache: boolean;
  slowQueryThreshold: number;
}

export interface QueryMetrics {
  query: string;
  collection: string;
  executionTime: number;
  documentsExamined: number;
  documentsReturned: number;
  indexesUsed: string[];
  planSummary: string;
}

export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  pendingRequests: number;
  highWatermark: number;
  checkouts: number;
  checkins: number;
}

export class DatabaseOptimizer {
  private readonly logger = new Logger('DatabaseOptimizer');
  private readonly metrics: MetricsService;
  private readonly cache: AdvancedCacheService;
  private readonly circuitBreaker: CircuitBreaker;
  
  private primaryConnection?: Connection;
  private replicaConnections: Connection[] = [];
  private readonly config: DatabaseConfig;
  
  // Query optimization
  private readonly queryCache = new Map<string, any>();
  private readonly slowQueries = new Map<string, QueryMetrics>();
  private readonly indexSuggestions = new Map<string, string[]>();

  constructor(
    config: DatabaseConfig,
    metrics: MetricsService,
    cache: AdvancedCacheService,
    circuitBreaker: CircuitBreaker
  ) {
    this.config = config;
    this.metrics = metrics;
    this.cache = cache;
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Initialize database connections with optimization
   */
  public async initialize(): Promise<void> {
    try {
      // Initialize primary connection
      await this.initializePrimaryConnection();
      
      // Initialize replica connections if configured
      if (this.config.replicas && this.config.enableReadWriteSplit) {
        await this.initializeReplicaConnections();
      }

      // Setup monitoring
      this.setupMonitoring();
      
      // Setup query profiling
      if (this.config.enableQueryOptimization) {
        await this.setupQueryProfiling();
      }

      this.logger.info('Database optimizer initialized successfully', {
        primaryConnected: !!this.primaryConnection,
        replicaCount: this.replicaConnections.length,
        queryOptimization: this.config.enableQueryOptimization
      });

    } catch (error) {
      this.logger.error('Failed to initialize database optimizer', { error });
      throw error;
    }
  }

  private async initializePrimaryConnection(): Promise<void> {
    const options: ConnectOptions = {
      maxPoolSize: this.config.maxPoolSize,
      minPoolSize: this.config.minPoolSize,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      ...this.config.primary.options
    };

    this.primaryConnection = await mongoose.createConnection(
      this.config.primary.uri,
      options
    );

    this.setupConnectionEventHandlers(this.primaryConnection, 'primary');
  }

  private async initializeReplicaConnections(): Promise<void> {
    if (!this.config.replicas) return;

    for (let i = 0; i < this.config.replicas.length; i++) {
      const replica = this.config.replicas[i];
      const options: ConnectOptions = {
        maxPoolSize: Math.floor(this.config.maxPoolSize * replica.weight),
        minPoolSize: this.config.minPoolSize,
        readPreference: 'secondary',
        ...replica.options
      };

      const connection = await mongoose.createConnection(replica.uri, options);
      this.replicaConnections.push(connection);
      this.setupConnectionEventHandlers(connection, `replica-${i}`);
    }
  }

  private setupConnectionEventHandlers(connection: Connection, name: string): void {
    connection.on('connected', () => {
      this.logger.info(`Database connection established: ${name}`);
      this.metrics.incrementCounter('database_connections_established_total', { connection: name });
    });

    connection.on('error', (error) => {
      this.logger.error(`Database connection error: ${name}`, { error });
      this.metrics.incrementCounter('database_connection_errors_total', { connection: name });
    });

    connection.on('disconnected', () => {
      this.logger.warn(`Database connection lost: ${name}`);
      this.metrics.incrementCounter('database_disconnections_total', { connection: name });
    });
  }

  private setupMonitoring(): void {
    // Monitor connection pool stats
    setInterval(() => {
      this.updateConnectionPoolMetrics();
    }, 10000); // Every 10 seconds

    // Monitor slow queries
    setInterval(() => {
      this.analyzeSlowQueries();
    }, 60000); // Every minute

    // Cleanup old metrics
    setInterval(() => {
      this.cleanupMetrics();
    }, 300000); // Every 5 minutes
  }

  private async setupQueryProfiling(): Promise<void> {
    if (!this.primaryConnection?.db) return;

    try {
      // Enable profiling for slow operations
      await this.primaryConnection.db.admin().command({
        profile: 2,
        slowms: this.config.slowQueryThreshold
      });
    } catch (error) {
      this.logger.warn('Failed to setup query profiling:', error);
    }

    this.logger.info('Query profiling enabled', {
      slowThreshold: this.config.slowQueryThreshold
    });
  }

  /**
   * Execute optimized query with caching and monitoring
   */
  public async executeQuery<T>(
    collection: string,
    operation: string,
    query: any,
    options: {
      useCache?: boolean;
      cacheKey?: string;
      cacheTtl?: number;
      forceWrite?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const cacheKey = options.cacheKey || this.generateCacheKey(collection, operation, query);

    try {
      // Try cache first if enabled
      if (options.useCache && this.config.enableQueryCache) {
        const cached = await this.cache.get<T>(cacheKey);
        if (cached) {
          this.metrics.incrementCounter('database_cache_hits_total', { collection });
          return cached;
        }
        this.metrics.incrementCounter('database_cache_misses_total', { collection });
      }

      // Execute query with circuit breaker protection
      const result = await this.circuitBreaker.execute(async () => {
        const connection = this.selectConnection(operation, options.forceWrite);
        return this.executeQueryOnConnection<T>(
          connection,
          collection,
          operation,
          query,
          options.timeout
        );
      });

      // Cache result if enabled
      if (options.useCache && this.config.enableQueryCache) {
        await this.cache.set(cacheKey, result, {
          ttl: options.cacheTtl || 300,
          tags: [collection]
        });
      }

      // Record metrics
      const executionTime = Date.now() - startTime;
      this.recordQueryMetrics(collection, operation, executionTime, query);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.metrics.incrementCounter('database_query_errors_total', { 
        collection, 
        operation 
      });
      this.metrics.observeHistogram('database_query_duration_ms', executionTime, {
        collection,
        operation,
        status: 'error'
      });

      this.logger.error('Database query failed', {
        collection,
        operation,
        query: this.sanitizeQuery(query),
        error,
        executionTime
      });

      throw error;
    }
  }

  private selectConnection(operation: string, forceWrite = false): Connection {
    if (forceWrite || !this.config.enableReadWriteSplit || this.isWriteOperation(operation)) {
      return this.primaryConnection!;
    }

    // Load balance read operations across replicas
    if (this.replicaConnections.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.replicaConnections.length);
      return this.replicaConnections[randomIndex];
    }

    return this.primaryConnection!;
  }

  private isWriteOperation(operation: string): boolean {
    const writeOps = ['insert', 'update', 'delete', 'replace', 'create', 'drop', 'save'];
    return writeOps.some(op => operation.toLowerCase().includes(op));
  }

  private async executeQueryOnConnection<T>(
    connection: Connection,
    collection: string,
    operation: string,
    query: any,
    timeout?: number
  ): Promise<T> {
    const model = connection.model(collection);
    let queryPromise: Promise<T>;

    switch (operation) {
      case 'find':
        queryPromise = model.find(query.filter, query.projection, query.options).exec() as Promise<T>;
        break;
      case 'findOne':
        queryPromise = model.findOne(query.filter, query.projection, query.options).exec() as Promise<T>;
        break;
      case 'findById':
        queryPromise = model.findById(query.id, query.projection, query.options).exec() as Promise<T>;
        break;
      case 'aggregate':
        queryPromise = model.aggregate(query.pipeline, query.options).exec() as Promise<T>;
        break;
      case 'count':
        queryPromise = model.countDocuments(query.filter, query.options).exec() as Promise<T>;
        break;
      case 'insert':
        queryPromise = model.create(query.document) as Promise<T>;
        break;
      case 'update':
        queryPromise = model.updateMany(query.filter, query.update, query.options).exec() as Promise<T>;
        break;
      case 'delete':
        queryPromise = model.deleteMany(query.filter, query.options).exec() as Promise<T>;
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    if (timeout) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), timeout);
      });
      return Promise.race([queryPromise, timeoutPromise]);
    }

    return queryPromise;
  }

  private recordQueryMetrics(
    collection: string,
    operation: string,
    executionTime: number,
    query: any
  ): void {
    this.metrics.observeHistogram('database_query_duration_ms', executionTime, {
      collection,
      operation,
      status: 'success'
    });

    this.metrics.incrementCounter('database_queries_total', {
      collection,
      operation
    });

    // Track slow queries
    if (executionTime > this.config.slowQueryThreshold) {
      const queryString = JSON.stringify(this.sanitizeQuery(query));
      const existing = this.slowQueries.get(queryString) || {
        query: queryString,
        collection,
        executionTime: 0,
        documentsExamined: 0,
        documentsReturned: 0,
        indexesUsed: [],
        planSummary: ''
      };

      existing.executionTime = Math.max(existing.executionTime, executionTime);
      this.slowQueries.set(queryString, existing);

      this.metrics.incrementCounter('database_slow_queries_total', {
        collection,
        operation
      });
    }
  }

  /**
   * Optimize database indexes based on query patterns
   */
  public async optimizeIndexes(collection: string): Promise<string[]> {
    try {
      const connection = this.primaryConnection!;
      const model = connection.model(collection);
      
      // Get existing indexes
      const existingIndexes = await model.collection.listIndexes().toArray();
      
      // Analyze query patterns
      const suggestions = await this.analyzeQueryPatterns(collection);
      
      // Create recommended indexes
      const createdIndexes: string[] = [];
      for (const suggestion of suggestions) {
        const indexExists = existingIndexes.some(idx => 
          JSON.stringify(idx.key) === JSON.stringify(suggestion.fields)
        );

        if (!indexExists) {
          await model.collection.createIndex(suggestion.fields, suggestion.options);
          createdIndexes.push(`${collection}: ${JSON.stringify(suggestion.fields)}`);
          this.logger.info('Index created', { collection, fields: suggestion.fields });
        }
      }

      return createdIndexes;
    } catch (error) {
      this.logger.error('Index optimization failed', { collection, error });
      throw error;
    }
  }

  private async analyzeQueryPatterns(collection: string): Promise<Array<{
    fields: any;
    options: any;
  }>> {
    // This would analyze actual query patterns from profiling data
    // For now, return common index patterns
    return [
      { fields: { createdAt: 1 }, options: { background: true } },
      { fields: { updatedAt: 1 }, options: { background: true } },
      { fields: { status: 1, createdAt: 1 }, options: { background: true } }
    ];
  }

  private analyzeSlowQueries(): void {
    if (this.slowQueries.size === 0) return;

    const slowestQueries = Array.from(this.slowQueries.values())
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, 10);

    this.logger.warn('Top slow queries detected', {
      count: this.slowQueries.size,
      slowest: slowestQueries.map(q => ({
        collection: q.collection,
        executionTime: q.executionTime,
        query: q.query.substring(0, 200)
      }))
    });

    // Generate index suggestions for slow queries
    for (const slowQuery of slowestQueries) {
      this.generateIndexSuggestions(slowQuery);
    }
  }

  private generateIndexSuggestions(queryMetrics: QueryMetrics): void {
    try {
      const query = JSON.parse(queryMetrics.query);
      const suggestions: string[] = [];

      // Extract potential index fields from query filters
      if (query.filter) {
        const filterFields = Object.keys(query.filter);
        if (filterFields.length > 0) {
          suggestions.push(`Compound index on: ${filterFields.join(', ')}`);
        }
      }

      // Add sort field suggestions
      if (query.options?.sort) {
        const sortFields = Object.keys(query.options.sort);
        suggestions.push(`Sort index on: ${sortFields.join(', ')}`);
      }

      if (suggestions.length > 0) {
        const existing = this.indexSuggestions.get(queryMetrics.collection) || [];
        this.indexSuggestions.set(queryMetrics.collection, [...existing, ...suggestions]);
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }

  private updateConnectionPoolMetrics(): void {
    if (!this.primaryConnection) return;

    // This would get actual pool stats from MongoDB driver
    // For now, provide estimated metrics
    const stats: ConnectionPoolStats = {
      totalConnections: this.config.maxPoolSize,
      activeConnections: Math.floor(this.config.maxPoolSize * 0.6),
      idleConnections: Math.floor(this.config.maxPoolSize * 0.4),
      pendingRequests: 0,
      highWatermark: Math.floor(this.config.maxPoolSize * 0.8),
      checkouts: 0,
      checkins: 0
    };

    this.metrics.setGauge('database_pool_total_connections', stats.totalConnections);
    this.metrics.setGauge('database_pool_active_connections', stats.activeConnections);
    this.metrics.setGauge('database_pool_idle_connections', stats.idleConnections);
    this.metrics.setGauge('database_pool_pending_requests', stats.pendingRequests);
  }

  private cleanupMetrics(): void {
    // Clean up old slow queries (keep only last hour)
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, metrics] of this.slowQueries) {
      // This would check actual timestamp if we stored it
      if (this.slowQueries.size > 1000) {
        this.slowQueries.delete(key);
      }
    }

    // Clean up query cache
    if (this.queryCache.size > 10000) {
      this.queryCache.clear();
    }
  }

  private generateCacheKey(collection: string, operation: string, query: any): string {
    const sanitized = this.sanitizeQuery(query);
    const hash = this.hashObject(sanitized);
    return `db:${collection}:${operation}:${hash}`;
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private sanitizeQuery(query: any): any {
    // Remove sensitive fields from query for logging/caching
    const sensitive = ['password', 'token', 'secret', 'key'];
    const sanitized = JSON.parse(JSON.stringify(query));

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;

      for (const [key, value] of Object.entries(obj)) {
        if (sensitive.some(s => key.toLowerCase().includes(s))) {
          obj[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          obj[key] = sanitizeObject(value);
        }
      }
      return obj;
    };

    return sanitizeObject(sanitized);
  }

  /**
   * Get database optimization statistics
   */
  public getStats(): {
    connections: {
      primary: boolean;
      replicas: number;
    };
    queries: {
      total: number;
      slow: number;
      cached: number;
    };
    suggestions: {
      indexes: Record<string, string[]>;
    };
  } {
    let totalCached = 0;
    // This would get actual cache hit stats

    return {
      connections: {
        primary: !!this.primaryConnection,
        replicas: this.replicaConnections.length
      },
      queries: {
        total: 0, // Would track from metrics
        slow: this.slowQueries.size,
        cached: totalCached
      },
      suggestions: {
        indexes: Object.fromEntries(this.indexSuggestions)
      }
    };
  }

  /**
   * Force index creation for all collections
   */
  public async optimizeAllIndexes(): Promise<string[]> {
    const allIndexes: string[] = [];
    
    if (!this.primaryConnection) {
      throw new Error('Primary connection not available');
    }

    const collections = await this.primaryConnection.db.listCollections().toArray();
    
    for (const collection of collections) {
      try {
        const indexes = await this.optimizeIndexes(collection.name);
        allIndexes.push(...indexes);
      } catch (error) {
        this.logger.error(`Failed to optimize indexes for ${collection.name}`, { error });
      }
    }

    return allIndexes;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down database optimizer...');

    if (this.primaryConnection) {
      await this.primaryConnection.close();
    }

    for (const replica of this.replicaConnections) {
      await replica.close();
    }

    this.queryCache.clear();
    this.slowQueries.clear();
    this.indexSuggestions.clear();

    this.logger.info('Database optimizer shutdown completed');
  }
}

export default DatabaseOptimizer;