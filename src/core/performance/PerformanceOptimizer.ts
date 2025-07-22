/**
 * Advanced Performance Optimization Service
 * Implements response compression, request batching, resource pooling,
 * CDN integration, and performance monitoring
 */

import zlib from 'zlib';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { AdvancedCacheService } from '../cache/AdvancedCacheService';
import { TracingService } from '../observability/TracingService';

export interface PerformanceConfig {
  compression: {
    enabled: boolean;
    threshold: number; // bytes
    algorithms: ('gzip' | 'deflate' | 'brotli')[];
    level: number; // 1-9
    chunkSize: number;
  };
  batching: {
    enabled: boolean;
    maxBatchSize: number;
    batchTimeoutMs: number;
    maxWaitTimeMs: number;
  };
  resourcePooling: {
    enabled: boolean;
    connectionPoolSize: number;
    maxIdleTimeMs: number;
    acquireTimeoutMs: number;
  };
  cdn: {
    enabled: boolean;
    baseUrl: string;
    cacheBustingEnabled: boolean;
    staticFileExtensions: string[];
  };
  monitoring: {
    enabled: boolean;
    slowRequestThreshold: number; // ms
    memoryThreshold: number; // MB
    cpuThreshold: number; // percentage
  };
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughput: number; // requests per second
  errorRate: number;
  compressionRatio: number;
  cacheHitRate: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface BatchRequest {
  id: string;
  operation: string;
  data: any;
  timestamp: Date;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

export interface ResourcePool<T> {
  available: T[];
  inUse: Set<T>;
  maxSize: number;
  minSize: number;
  factory: () => Promise<T>;
  destroyer: (resource: T) => Promise<void>;
  validator: (resource: T) => boolean;
}

export class PerformanceOptimizer {
  private readonly logger = new Logger('PerformanceOptimizer');
  private readonly metrics: MetricsService;
  private readonly cache: AdvancedCacheService;
  private readonly tracing: TracingService;
  private readonly config: PerformanceConfig;

  // Batching infrastructure
  private readonly pendingBatches = new Map<string, BatchRequest[]>();
  private readonly batchTimers = new Map<string, NodeJS.Timeout>();

  // Resource pools
  private readonly resourcePools = new Map<string, ResourcePool<any>>();

  // Performance monitoring
  private readonly responseTimeHistory: number[] = [];
  private readonly requestStartTimes = new Map<string, number>();
  private compressionStats = { originalBytes: 0, compressedBytes: 0 };

  constructor(
    config: PerformanceConfig,
    metrics: MetricsService,
    cache: AdvancedCacheService,
    tracing: TracingService
  ) {
    this.config = config;
    this.metrics = metrics;
    this.cache = cache;
    this.tracing = tracing;

    this.initialize();
  }

  private initialize(): void {
    // Setup monitoring intervals
    if (this.config.monitoring.enabled) {
      setInterval(() => {
        this.updatePerformanceMetrics();
        this.checkPerformanceThresholds();
      }, 10000); // Every 10 seconds

      setInterval(() => {
        this.cleanupOldMetrics();
      }, 60000); // Every minute
    }

    this.logger.info('Performance optimizer initialized', {
      compression: this.config.compression.enabled,
      batching: this.config.batching.enabled,
      cdn: this.config.cdn.enabled
    });
  }

  /**
   * Compression middleware
   */
  public compressionMiddleware() {
    if (!this.config.compression.enabled) {
      return (req: Request, res: Response, next: NextFunction) => next();
    }

    return async (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const startTime = Date.now();

      res.send = function(this: Response, body: any) {
        return performanceOptimizer.compressResponse.call(this, body, req, originalSend, startTime);
      };

      next();
    };

    const performanceOptimizer = this;
  }

  private async compressResponse(
    this: Response,
    body: any,
    req: Request,
    originalSend: Function,
    startTime: number
  ): Promise<Response> {
    const optimizer = (req as any).performanceOptimizer as PerformanceOptimizer;
    
    try {
      // Check if compression should be applied
      if (!optimizer.shouldCompress(req, body)) {
        return originalSend.call(this, body);
      }

      const stringBody = typeof body === 'string' ? body : JSON.stringify(body);
      const originalSize = Buffer.byteLength(stringBody, 'utf8');

      if (originalSize < optimizer.config.compression.threshold) {
        return originalSend.call(this, body);
      }

      // Determine best compression algorithm
      const acceptedEncodings = req.get('Accept-Encoding') || '';
      const algorithm = optimizer.selectCompressionAlgorithm(acceptedEncodings);

      if (!algorithm) {
        return originalSend.call(this, body);
      }

      // Compress the response
      const compressed = await optimizer.compress(stringBody, algorithm);
      
      // Update compression stats
      optimizer.compressionStats.originalBytes += originalSize;
      optimizer.compressionStats.compressedBytes += compressed.length;

      // Set appropriate headers
      this.set({
        'Content-Encoding': algorithm,
        'Content-Length': compressed.length.toString(),
        'Vary': 'Accept-Encoding'
      });

      // Record metrics
      const compressionRatio = compressed.length / originalSize;
      optimizer.metrics.observeHistogram('performance_compression_ratio', compressionRatio);
      optimizer.metrics.observeHistogram('performance_compression_time_ms', Date.now() - startTime);

      return originalSend.call(this, compressed);

    } catch (error) {
      optimizer.logger.error('Compression failed', { error });
      return originalSend.call(this, body);
    }
  }

  private shouldCompress(req: Request, body: any): boolean {
    // Skip compression for certain content types
    const contentType = req.get('Content-Type') || '';
    const skipTypes = ['image/', 'video/', 'audio/', 'application/octet-stream'];
    
    if (skipTypes.some(type => contentType.includes(type))) {
      return false;
    }

    // Skip if client doesn't support compression
    const acceptEncoding = req.get('Accept-Encoding') || '';
    return this.config.compression.algorithms.some(alg => 
      acceptEncoding.includes(alg)
    );
  }

  private selectCompressionAlgorithm(acceptedEncodings: string): string | null {
    for (const algorithm of this.config.compression.algorithms) {
      if (acceptedEncodings.includes(algorithm)) {
        return algorithm;
      }
    }
    return null;
  }

  private async compress(data: string, algorithm: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const buffer = Buffer.from(data, 'utf8');
      const options = {
        level: this.config.compression.level,
        chunkSize: this.config.compression.chunkSize
      };

      switch (algorithm) {
        case 'gzip':
          zlib.gzip(buffer, options, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
          break;

        case 'deflate':
          zlib.deflate(buffer, options, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
          break;

        case 'brotli':
          zlib.brotliCompress(buffer, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.compression.level,
              [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
            }
          }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
          break;

        default:
          reject(new Error(`Unsupported compression algorithm: ${algorithm}`));
      }
    });
  }

  /**
   * Request batching for improved throughput
   */
  public async batchRequest<T>(
    batchKey: string,
    operation: string,
    data: any,
    processor: (requests: BatchRequest[]) => Promise<any[]>
  ): Promise<T> {
    if (!this.config.batching.enabled) {
      // Process immediately if batching is disabled
      const mockBatch: BatchRequest = {
        id: crypto.randomUUID(),
        operation,
        data,
        timestamp: new Date(),
        resolve: () => {},
        reject: () => {}
      };
      const results = await processor([mockBatch]);
      return results[0];
    }

    return new Promise<T>((resolve, reject) => {
      const request: BatchRequest = {
        id: crypto.randomUUID(),
        operation,
        data,
        timestamp: new Date(),
        resolve,
        reject
      };

      // Add to batch
      if (!this.pendingBatches.has(batchKey)) {
        this.pendingBatches.set(batchKey, []);
      }
      
      const batch = this.pendingBatches.get(batchKey)!;
      batch.push(request);

      // Process batch if size limit reached
      if (batch.length >= this.config.batching.maxBatchSize) {
        this.processBatch(batchKey, processor);
        return;
      }

      // Set timer for batch processing
      if (!this.batchTimers.has(batchKey)) {
        const timer = setTimeout(() => {
          this.processBatch(batchKey, processor);
        }, this.config.batching.batchTimeoutMs);
        
        this.batchTimers.set(batchKey, timer);
      }

      // Check if request has been waiting too long
      setTimeout(() => {
        if (batch.includes(request)) {
          this.processBatch(batchKey, processor);
        }
      }, this.config.batching.maxWaitTimeMs);
    });
  }

  private async processBatch(
    batchKey: string,
    processor: (requests: BatchRequest[]) => Promise<any[]>
  ): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear timer and batch
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }
    this.pendingBatches.delete(batchKey);

    try {
      const startTime = Date.now();
      const results = await processor(batch);
      const processingTime = Date.now() - startTime;

      // Resolve all requests in batch
      batch.forEach((request, index) => {
        if (results[index] instanceof Error) {
          request.reject(results[index]);
        } else {
          request.resolve(results[index]);
        }
      });

      // Record metrics
      this.metrics.observeHistogram('performance_batch_size', batch.length);
      this.metrics.observeHistogram('performance_batch_processing_time_ms', processingTime);

      this.logger.debug('Batch processed', {
        batchKey,
        size: batch.length,
        processingTime
      });

    } catch (error) {
      // Reject all requests in batch
      batch.forEach(request => request.reject(error as Error));
      
      this.logger.error('Batch processing failed', {
        batchKey,
        size: batch.length,
        error
      });
    }
  }

  /**
   * Resource pooling for improved resource utilization
   */
  public createResourcePool<T>(
    poolName: string,
    factory: () => Promise<T>,
    destroyer: (resource: T) => Promise<void>,
    validator: (resource: T) => boolean,
    options: {
      minSize?: number;
      maxSize?: number;
    } = {}
  ): void {
    const pool: ResourcePool<T> = {
      available: [],
      inUse: new Set(),
      maxSize: options.maxSize || this.config.resourcePooling.connectionPoolSize,
      minSize: options.minSize || 1,
      factory,
      destroyer,
      validator
    };

    this.resourcePools.set(poolName, pool);

    // Pre-populate with minimum resources
    this.maintainMinPoolSize(poolName);
  }

  public async acquireResource<T>(poolName: string, timeoutMs?: number): Promise<T> {
    const pool = this.resourcePools.get(poolName) as ResourcePool<T>;
    if (!pool) {
      throw new Error(`Resource pool not found: ${poolName}`);
    }

    const timeout = timeoutMs || this.config.resourcePooling.acquireTimeoutMs;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Try to get an available resource
      let resource = pool.available.pop();
      
      if (resource && pool.validator(resource)) {
        pool.inUse.add(resource);
        this.metrics.incrementCounter('performance_resource_acquired_total', { pool: poolName });
        return resource;
      }

      // Create new resource if pool not at max capacity
      if (pool.available.length + pool.inUse.size < pool.maxSize) {
        try {
          resource = await pool.factory();
          pool.inUse.add(resource);
          this.metrics.incrementCounter('performance_resource_created_total', { pool: poolName });
          return resource;
        } catch (error) {
          this.logger.error('Failed to create resource', { poolName, error });
        }
      }

      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    throw new Error(`Failed to acquire resource from pool: ${poolName}`);
  }

  public async releaseResource<T>(poolName: string, resource: T): Promise<void> {
    const pool = this.resourcePools.get(poolName) as ResourcePool<T>;
    if (!pool) return;

    pool.inUse.delete(resource);

    if (pool.validator(resource) && pool.available.length < pool.maxSize) {
      pool.available.push(resource);
      this.metrics.incrementCounter('performance_resource_released_total', { pool: poolName });
    } else {
      // Destroy invalid or excess resources
      try {
        await pool.destroyer(resource);
        this.metrics.incrementCounter('performance_resource_destroyed_total', { pool: poolName });
      } catch (error) {
        this.logger.error('Failed to destroy resource', { poolName, error });
      }
    }

    // Maintain minimum pool size
    this.maintainMinPoolSize(poolName);
  }

  private async maintainMinPoolSize(poolName: string): Promise<void> {
    const pool = this.resourcePools.get(poolName);
    if (!pool) return;

    while (pool.available.length < pool.minSize) {
      try {
        const resource = await pool.factory();
        pool.available.push(resource);
      } catch (error) {
        this.logger.error('Failed to maintain min pool size', { poolName, error });
        break;
      }
    }
  }

  /**
   * CDN integration for static assets
   */
  public getCdnUrl(assetPath: string): string {
    if (!this.config.cdn.enabled) {
      return assetPath;
    }

    const extension = assetPath.split('.').pop()?.toLowerCase();
    if (!extension || !this.config.cdn.staticFileExtensions.includes(extension)) {
      return assetPath;
    }

    let cdnPath = `${this.config.cdn.baseUrl}${assetPath}`;
    
    if (this.config.cdn.cacheBustingEnabled) {
      const timestamp = Date.now();
      const separator = assetPath.includes('?') ? '&' : '?';
      cdnPath += `${separator}v=${timestamp}`;
    }

    return cdnPath;
  }

  /**
   * Performance monitoring middleware
   */
  public performanceMiddleware() {
    if (!this.config.monitoring.enabled) {
      return (req: Request, res: Response, next: NextFunction) => next();
    }

    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId = (req as any).requestId || crypto.randomUUID();

      // Store start time
      this.requestStartTimes.set(requestId, startTime);

      // Hook into response finish
      res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        this.recordRequestMetrics(req, res, responseTime);
        this.requestStartTimes.delete(requestId);
      });

      next();
    };
  }

  private recordRequestMetrics(req: Request, res: Response, responseTime: number): void {
    // Record response time
    this.responseTimeHistory.push(responseTime);
    if (this.responseTimeHistory.length > 1000) {
      this.responseTimeHistory.shift(); // Keep only recent data
    }

    // Record metrics
    this.metrics.observeHistogram('http_request_duration_ms', responseTime, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });

    this.metrics.incrementCounter('http_requests_total', {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });

    // Check for slow requests
    if (responseTime > this.config.monitoring.slowRequestThreshold) {
      this.logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        responseTime,
        userAgent: req.get('User-Agent')
      });

      this.metrics.incrementCounter('http_slow_requests_total', {
        method: req.method,
        route: req.route?.path || req.path
      });
    }
  }

  private updatePerformanceMetrics(): void {
    // Calculate percentiles
    const sorted = [...this.responseTimeHistory].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const average = sorted.reduce((sum, time) => sum + time, 0) / sorted.length || 0;

    this.metrics.setGauge('performance_response_time_p95_ms', p95);
    this.metrics.setGauge('performance_response_time_p99_ms', p99);
    this.metrics.setGauge('performance_response_time_avg_ms', average);

    // Compression ratio
    const compressionRatio = this.compressionStats.originalBytes > 0 ?
      this.compressionStats.compressedBytes / this.compressionStats.originalBytes : 1;
    this.metrics.setGauge('performance_compression_ratio', compressionRatio);

    // Resource pool metrics
    for (const [poolName, pool] of this.resourcePools) {
      this.metrics.setGauge('performance_pool_available_resources', pool.available.length, { pool: poolName });
      this.metrics.setGauge('performance_pool_in_use_resources', pool.inUse.size, { pool: poolName });
    }

    // System metrics
    const memUsage = process.memoryUsage();
    this.metrics.setGauge('performance_memory_usage_mb', memUsage.heapUsed / 1024 / 1024);
    this.metrics.setGauge('performance_memory_total_mb', memUsage.heapTotal / 1024 / 1024);
  }

  private checkPerformanceThresholds(): void {
    // Check memory threshold
    const memUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memUsageMB > this.config.monitoring.memoryThreshold) {
      this.logger.warn('Memory usage threshold exceeded', {
        current: memUsageMB,
        threshold: this.config.monitoring.memoryThreshold
      });
    }

    // Check average response time
    const avgResponseTime = this.responseTimeHistory.reduce((sum, time) => sum + time, 0) / 
                           this.responseTimeHistory.length;
    if (avgResponseTime > this.config.monitoring.slowRequestThreshold) {
      this.logger.warn('Average response time threshold exceeded', {
        current: avgResponseTime,
        threshold: this.config.monitoring.slowRequestThreshold
      });
    }
  }

  private cleanupOldMetrics(): void {
    // Cleanup old request start times
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [requestId, startTime] of this.requestStartTimes) {
      if (startTime < fiveMinutesAgo) {
        this.requestStartTimes.delete(requestId);
      }
    }

    // Reset compression stats periodically
    if (Math.random() < 0.1) { // 10% chance each cleanup cycle
      this.compressionStats = { originalBytes: 0, compressedBytes: 0 };
    }
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    const sorted = [...this.responseTimeHistory].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const average = sorted.reduce((sum, time) => sum + time, 0) / sorted.length || 0;

    const compressionRatio = this.compressionStats.originalBytes > 0 ?
      this.compressionStats.compressedBytes / this.compressionStats.originalBytes : 1;

    return {
      requestCount: this.responseTimeHistory.length,
      averageResponseTime: average,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      throughput: this.calculateThroughput(),
      errorRate: 0, // Would come from metrics
      compressionRatio,
      cacheHitRate: 0, // Would come from cache service
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      cpuUsage: 0 // Would need CPU monitoring
    };
  }

  private calculateThroughput(): number {
    // Calculate requests per second over last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = Array.from(this.requestStartTimes.values())
      .filter(startTime => startTime > oneMinuteAgo);
    
    return recentRequests.length / 60; // requests per second
  }

  /**
   * Optimize specific operation
   */
  public async optimizeOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: {
      useCache?: boolean;
      cacheKey?: string;
      cacheTtl?: number;
      enableBatching?: boolean;
      batchKey?: string;
      timeout?: number;
    } = {}
  ): Promise<T> {
    return await this.tracing.withSpan(
      `performance.optimize.${operationName}`,
      async (span) => {
        span.setAttributes({
          'performance.cache_enabled': options.useCache || false,
          'performance.batching_enabled': options.enableBatching || false,
          'performance.timeout': options.timeout || 0
        });

        const startTime = Date.now();

        try {
          // Try cache first if enabled
          if (options.useCache && options.cacheKey) {
            const cached = await this.cache.get<T>(options.cacheKey);
            if (cached !== null) {
              span.setAttributes({ 'performance.cache_hit': true });
              return cached;
            }
            span.setAttributes({ 'performance.cache_hit': false });
          }

          // Execute operation with timeout if specified
          let result: T;
          if (options.timeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Operation timeout')), options.timeout);
            });
            result = await Promise.race([operation(), timeoutPromise]);
          } else {
            result = await operation();
          }

          // Cache result if caching is enabled
          if (options.useCache && options.cacheKey) {
            await this.cache.set(options.cacheKey, result, {
              ttl: options.cacheTtl || 300
            });
          }

          const executionTime = Date.now() - startTime;
          span.setAttributes({
            'performance.execution_time_ms': executionTime,
            'performance.success': true
          });

          return result;

        } catch (error) {
          const executionTime = Date.now() - startTime;
          span.setAttributes({
            'performance.execution_time_ms': executionTime,
            'performance.success': false
          });
          throw error;
        }
      }
    );
  }
}

export default PerformanceOptimizer;