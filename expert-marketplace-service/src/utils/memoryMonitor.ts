import { EventEmitter } from 'events';
import { Logger } from './logger';

const logger = new Logger('MemoryMonitor');

export interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  timestamp: Date;
}

export interface MemoryLeak {
  type: 'heap_growth' | 'event_listeners' | 'timers' | 'external_resources';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  growth: number;
  threshold: number;
  suggestions: string[];
  detectedAt: Date;
}

export interface MemoryThresholds {
  heap: {
    warning: number;
    critical: number;
  };
  rss: {
    warning: number;
    critical: number;
  };
  growth: {
    warning: number; // MB per minute
    critical: number;
  };
}

export interface ResourceTracker {
  eventListeners: Map<string, number>;
  timers: Map<string, number>;
  streams: Map<string, number>;
  sockets: Map<string, number>;
  fileDescriptors: Map<string, number>;
}

/**
 * Comprehensive memory monitoring and leak prevention system
 */
export class MemoryMonitor extends EventEmitter {
  private memoryHistory: MemoryStats[] = [];
  private readonly maxHistorySize = 100;
  private readonly monitoringInterval = 30000; // 30 seconds
  private readonly leakDetectionInterval = 60000; // 1 minute
  
  private monitoringTimer: NodeJS.Timeout;
  private leakDetectionTimer: NodeJS.Timeout;
  private gcTimer: NodeJS.Timeout;
  
  private thresholds: MemoryThresholds = {
    heap: {
      warning: 500 * 1024 * 1024, // 500MB
      critical: 1000 * 1024 * 1024 // 1GB
    },
    rss: {
      warning: 1000 * 1024 * 1024, // 1GB
      critical: 2000 * 1024 * 1024 // 2GB
    },
    growth: {
      warning: 10 * 1024 * 1024, // 10MB per minute
      critical: 50 * 1024 * 1024 // 50MB per minute
    }
  };
  
  private resourceTracker: ResourceTracker = {
    eventListeners: new Map(),
    timers: new Map(),
    streams: new Map(),
    sockets: new Map(),
    fileDescriptors: new Map()
  };
  
  private leakDetected = false;
  private forceGcEnabled = false;
  private alertCooldown = 300000; // 5 minutes
  private lastAlertTime = 0;
  
  constructor(options: {
    thresholds?: Partial<MemoryThresholds>;
    enableForceGc?: boolean;
    monitoringInterval?: number;
  } = {}) {
    super();
    this.setMaxListeners(50);
    
    if (options.thresholds) {
      this.thresholds = { ...this.thresholds, ...options.thresholds };
    }
    
    if (options.enableForceGc) {
      this.forceGcEnabled = true;
    }
    
    if (options.monitoringInterval) {
      this.monitoringInterval = options.monitoringInterval;
    }
    
    this.setupMonitoring();
    this.setupProcessListeners();
    this.setupGracefulShutdown();
  }

  /**
   * Start memory monitoring
   */
  start(): void {
    logger.info('Starting memory monitoring', {
      interval: this.monitoringInterval,
      thresholds: this.thresholds,
      forceGcEnabled: this.forceGcEnabled
    });
    
    // Initial memory collection
    this.collectMemoryStats();
    
    // Setup monitoring intervals
    this.monitoringTimer = setInterval(() => {
      this.collectMemoryStats();
    }, this.monitoringInterval);
    
    this.leakDetectionTimer = setInterval(() => {
      this.detectMemoryLeaks();
    }, this.leakDetectionInterval);
    
    // Setup periodic GC if enabled
    if (this.forceGcEnabled && global.gc) {
      this.gcTimer = setInterval(() => {
        this.performGarbageCollection();
      }, 300000); // 5 minutes
    }
    
    this.emit('monitoring_started');
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    logger.info('Stopping memory monitoring');
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    if (this.leakDetectionTimer) {
      clearInterval(this.leakDetectionTimer);
    }
    
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }
    
    this.emit('monitoring_stopped');
  }

  /**
   * Get current memory statistics
   */
  getCurrentStats(): MemoryStats {
    const memoryUsage = process.memoryUsage();
    return {
      rss: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      timestamp: new Date()
    };
  }

  /**
   * Get memory history
   */
  getMemoryHistory(): MemoryStats[] {
    return [...this.memoryHistory];
  }

  /**
   * Get memory growth trend
   */
  getMemoryTrend(minutes: number = 5): {
    growth: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    samples: number;
  } {
    const now = Date.now();
    const cutoff = now - (minutes * 60 * 1000);
    
    const recentStats = this.memoryHistory.filter(stat => 
      stat.timestamp.getTime() > cutoff
    );
    
    if (recentStats.length < 2) {
      return { growth: 0, trend: 'stable', samples: recentStats.length };
    }
    
    const first = recentStats[0];
    const last = recentStats[recentStats.length - 1];
    const growth = last.heapUsed - first.heapUsed;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (growth > 1024 * 1024) { // 1MB threshold
      trend = 'increasing';
    } else if (growth < -1024 * 1024) {
      trend = 'decreasing';
    }
    
    return { growth, trend, samples: recentStats.length };
  }

  /**
   * Track resource usage
   */
  trackResource(type: keyof ResourceTracker, id: string, count: number = 1): void {
    const current = this.resourceTracker[type].get(id) || 0;
    this.resourceTracker[type].set(id, current + count);
  }

  /**
   * Untrack resource usage
   */
  untrackResource(type: keyof ResourceTracker, id: string, count: number = 1): void {
    const current = this.resourceTracker[type].get(id) || 0;
    const newCount = Math.max(0, current - count);
    
    if (newCount === 0) {
      this.resourceTracker[type].delete(id);
    } else {
      this.resourceTracker[type].set(id, newCount);
    }
  }

  /**
   * Get resource usage summary
   */
  getResourceUsage(): {
    eventListeners: { total: number; byType: Record<string, number> };
    timers: { total: number; byType: Record<string, number> };
    streams: { total: number; byType: Record<string, number> };
    sockets: { total: number; byType: Record<string, number> };
    fileDescriptors: { total: number; byType: Record<string, number> };
  } {
    const summarize = (tracker: Map<string, number>) => {
      const byType: Record<string, number> = {};
      let total = 0;
      
      for (const [type, count] of tracker) {
        byType[type] = count;
        total += count;
      }
      
      return { total, byType };
    };
    
    return {
      eventListeners: summarize(this.resourceTracker.eventListeners),
      timers: summarize(this.resourceTracker.timers),
      streams: summarize(this.resourceTracker.streams),
      sockets: summarize(this.resourceTracker.sockets),
      fileDescriptors: summarize(this.resourceTracker.fileDescriptors)
    };
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (!global.gc) {
      logger.warn('Garbage collection not available. Start with --expose-gc flag');
      return false;
    }
    
    const beforeStats = this.getCurrentStats();
    
    try {
      global.gc();
      
      const afterStats = this.getCurrentStats();
      const freed = beforeStats.heapUsed - afterStats.heapUsed;
      
      logger.info('Garbage collection completed', {
        freedMemory: freed,
        beforeHeap: beforeStats.heapUsed,
        afterHeap: afterStats.heapUsed
      });
      
      this.emit('gc_completed', { freed, beforeStats, afterStats });
      return true;
    } catch (error) {
      logger.error('Garbage collection failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate memory report
   */
  generateReport(): {
    current: MemoryStats;
    trend: any;
    resources: any;
    leaks: MemoryLeak[];
    recommendations: string[];
  } {
    const current = this.getCurrentStats();
    const trend = this.getMemoryTrend();
    const resources = this.getResourceUsage();
    const leaks = this.analyzeForLeaks();
    const recommendations = this.generateRecommendations(current, trend, resources, leaks);
    
    return {
      current,
      trend,
      resources,
      leaks,
      recommendations
    };
  }

  /**
   * Clean up resources and shutdown
   */
  shutdown(): void {
    logger.info('Shutting down memory monitor');
    
    this.stop();
    
    // Clear all maps
    this.resourceTracker.eventListeners.clear();
    this.resourceTracker.timers.clear();
    this.resourceTracker.streams.clear();
    this.resourceTracker.sockets.clear();
    this.resourceTracker.fileDescriptors.clear();
    
    // Clear history
    this.memoryHistory = [];
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Memory monitor shutdown completed');
  }

  // Private methods
  private collectMemoryStats(): void {
    const stats = this.getCurrentStats();
    
    // Add to history
    this.memoryHistory.push(stats);
    
    // Limit history size
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
    
    // Check thresholds
    this.checkThresholds(stats);
    
    // Emit stats
    this.emit('memory_stats', stats);
  }

  private checkThresholds(stats: MemoryStats): void {
    const now = Date.now();
    
    // Check if we should send alerts (cooldown period)
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }
    
    // Check heap usage
    if (stats.heapUsed > this.thresholds.heap.critical) {
      this.emitAlert('critical', 'Heap usage exceeded critical threshold', stats);
      this.lastAlertTime = now;
    } else if (stats.heapUsed > this.thresholds.heap.warning) {
      this.emitAlert('warning', 'Heap usage exceeded warning threshold', stats);
      this.lastAlertTime = now;
    }
    
    // Check RSS usage
    if (stats.rss > this.thresholds.rss.critical) {
      this.emitAlert('critical', 'RSS usage exceeded critical threshold', stats);
      this.lastAlertTime = now;
    } else if (stats.rss > this.thresholds.rss.warning) {
      this.emitAlert('warning', 'RSS usage exceeded warning threshold', stats);
      this.lastAlertTime = now;
    }
    
    // Check growth rate
    const trend = this.getMemoryTrend(1); // 1 minute window
    if (trend.growth > this.thresholds.growth.critical) {
      this.emitAlert('critical', 'Memory growth rate exceeded critical threshold', stats);
      this.lastAlertTime = now;
    } else if (trend.growth > this.thresholds.growth.warning) {
      this.emitAlert('warning', 'Memory growth rate exceeded warning threshold', stats);
      this.lastAlertTime = now;
    }
  }

  private emitAlert(level: 'warning' | 'critical', message: string, stats: MemoryStats): void {
    const alert = {
      level,
      message,
      stats,
      timestamp: new Date(),
      trend: this.getMemoryTrend(),
      resources: this.getResourceUsage()
    };
    
    logger.warn(`Memory alert: ${message}`, alert);
    this.emit('memory_alert', alert);
    
    // Force GC on critical alerts
    if (level === 'critical' && this.forceGcEnabled) {
      this.forceGarbageCollection();
    }
  }

  private detectMemoryLeaks(): void {
    const leaks = this.analyzeForLeaks();
    
    if (leaks.length > 0) {
      this.leakDetected = true;
      
      for (const leak of leaks) {
        logger.warn('Memory leak detected', leak);
        this.emit('memory_leak', leak);
      }
      
      // Auto-remediation for critical leaks
      const criticalLeaks = leaks.filter(leak => leak.severity === 'critical');
      if (criticalLeaks.length > 0) {
        this.performAutoRemediation(criticalLeaks);
      }
    }
  }

  private analyzeForLeaks(): MemoryLeak[] {
    const leaks: MemoryLeak[] = [];
    
    // Check for heap growth pattern
    const trend = this.getMemoryTrend(5);
    if (trend.growth > 50 * 1024 * 1024 && trend.trend === 'increasing') {
      leaks.push({
        type: 'heap_growth',
        description: 'Sustained heap growth detected',
        severity: 'high',
        growth: trend.growth,
        threshold: this.thresholds.growth.warning,
        suggestions: [
          'Review object creation patterns',
          'Check for unreleased references',
          'Consider implementing object pooling'
        ],
        detectedAt: new Date()
      });
    }
    
    // Check for excessive event listeners
    const resources = this.getResourceUsage();
    if (resources.eventListeners.total > 1000) {
      leaks.push({
        type: 'event_listeners',
        description: 'Excessive event listeners detected',
        severity: 'medium',
        growth: resources.eventListeners.total,
        threshold: 1000,
        suggestions: [
          'Review event listener lifecycle',
          'Ensure proper cleanup on object destruction',
          'Use weak references where appropriate'
        ],
        detectedAt: new Date()
      });
    }
    
    // Check for timer leaks
    if (resources.timers.total > 100) {
      leaks.push({
        type: 'timers',
        description: 'Excessive timers detected',
        severity: 'medium',
        growth: resources.timers.total,
        threshold: 100,
        suggestions: [
          'Review timer cleanup in components',
          'Use clearTimeout/clearInterval consistently',
          'Consider using AbortController for cancelable operations'
        ],
        detectedAt: new Date()
      });
    }
    
    // Check for external resource leaks
    if (this.memoryHistory.length > 10) {
      const recent = this.memoryHistory.slice(-10);
      const externalGrowth = recent[recent.length - 1].external - recent[0].external;
      
      if (externalGrowth > 10 * 1024 * 1024) {
        leaks.push({
          type: 'external_resources',
          description: 'External resource growth detected',
          severity: 'high',
          growth: externalGrowth,
          threshold: 10 * 1024 * 1024,
          suggestions: [
            'Review external library usage',
            'Check for unclosed file handles',
            'Verify network connection cleanup'
          ],
          detectedAt: new Date()
        });
      }
    }
    
    return leaks;
  }

  private performAutoRemediation(leaks: MemoryLeak[]): void {
    logger.info('Performing auto-remediation for critical memory leaks', {
      leakCount: leaks.length
    });
    
    // Force garbage collection
    if (this.forceGcEnabled) {
      this.forceGarbageCollection();
    }
    
    // Clear some caches if available
    this.emit('clear_caches');
    
    // Emit remediation event
    this.emit('auto_remediation', { leaks, timestamp: new Date() });
  }

  private generateRecommendations(
    current: MemoryStats,
    trend: any,
    resources: any,
    leaks: MemoryLeak[]
  ): string[] {
    const recommendations: string[] = [];
    
    // General recommendations
    if (current.heapUsed > 100 * 1024 * 1024) {
      recommendations.push('Consider implementing memory pooling for frequently created objects');
    }
    
    if (trend.trend === 'increasing') {
      recommendations.push('Monitor for memory leaks and implement proper cleanup');
    }
    
    if (resources.eventListeners.total > 500) {
      recommendations.push('Review event listener management and implement cleanup');
    }
    
    if (resources.timers.total > 50) {
      recommendations.push('Audit timer usage and ensure proper cleanup');
    }
    
    // Leak-specific recommendations
    for (const leak of leaks) {
      recommendations.push(...leak.suggestions);
    }
    
    // Performance recommendations
    if (current.heapUsed / current.heapTotal > 0.8) {
      recommendations.push('Consider increasing heap size or optimizing memory usage');
    }
    
    return [...new Set(recommendations)]; // Remove duplicates
  }

  private performGarbageCollection(): void {
    if (!this.forceGcEnabled || !global.gc) {
      return;
    }
    
    const beforeStats = this.getCurrentStats();
    
    // Only perform GC if heap usage is significant
    if (beforeStats.heapUsed < 50 * 1024 * 1024) {
      return;
    }
    
    try {
      global.gc();
      
      const afterStats = this.getCurrentStats();
      const freed = beforeStats.heapUsed - afterStats.heapUsed;
      
      if (freed > 5 * 1024 * 1024) { // Only log significant collections
        logger.debug('Periodic garbage collection completed', {
          freedMemory: freed,
          heapBefore: beforeStats.heapUsed,
          heapAfter: afterStats.heapUsed
        });
      }
    } catch (error) {
      logger.error('Periodic garbage collection failed', { error: error.message });
    }
  }

  private setupProcessListeners(): void {
    // Track process events
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning') {
        this.trackResource('eventListeners', 'max_listeners_exceeded', 1);
        logger.warn('Max listeners exceeded warning', {
          name: warning.name,
          message: warning.message
        });
      }
    });
    
    // Track uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception detected', { error: error.message });
      this.emit('uncaught_exception', error);
    });
    
    // Track unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection detected', { reason, promise });
      this.emit('unhandled_rejection', { reason, promise });
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      this.shutdown();
    };
    
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGUSR2', shutdown); // nodemon
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor({
  enableForceGc: process.env.NODE_ENV === 'development',
  thresholds: {
    heap: {
      warning: 500 * 1024 * 1024, // 500MB
      critical: 1000 * 1024 * 1024 // 1GB
    },
    rss: {
      warning: 1000 * 1024 * 1024, // 1GB
      critical: 2000 * 1024 * 1024 // 2GB
    },
    growth: {
      warning: 20 * 1024 * 1024, // 20MB per minute
      critical: 100 * 1024 * 1024 // 100MB per minute
    }
  }
});

// Utility functions for memory optimization
export const memoryUtils = {
  /**
   * Create a weak map for temporary storage
   */
  createWeakMap<K extends object, V>(): WeakMap<K, V> {
    return new WeakMap();
  },

  /**
   * Create a finalization registry for cleanup
   */
  createFinalizationRegistry<T>(cleanup: (heldValue: T) => void): FinalizationRegistry<T> {
    return new FinalizationRegistry(cleanup);
  },

  /**
   * Safely clear an array
   */
  clearArray<T>(array: T[]): void {
    array.length = 0;
  },

  /**
   * Safely clear a map
   */
  clearMap<K, V>(map: Map<K, V>): void {
    map.clear();
  },

  /**
   * Safely clear a set
   */
  clearSet<T>(set: Set<T>): void {
    set.clear();
  },

  /**
   * Create a bounded cache with automatic cleanup
   */
  createBoundedCache<K, V>(maxSize: number): Map<K, V> {
    const cache = new Map<K, V>();
    const originalSet = cache.set;
    
    cache.set = function(key: K, value: V) {
      if (this.size >= maxSize) {
        const firstKey = this.keys().next().value;
        this.delete(firstKey);
      }
      return originalSet.call(this, key, value);
    };
    
    return cache;
  },

  /**
   * Monitor object for memory leaks
   */
  monitorObject<T extends object>(obj: T, name: string): T {
    memoryMonitor.trackResource('eventListeners', name, 1);
    
    // Create cleanup registry
    const registry = new FinalizationRegistry((heldValue: string) => {
      memoryMonitor.untrackResource('eventListeners', heldValue, 1);
    });
    
    registry.register(obj, name);
    
    return obj;
  }
};

export default memoryMonitor;