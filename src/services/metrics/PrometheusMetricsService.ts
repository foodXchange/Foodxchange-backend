import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../core/logging/logger';

export class PrometheusMetricsService {
  private static instance: PrometheusMetricsService;
  private logger: Logger;
  
  // HTTP Metrics
  private httpRequestsTotal: Counter<string>;
  private httpRequestDuration: Histogram<string>;
  private httpRequestSizeBytes: Histogram<string>;
  private httpResponseSizeBytes: Histogram<string>;
  
  // Database Metrics
  private databaseConnectionsActive: Gauge<string>;
  private databaseQueryDuration: Histogram<string>;
  private databaseOperationsTotal: Counter<string>;
  
  // Business Metrics
  private ordersTotal: Counter<string>;
  private usersTotal: Counter<string>;
  private rfqsTotal: Counter<string>;
  private agentOperationsTotal: Counter<string>;
  
  // System Metrics
  private memoryUsage: Gauge<string>;
  private cpuUsage: Gauge<string>;
  private activeWebsocketConnections: Gauge<string>;
  
  // Cache Metrics
  private cacheOperationsTotal: Counter<string>;
  private cacheHitRate: Gauge<string>;
  
  // AI Service Metrics
  private aiServiceCallsTotal: Counter<string>;
  private aiServiceDuration: Histogram<string>;

  constructor() {
    this.logger = new Logger('PrometheusMetricsService');
    
    // Enable default metrics collection
    collectDefaultMetrics({
      register,
      prefix: 'foodxchange_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
    });
    
    this.initializeMetrics();
  }

  static getInstance(): PrometheusMetricsService {
    if (!PrometheusMetricsService.instance) {
      PrometheusMetricsService.instance = new PrometheusMetricsService();
    }
    return PrometheusMetricsService.instance;
  }

  private initializeMetrics(): void {
    // HTTP Metrics
    this.httpRequestsTotal = new Counter({
      name: 'foodxchange_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'user_role'],
      registers: [register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'foodxchange_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10],
      registers: [register],
    });

    this.httpRequestSizeBytes = new Histogram({
      name: 'foodxchange_http_request_size_bytes',
      help: 'Size of HTTP requests in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [register],
    });

    this.httpResponseSizeBytes = new Histogram({
      name: 'foodxchange_http_response_size_bytes',
      help: 'Size of HTTP responses in bytes',
      labelNames: ['method', 'route'],
      buckets: [100, 1000, 10000, 100000, 1000000],
      registers: [register],
    });

    // Database Metrics
    this.databaseConnectionsActive = new Gauge({
      name: 'foodxchange_database_connections_active',
      help: 'Number of active database connections',
      registers: [register],
    });

    this.databaseQueryDuration = new Histogram({
      name: 'foodxchange_database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'collection'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
      registers: [register],
    });

    this.databaseOperationsTotal = new Counter({
      name: 'foodxchange_database_operations_total',
      help: 'Total number of database operations',
      labelNames: ['operation', 'collection', 'status'],
      registers: [register],
    });

    // Business Metrics
    this.ordersTotal = new Counter({
      name: 'foodxchange_orders_total',
      help: 'Total number of orders',
      labelNames: ['status', 'user_role'],
      registers: [register],
    });

    this.usersTotal = new Counter({
      name: 'foodxchange_users_total',
      help: 'Total number of users',
      labelNames: ['role', 'status'],
      registers: [register],
    });

    this.rfqsTotal = new Counter({
      name: 'foodxchange_rfqs_total',
      help: 'Total number of RFQs',
      labelNames: ['status', 'category'],
      registers: [register],
    });

    this.agentOperationsTotal = new Counter({
      name: 'foodxchange_agent_operations_total',
      help: 'Total number of agent operations',
      labelNames: ['operation', 'status'],
      registers: [register],
    });

    // System Metrics
    this.memoryUsage = new Gauge({
      name: 'foodxchange_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [register],
    });

    this.cpuUsage = new Gauge({
      name: 'foodxchange_cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [register],
    });

    this.activeWebsocketConnections = new Gauge({
      name: 'foodxchange_websocket_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [register],
    });

    // Cache Metrics
    this.cacheOperationsTotal = new Counter({
      name: 'foodxchange_cache_operations_total',
      help: 'Total number of cache operations',
      labelNames: ['operation', 'cache_type', 'status'],
      registers: [register],
    });

    this.cacheHitRate = new Gauge({
      name: 'foodxchange_cache_hit_rate',
      help: 'Cache hit rate percentage',
      labelNames: ['cache_type'],
      registers: [register],
    });

    // AI Service Metrics
    this.aiServiceCallsTotal = new Counter({
      name: 'foodxchange_ai_service_calls_total',
      help: 'Total number of AI service calls',
      labelNames: ['service', 'operation', 'status'],
      registers: [register],
    });

    this.aiServiceDuration = new Histogram({
      name: 'foodxchange_ai_service_duration_seconds',
      help: 'Duration of AI service calls in seconds',
      labelNames: ['service', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [register],
    });

    this.logger.info('Prometheus metrics initialized successfully');
  }

  // HTTP Metrics Methods
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number, userRole?: string): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode.toString(), user_role: userRole || 'unknown' });
    this.httpRequestDuration.observe({ method, route, status_code: statusCode.toString() }, duration);
  }

  recordHttpRequestSize(method: string, route: string, size: number): void {
    this.httpRequestSizeBytes.observe({ method, route }, size);
  }

  recordHttpResponseSize(method: string, route: string, size: number): void {
    this.httpResponseSizeBytes.observe({ method, route }, size);
  }

  // Database Metrics Methods
  setDatabaseConnections(count: number): void {
    this.databaseConnectionsActive.set(count);
  }

  recordDatabaseQuery(operation: string, collection: string, duration: number, success: boolean): void {
    this.databaseQueryDuration.observe({ operation, collection }, duration);
    this.databaseOperationsTotal.inc({ operation, collection, status: success ? 'success' : 'error' });
  }

  // Business Metrics Methods
  incrementOrders(status: string, userRole: string): void {
    this.ordersTotal.inc({ status, user_role: userRole });
  }

  incrementUsers(role: string, status: string): void {
    this.usersTotal.inc({ role, status });
  }

  incrementRFQs(status: string, category: string): void {
    this.rfqsTotal.inc({ status, category });
  }

  incrementAgentOperations(operation: string, status: string): void {
    this.agentOperationsTotal.inc({ operation, status });
  }

  // System Metrics Methods
  setMemoryUsage(type: string, bytes: number): void {
    this.memoryUsage.set({ type }, bytes);
  }

  setCpuUsage(percent: number): void {
    this.cpuUsage.set(percent);
  }

  setActiveWebsocketConnections(count: number): void {
    this.activeWebsocketConnections.set(count);
  }

  // Cache Metrics Methods
  recordCacheOperation(operation: string, cacheType: string, success: boolean): void {
    this.cacheOperationsTotal.inc({ operation, cache_type: cacheType, status: success ? 'hit' : 'miss' });
  }

  setCacheHitRate(cacheType: string, rate: number): void {
    this.cacheHitRate.set({ cache_type: cacheType }, rate);
  }

  // AI Service Metrics Methods
  recordAiServiceCall(service: string, operation: string, duration: number, success: boolean): void {
    this.aiServiceCallsTotal.inc({ service, operation, status: success ? 'success' : 'error' });
    this.aiServiceDuration.observe({ service, operation }, duration);
  }

  // Middleware for automatic HTTP metrics collection
  getHttpMetricsMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const startTime = Date.now();
      
      // Record request size
      const requestSize = req.headers['content-length'] 
        ? parseInt(req.headers['content-length'], 10) 
        : 0;
      
      if (requestSize > 0) {
        this.recordHttpRequestSize(req.method, req.route?.path || req.path, requestSize);
      }

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any) {
        const duration = (Date.now() - startTime) / 1000;
        const userRole = req.user?.role || 'anonymous';
        
        // Record HTTP request metrics
        PrometheusmetricsService.recordHttpRequest(
          req.method,
          req.route?.path || req.path,
          res.statusCode,
          duration,
          userRole
        );

        // Record response size
        if (chunk) {
          const responseSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
          PrometheusmetricsService.recordHttpResponseSize(
            req.method,
            req.route?.path || req.path,
            responseSize
          );
        }

        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  // System metrics collection
  startSystemMetricsCollection(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.setMemoryUsage('rss', memUsage.rss);
      this.setMemoryUsage('heapUsed', memUsage.heapUsed);
      this.setMemoryUsage('heapTotal', memUsage.heapTotal);
      this.setMemoryUsage('external', memUsage.external);

      // CPU usage would require additional libraries like pidusage
      // For now, we'll use a simple approximation
      const cpuUsage = process.cpuUsage();
      this.setCpuUsage((cpuUsage.user + cpuUsage.system) / 1000000); // Convert to percentage approximation
    }, 10000); // Every 10 seconds
  }

  // Get metrics for /metrics endpoint
  getMetrics(): Promise<string> {
    return register.metrics();
  }

  // Reset all metrics (useful for testing)
  resetMetrics(): void {
    register.clear();
    this.initializeMetrics();
  }
}

// Export singleton instance
export const prometheusMetrics = PrometheusmetricsService;