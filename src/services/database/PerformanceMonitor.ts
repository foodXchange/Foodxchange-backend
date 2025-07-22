import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/monitoring/metrics';

import { QueryOptimizer } from './QueryOptimizer';

const logger = new Logger('PerformanceMonitor');

export interface PerformanceMetrics {
  timestamp: Date;
  connectionPool: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    poolSize: number;
  };
  queries: {
    totalQueries: number;
    slowQueries: number;
    averageResponseTime: number;
    queryTypes: Record<string, number>;
  };
  collections: {
    name: string;
    documentCount: number;
    indexCount: number;
    totalSize: number;
    avgDocumentSize: number;
  }[];
  indexes: {
    collection: string;
    indexName: string;
    usage: number;
    lastUsed: Date;
  }[];
}

export interface DatabaseAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
  resolved: boolean;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private readonly metricsService: MetricsService;
  private readonly queryOptimizer: QueryOptimizer;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alerts: DatabaseAlert[] = [];
  private isMonitoring = false;
  private performanceHistory: PerformanceMetrics[] = [];
  private readonly maxHistorySize = 100;

  // Thresholds for alerting
  private readonly thresholds = {
    slowQueryMs: 100,
    connectionUtilization: 80, // percentage
    indexUsageMinOps: 10, // minimum operations per day
    documentCountGrowthRate: 50, // percentage increase per hour
    avgResponseTimeMs: 50
  };

  private constructor() {
    this.metricsService = new MetricsService();
    this.queryOptimizer = QueryOptimizer.getInstance();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startMonitoring(intervalMs: number = 60000): void {
    if (this.isMonitoring) {
      logger.warn('Performance monitoring is already running');
      return;
    }

    logger.info('Starting database performance monitoring', { intervalMs });
    this.isMonitoring = true;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
      } catch (error) {
        logger.error('Error during performance monitoring:', error);
      }
    }, intervalMs);
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.isMonitoring = false;
      logger.info('Performance monitoring stopped');
    }
  }

  public async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = new Date();

    try {
      const [connectionPool, queries, collections, indexes] = await Promise.all([
        this.getConnectionPoolMetrics(),
        this.getQueryMetrics(),
        this.getCollectionMetrics(),
        this.getIndexMetrics()
      ]);

      const metrics: PerformanceMetrics = {
        timestamp,
        connectionPool,
        queries,
        collections,
        indexes
      };

      // Store in history
      this.performanceHistory.push(metrics);
      if (this.performanceHistory.length > this.maxHistorySize) {
        this.performanceHistory.shift();
      }

      // Update Prometheus metrics
      this.updatePrometheusMetrics(metrics);

      return metrics;
    } catch (error) {
      logger.error('Failed to collect performance metrics:', error);
      throw error;
    }
  }

  private async getConnectionPoolMetrics(): Promise<PerformanceMetrics['connectionPool']> {
    const {connection} = mongoose;
    const {db} = connection;

    // Get connection pool stats
    const admin = db.admin();
    let serverStatus;

    try {
      serverStatus = await admin.command({ serverStatus: 1 });
    } catch (error) {
      logger.warn('Could not get server status:', error);
      serverStatus = { connections: { current: 0, available: 0 } };
    }

    const poolConfig = {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10'),
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE || '2')
    };

    return {
      totalConnections: serverStatus.connections?.current || 0,
      activeConnections: serverStatus.connections?.current || 0,
      idleConnections: serverStatus.connections?.available || 0,
      poolSize: poolConfig.maxPoolSize
    };
  }

  private async getQueryMetrics(): Promise<PerformanceMetrics['queries']> {
    const slowQueries = await this.queryOptimizer.getSlowQueries(10);

    // Get query statistics from profiler if available
    const queryStats = {
      totalQueries: 0,
      slowQueries: slowQueries.length,
      averageResponseTime: 0,
      queryTypes: {} as Record<string, number>
    };

    try {
      const {db} = mongoose.connection;
      const profileData = await db.collection('system.profile')
        .find({})
        .sort({ ts: -1 })
        .limit(100)
        .toArray();

      if (profileData.length > 0) {
        queryStats.totalQueries = profileData.length;
        queryStats.averageResponseTime = profileData.reduce((sum, op) => sum + op.durationMillis, 0) / profileData.length;

        // Count query types
        profileData.forEach(op => {
          const command = Object.keys(op.command)[0];
          queryStats.queryTypes[command] = (queryStats.queryTypes[command] || 0) + 1;
        });
      }
    } catch (error) {
      logger.debug('Profiler data not available:', error);
    }

    return queryStats;
  }

  private async getCollectionMetrics(): Promise<PerformanceMetrics['collections']> {
    const collections = ['users', 'companies', 'analyticsevents'];
    const metrics: PerformanceMetrics['collections'] = [];

    for (const collectionName of collections) {
      try {
        const stats = await this.queryOptimizer.getQueryStats(collectionName);
        metrics.push({
          name: collectionName,
          documentCount: stats.documentCount,
          indexCount: stats.indexCount,
          totalSize: stats.totalSize,
          avgDocumentSize: stats.avgObjSize
        });
      } catch (error) {
        logger.error(`Failed to get stats for collection ${collectionName}:`, error);
      }
    }

    return metrics;
  }

  private async getIndexMetrics(): Promise<PerformanceMetrics['indexes']> {
    const collections = ['users', 'companies', 'analyticsevents'];
    const metrics: PerformanceMetrics['indexes'] = [];

    for (const collectionName of collections) {
      try {
        const {db} = mongoose.connection;
        const coll = db.collection(collectionName);
        const indexStats = await coll.aggregate([{ $indexStats: {} }]).toArray();

        for (const stat of indexStats) {
          metrics.push({
            collection: collectionName,
            indexName: stat.name,
            usage: stat.accesses?.ops || 0,
            lastUsed: stat.accesses?.since || new Date(0)
          });
        }
      } catch (error) {
        logger.error(`Failed to get index stats for ${collectionName}:`, error);
      }
    }

    return metrics;
  }

  private updatePrometheusMetrics(metrics: PerformanceMetrics): void {
    // Connection pool metrics
    this.metricsService.setGauge('db_connections_total', metrics.connectionPool.totalConnections);
    this.metricsService.setGauge('db_connections_active', metrics.connectionPool.activeConnections);
    this.metricsService.setGauge('db_connections_idle', metrics.connectionPool.idleConnections);
    this.metricsService.setGauge('db_pool_size', metrics.connectionPool.poolSize);

    // Query metrics
    this.metricsService.setGauge('db_slow_queries_total', metrics.queries.slowQueries);
    this.metricsService.setGauge('db_avg_response_time_ms', metrics.queries.averageResponseTime);

    // Collection metrics
    for (const collection of metrics.collections) {
      this.metricsService.setGauge('db_collection_documents', collection.documentCount, { collection: collection.name });
      this.metricsService.setGauge('db_collection_indexes', collection.indexCount, { collection: collection.name });
      this.metricsService.setGauge('db_collection_size_bytes', collection.totalSize, { collection: collection.name });
    }

    // Index usage metrics
    for (const index of metrics.indexes) {
      this.metricsService.setGauge('db_index_usage_ops', index.usage, {
        collection: index.collection,
        index: index.indexName
      });
    }
  }

  private async checkAlerts(): Promise<void> {
    const latestMetrics = this.performanceHistory[this.performanceHistory.length - 1];
    if (!latestMetrics) return;

    // Check connection pool utilization
    const connectionUtilization = (latestMetrics.connectionPool.activeConnections / latestMetrics.connectionPool.poolSize) * 100;
    if (connectionUtilization > this.thresholds.connectionUtilization) {
      await this.createAlert({
        type: 'warning',
        message: `High connection pool utilization: ${connectionUtilization.toFixed(1)}%`,
        metadata: { utilization: connectionUtilization, threshold: this.thresholds.connectionUtilization }
      });
    }

    // Check slow queries
    if (latestMetrics.queries.slowQueries > 0) {
      await this.createAlert({
        type: 'warning',
        message: `${latestMetrics.queries.slowQueries} slow queries detected`,
        metadata: { slowQueries: latestMetrics.queries.slowQueries, threshold: this.thresholds.slowQueryMs }
      });
    }

    // Check average response time
    if (latestMetrics.queries.averageResponseTime > this.thresholds.avgResponseTimeMs) {
      await this.createAlert({
        type: 'warning',
        message: `High average response time: ${latestMetrics.queries.averageResponseTime.toFixed(1)}ms`,
        metadata: { responseTime: latestMetrics.queries.averageResponseTime, threshold: this.thresholds.avgResponseTimeMs }
      });
    }

    // Check unused indexes
    const unusedIndexes = latestMetrics.indexes.filter(idx =>
      idx.usage === 0 && idx.indexName !== '_id_'
    );
    if (unusedIndexes.length > 0) {
      await this.createAlert({
        type: 'info',
        message: `${unusedIndexes.length} unused indexes detected`,
        metadata: { unusedIndexes: unusedIndexes.map(idx => `${idx.collection}.${idx.indexName}`) }
      });
    }

    // Check document growth
    if (this.performanceHistory.length >= 2) {
      const previousMetrics = this.performanceHistory[this.performanceHistory.length - 2];
      const timeDiff = latestMetrics.timestamp.getTime() - previousMetrics.timestamp.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      for (const collection of latestMetrics.collections) {
        const prevCollection = previousMetrics.collections.find(c => c.name === collection.name);
        if (prevCollection && hoursDiff > 0) {
          const growth = ((collection.documentCount - prevCollection.documentCount) / prevCollection.documentCount) * 100;
          const growthRate = growth / hoursDiff;

          if (growthRate > this.thresholds.documentCountGrowthRate) {
            await this.createAlert({
              type: 'warning',
              message: `High document growth rate in ${collection.name}: ${growthRate.toFixed(1)}% per hour`,
              metadata: { collection: collection.name, growthRate, threshold: this.thresholds.documentCountGrowthRate }
            });
          }
        }
      }
    }
  }

  public async createAlert(alert: Omit<DatabaseAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const newAlert: DatabaseAlert = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    this.alerts.push(newAlert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    logger.warn('Database alert created', newAlert);

    // Update metrics
    this.metricsService.incrementCounter('db_alerts_total', { type: alert.type });
  }

  public getPerformanceHistory(limit?: number): PerformanceMetrics[] {
    return limit ? this.performanceHistory.slice(-limit) : this.performanceHistory;
  }

  public getAlerts(resolved?: boolean): DatabaseAlert[] {
    return resolved !== undefined
      ? this.alerts.filter(alert => alert.resolved === resolved)
      : this.alerts;
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      logger.info('Database alert resolved', { alertId });
      return true;
    }
    return false;
  }

  public async generatePerformanceReport(): Promise<{
    summary: {
      totalCollections: number;
      totalDocuments: number;
      totalIndexes: number;
      averageResponseTime: number;
      slowQueries: number;
    };
    recommendations: string[];
    alerts: DatabaseAlert[];
  }> {
    const latestMetrics = this.performanceHistory[this.performanceHistory.length - 1];
    if (!latestMetrics) {
      throw new Error('No performance metrics available');
    }

    const summary = {
      totalCollections: latestMetrics.collections.length,
      totalDocuments: latestMetrics.collections.reduce((sum, col) => sum + col.documentCount, 0),
      totalIndexes: latestMetrics.collections.reduce((sum, col) => sum + col.indexCount, 0),
      averageResponseTime: latestMetrics.queries.averageResponseTime,
      slowQueries: latestMetrics.queries.slowQueries
    };

    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (summary.averageResponseTime > this.thresholds.avgResponseTimeMs) {
      recommendations.push('Consider optimizing slow queries and adding appropriate indexes');
    }

    const unusedIndexes = latestMetrics.indexes.filter(idx => idx.usage === 0 && idx.indexName !== '_id_');
    if (unusedIndexes.length > 0) {
      recommendations.push(`Consider removing ${unusedIndexes.length} unused indexes to improve write performance`);
    }

    const connectionUtilization = (latestMetrics.connectionPool.activeConnections / latestMetrics.connectionPool.poolSize) * 100;
    if (connectionUtilization > this.thresholds.connectionUtilization) {
      recommendations.push('Consider increasing connection pool size or optimizing connection usage');
    }

    return {
      summary,
      recommendations,
      alerts: this.getAlerts(false) // Only unresolved alerts
    };
  }

  public clearHistory(): void {
    this.performanceHistory = [];
    logger.info('Performance history cleared');
  }

  public clearAlerts(): void {
    this.alerts = [];
    logger.info('Database alerts cleared');
  }
}
