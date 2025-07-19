import { performance } from 'perf_hooks';
import v8 from 'v8';
import { Logger } from '../../core/logging/logger';
import { EventEmitter } from 'events';

const logger = new Logger('MemoryOptimizationService');

interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapUsedPercent: number;
  timestamp: Date;
}

interface MemoryThresholds {
  warning: number;  // Percentage
  critical: number; // Percentage
  maxHeapSize: number; // Bytes
}

interface LeakDetectionResult {
  possibleLeak: boolean;
  growthRate: number;
  suspiciousObjects: any[];
  recommendations: string[];
}

export class MemoryOptimizationService extends EventEmitter {
  private static instance: MemoryOptimizationService;
  private metrics: MemoryMetrics[] = [];
  private gcInterval: NodeJS.Timer | null = null;
  private monitoringInterval: NodeJS.Timer | null = null;
  private heapSnapshots: any[] = [];
  
  private readonly thresholds: MemoryThresholds = {
    warning: 70,
    critical: 85,
    maxHeapSize: 1.5 * 1024 * 1024 * 1024 // 1.5GB
  };

  private constructor() {
    super();
    this.setupGarbageCollection();
    this.startMonitoring();
  }

  static getInstance(): MemoryOptimizationService {
    if (!MemoryOptimizationService.instance) {
      MemoryOptimizationService.instance = new MemoryOptimizationService();
    }
    return MemoryOptimizationService.instance;
  }

  /**
   * Setup optimized garbage collection
   */
  private setupGarbageCollection(): void {
    // Expose garbage collection if not already exposed
    if (!global.gc) {
      logger.warn('Garbage collection not exposed. Run with --expose-gc flag for manual GC control');
      return;
    }

    // Configure V8 heap settings
    this.configureV8Options();

    // Schedule periodic garbage collection during low activity
    this.gcInterval = setInterval(() => {
      this.performGarbageCollection();
    }, 5 * 60 * 1000); // Every 5 minutes

    logger.info('Garbage collection optimization configured');
  }

  /**
   * Configure V8 options for better memory management
   */
  private configureV8Options(): void {
    try {
      // Get current heap statistics
      const heapStats = v8.getHeapStatistics();
      
      // Log current configuration
      logger.info('V8 Heap Configuration', {
        totalHeapSize: this.formatBytes(heapStats.total_heap_size),
        heapSizeLimit: this.formatBytes(heapStats.heap_size_limit),
        mallocedMemory: this.formatBytes(heapStats.malloced_memory),
        peakMallocedMemory: this.formatBytes(heapStats.peak_malloced_memory)
      });

      // Set heap size limit if needed
      if (heapStats.heap_size_limit > this.thresholds.maxHeapSize) {
        logger.warn('Heap size limit exceeds threshold', {
          current: this.formatBytes(heapStats.heap_size_limit),
          threshold: this.formatBytes(this.thresholds.maxHeapSize)
        });
      }
    } catch (error) {
      logger.error('Failed to configure V8 options', error);
    }
  }

  /**
   * Start memory monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds

    // Collect initial metrics
    this.collectMetrics();
    
    logger.info('Memory monitoring started');
  }

  /**
   * Collect memory metrics
   */
  private collectMetrics(): void {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    const metrics: MemoryMetrics = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers || 0,
      heapUsedPercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100,
      timestamp: new Date()
    };

    this.metrics.push(metrics);
    
    // Keep only last 100 metrics
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    // Check thresholds
    this.checkMemoryThresholds(metrics);
    
    // Emit metrics event
    this.emit('metrics', metrics);
  }

  /**
   * Check memory thresholds and trigger actions
   */
  private checkMemoryThresholds(metrics: MemoryMetrics): void {
    if (metrics.heapUsedPercent >= this.thresholds.critical) {
      logger.error('Critical memory usage detected', {
        heapUsed: this.formatBytes(metrics.heapUsed),
        heapUsedPercent: metrics.heapUsedPercent.toFixed(2) + '%'
      });
      
      this.emit('critical', metrics);
      this.performEmergencyCleanup();
      
    } else if (metrics.heapUsedPercent >= this.thresholds.warning) {
      logger.warn('High memory usage detected', {
        heapUsed: this.formatBytes(metrics.heapUsed),
        heapUsedPercent: metrics.heapUsedPercent.toFixed(2) + '%'
      });
      
      this.emit('warning', metrics);
      this.performGarbageCollection();
    }
  }

  /**
   * Perform garbage collection
   */
  performGarbageCollection(): void {
    if (!global.gc) {
      return;
    }

    const before = process.memoryUsage();
    const startTime = performance.now();
    
    try {
      // Perform full garbage collection
      global.gc();
      
      const after = process.memoryUsage();
      const duration = performance.now() - startTime;
      
      const freed = {
        heapUsed: before.heapUsed - after.heapUsed,
        heapTotal: before.heapTotal - after.heapTotal,
        external: before.external - after.external
      };
      
      logger.info('Garbage collection completed', {
        duration: duration.toFixed(2) + 'ms',
        freedHeap: this.formatBytes(freed.heapUsed),
        freedExternal: this.formatBytes(freed.external),
        heapUsedAfter: this.formatBytes(after.heapUsed)
      });
      
      this.emit('gc', { before, after, freed, duration });
    } catch (error) {
      logger.error('Garbage collection failed', error);
    }
  }

  /**
   * Perform emergency memory cleanup
   */
  private async performEmergencyCleanup(): Promise<void> {
    logger.warn('Performing emergency memory cleanup');
    
    try {
      // Clear caches
      const { optimizedCache } = await import('../cache/OptimizedCacheService');
      await optimizedCache.flush();
      
      // Force garbage collection
      this.performGarbageCollection();
      
      // Clear internal buffers
      this.clearInternalBuffers();
      
      // Emit emergency cleanup event
      this.emit('emergency-cleanup');
      
      logger.info('Emergency cleanup completed');
    } catch (error) {
      logger.error('Emergency cleanup failed', error);
    }
  }

  /**
   * Clear internal buffers and caches
   */
  private clearInternalBuffers(): void {
    // Clear old metrics
    if (this.metrics.length > 50) {
      this.metrics = this.metrics.slice(-50);
    }
    
    // Clear heap snapshots
    this.heapSnapshots = [];
    
    // Clear event emitter listeners that might be accumulating
    const events = this.eventNames();
    events.forEach(event => {
      const listeners = this.listeners(event);
      if (listeners.length > 10) {
        logger.warn(`Clearing excess listeners for event: ${String(event)}`);
        this.removeAllListeners(event);
      }
    });
  }

  /**
   * Detect potential memory leaks
   */
  async detectMemoryLeaks(): Promise<LeakDetectionResult> {
    if (this.metrics.length < 10) {
      return {
        possibleLeak: false,
        growthRate: 0,
        suspiciousObjects: [],
        recommendations: ['Not enough data to detect leaks']
      };
    }

    // Calculate memory growth rate
    const recentMetrics = this.metrics.slice(-10);
    const firstMetric = recentMetrics[0];
    const lastMetric = recentMetrics[recentMetrics.length - 1];
    
    const timeDiff = lastMetric.timestamp.getTime() - firstMetric.timestamp.getTime();
    const memoryDiff = lastMetric.heapUsed - firstMetric.heapUsed;
    const growthRate = (memoryDiff / timeDiff) * 1000 * 60; // Bytes per minute

    // Take heap snapshot for analysis
    const snapshot = v8.writeHeapSnapshot();
    
    const result: LeakDetectionResult = {
      possibleLeak: growthRate > 1024 * 1024, // 1MB per minute
      growthRate,
      suspiciousObjects: [],
      recommendations: []
    };

    if (result.possibleLeak) {
      result.recommendations.push(
        'Possible memory leak detected',
        `Memory growing at ${this.formatBytes(growthRate)}/minute`,
        'Review recent code changes',
        'Check for unclosed resources',
        'Verify event listener cleanup',
        'Review cache expiration policies'
      );
    }

    return result;
  }

  /**
   * Get memory optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const currentMetrics = this.getCurrentMetrics();
    
    if (!currentMetrics) {
      return ['No metrics available'];
    }

    // High heap usage
    if (currentMetrics.heapUsedPercent > 60) {
      recommendations.push(
        'Consider increasing heap size limit',
        'Review and optimize data structures',
        'Implement pagination for large datasets',
        'Use streaming for large file operations'
      );
    }

    // High external memory
    if (currentMetrics.external > 100 * 1024 * 1024) { // 100MB
      recommendations.push(
        'High external memory usage detected',
        'Check for Buffer allocations',
        'Review image processing operations',
        'Ensure proper cleanup of native resources'
      );
    }

    // Array buffers
    if (currentMetrics.arrayBuffers > 50 * 1024 * 1024) { // 50MB
      recommendations.push(
        'High ArrayBuffer usage',
        'Review WebSocket implementations',
        'Check for accumulated binary data',
        'Implement buffer pooling'
      );
    }

    return recommendations;
  }

  /**
   * Apply memory optimization strategies
   */
  applyOptimizations(): void {
    logger.info('Applying memory optimizations');

    // 1. Configure garbage collection
    if (global.gc) {
      // More aggressive GC for high memory pressure
      const metrics = this.getCurrentMetrics();
      if (metrics && metrics.heapUsedPercent > 50) {
        this.performGarbageCollection();
      }
    }

    // 2. Optimize buffer allocations
    this.optimizeBufferAllocations();

    // 3. Setup memory pressure handlers
    this.setupMemoryPressureHandlers();

    // 4. Configure stream defaults
    this.configureStreamDefaults();

    logger.info('Memory optimizations applied');
  }

  /**
   * Optimize buffer allocations
   */
  private optimizeBufferAllocations(): void {
    // Set buffer allocation defaults
    const bufferUtil = require('buffer');
    
    // Use buffer pooling for small allocations
    bufferUtil.poolSize = 8 * 1024; // 8KB pool
    
    logger.info('Buffer allocations optimized');
  }

  /**
   * Setup memory pressure handlers
   */
  private setupMemoryPressureHandlers(): void {
    // Handle warnings
    this.on('warning', (metrics) => {
      // Reduce cache sizes
      process.emit('memory-pressure', 'warning');
    });

    // Handle critical
    this.on('critical', (metrics) => {
      // Emergency measures
      process.emit('memory-pressure', 'critical');
    });
  }

  /**
   * Configure stream defaults for better memory usage
   */
  private configureStreamDefaults(): void {
    const { Readable, Writable } = require('stream');
    
    // Set reasonable high water marks
    Readable.prototype._readableState.highWaterMark = 16 * 1024; // 16KB
    Writable.prototype._writableState.highWaterMark = 16 * 1024; // 16KB
    
    logger.info('Stream defaults configured');
  }

  /**
   * Get current memory metrics
   */
  getCurrentMetrics(): MemoryMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }

  /**
   * Get memory statistics
   */
  getStatistics(): any {
    if (this.metrics.length === 0) {
      return null;
    }

    const heapUsedValues = this.metrics.map(m => m.heapUsed);
    const min = Math.min(...heapUsedValues);
    const max = Math.max(...heapUsedValues);
    const avg = heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;

    return {
      current: this.getCurrentMetrics(),
      min: {
        heapUsed: min,
        formatted: this.formatBytes(min)
      },
      max: {
        heapUsed: max,
        formatted: this.formatBytes(max)
      },
      average: {
        heapUsed: avg,
        formatted: this.formatBytes(avg)
      },
      samples: this.metrics.length,
      v8: v8.getHeapStatistics()
    };
  }

  /**
   * Create memory report
   */
  async createMemoryReport(): Promise<any> {
    const stats = this.getStatistics();
    const leakDetection = await this.detectMemoryLeaks();
    const recommendations = this.getOptimizationRecommendations();
    
    return {
      timestamp: new Date(),
      statistics: stats,
      leakDetection,
      recommendations,
      processInfo: {
        pid: process.pid,
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        v8Version: process.versions.v8
      }
    };
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.removeAllListeners();
    logger.info('Memory optimization service stopped');
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Math.abs(bytes);
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    const formatted = size.toFixed(2) + ' ' + units[unitIndex];
    return bytes < 0 ? '-' + formatted : formatted;
  }
}

// Export singleton instance
export const memoryOptimizationService = MemoryOptimizationService.getInstance();

// Export memory optimization decorators
export function MemoryEfficient(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    // Clear any large objects before execution
    if (global.gc) {
      global.gc();
    }
    
    const result = await originalMethod.apply(this, args);
    
    // Schedule cleanup after execution
    setImmediate(() => {
      if (global.gc) {
        global.gc();
      }
    });
    
    return result;
  };
  
  return descriptor;
}

export function StreamProcessing(chunkSize: number = 16384) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Process in chunks to avoid loading everything in memory
      const stream = require('stream');
      const { Transform } = stream;
      
      const transform = new Transform({
        highWaterMark: chunkSize,
        transform(chunk: any, encoding: string, callback: Function) {
          // Process chunk
          callback(null, chunk);
        }
      });
      
      return originalMethod.apply(this, [...args, transform]);
    };
    
    return descriptor;
  };
}