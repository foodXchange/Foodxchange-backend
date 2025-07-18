/**
 * Enterprise-grade Metrics and Monitoring Service
 * Provides application metrics, performance tracking, and health monitoring
 */

import { EventEmitter } from 'events';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('MetricsService');

interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface Counter {
  value: number;
  lastReset: Date;
}

interface Histogram {
  values: number[];
  sum: number;
  count: number;
  min: number;
  max: number;
}

interface Timer {
  startTime: number;
  name: string;
  tags?: Record<string, string>;
}

export class MetricsService extends EventEmitter {
  private static instance: MetricsService;
  
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private timers: Map<string, Timer> = new Map();
  
  private flushInterval: NodeJS.Timer | null = null;
  private readonly flushIntervalMs = 60000; // 1 minute
  private readonly histogramMaxSize = 1000;

  private constructor() {
    super();
    this.startFlushInterval();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  // Counter operations
  public increment(name: string, value = 1, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    const counter = this.counters.get(key) || { value: 0, lastReset: new Date() };
    counter.value += value;
    this.counters.set(key, counter);
  }

  public decrement(name: string, value = 1, tags?: Record<string, string>): void {
    this.increment(name, -value, tags);
  }

  // Gauge operations
  public gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    this.gauges.set(key, value);
  }

  // Histogram operations
  public histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    let hist = this.histograms.get(key);
    
    if (!hist) {
      hist = {
        values: [],
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
      };
      this.histograms.set(key, hist);
    }

    // Update histogram
    hist.values.push(value);
    hist.sum += value;
    hist.count++;
    hist.min = Math.min(hist.min, value);
    hist.max = Math.max(hist.max, value);

    // Limit size to prevent memory issues
    if (hist.values.length > this.histogramMaxSize) {
      hist.values.shift();
    }
  }

  // Timer operations
  public startTimer(name: string, tags?: Record<string, string>): () => void {
    const timerId = `${Date.now()}-${Math.random()}`;
    const timer: Timer = {
      startTime: Date.now(),
      name,
      tags,
    };
    this.timers.set(timerId, timer);

    // Return stop function
    return () => {
      const t = this.timers.get(timerId);
      if (t) {
        const duration = Date.now() - t.startTime;
        this.histogram(`${name}.duration`, duration, tags);
        this.timers.delete(timerId);
        return duration;
      }
      return 0;
    };
  }

  // Business metrics
  public recordAPICall(service: string, duration: number, success: boolean): void {
    this.increment(`api.calls`, 1, { service, status: success ? 'success' : 'failure' });
    this.histogram(`api.duration`, duration, { service });
    
    if (!success) {
      this.increment(`api.errors`, 1, { service });
    }
  }

  public recordDatabaseQuery(operation: string, collection: string, duration: number, success: boolean): void {
    this.increment(`db.queries`, 1, { operation, collection, status: success ? 'success' : 'failure' });
    this.histogram(`db.duration`, duration, { operation, collection });
  }

  public recordCacheHit(operation: string): void {
    this.increment(`cache.hits`, 1, { operation });
  }

  public recordCacheMiss(operation: string): void {
    this.increment(`cache.misses`, 1, { operation });
  }

  public recordBusinessEvent(event: string, metadata?: Record<string, any>): void {
    this.increment(`business.events`, 1, { event });
    logger.info('Business event recorded', { event, metadata });
  }

  // Get metrics snapshot
  public getSnapshot(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
      p50: number;
      p95: number;
      p99: number;
    }>;
  } {
    const snapshot = {
      counters: {} as Record<string, number>,
      gauges: {} as Record<string, number>,
      histograms: {} as Record<string, any>,
    };

    // Counters
    this.counters.forEach((counter, key) => {
      snapshot.counters[key] = counter.value;
    });

    // Gauges
    this.gauges.forEach((value, key) => {
      snapshot.gauges[key] = value;
    });

    // Histograms
    this.histograms.forEach((hist, key) => {
      const sortedValues = [...hist.values].sort((a, b) => a - b);
      snapshot.histograms[key] = {
        count: hist.count,
        sum: hist.sum,
        avg: hist.count > 0 ? hist.sum / hist.count : 0,
        min: hist.min === Infinity ? 0 : hist.min,
        max: hist.max === -Infinity ? 0 : hist.max,
        p50: this.percentile(sortedValues, 50),
        p95: this.percentile(sortedValues, 95),
        p99: this.percentile(sortedValues, 99),
      };
    });

    return snapshot;
  }

  // System metrics
  public collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    this.gauge('system.memory.heap.used', memUsage.heapUsed);
    this.gauge('system.memory.heap.total', memUsage.heapTotal);
    this.gauge('system.memory.rss', memUsage.rss);
    this.gauge('system.memory.external', memUsage.external);

    const cpuUsage = process.cpuUsage();
    this.gauge('system.cpu.user', cpuUsage.user);
    this.gauge('system.cpu.system', cpuUsage.system);

    this.gauge('system.uptime', process.uptime());
    this.gauge('system.pid', process.pid);
  }

  // Health metrics
  public recordHealthCheck(service: string, healthy: boolean, responseTime?: number): void {
    this.gauge(`health.${service}`, healthy ? 1 : 0);
    if (responseTime !== undefined) {
      this.histogram(`health.${service}.response_time`, responseTime);
    }
  }

  // Utility methods
  private buildKey(name: string, tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return name;
    }
    
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    
    return `${name}{${tagString}}`;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  private flush(): void {
    const snapshot = this.getSnapshot();
    
    // Emit metrics event for external collectors
    this.emit('metrics', snapshot);
    
    // Log summary
    logger.debug('Metrics flushed', {
      counters: Object.keys(snapshot.counters).length,
      gauges: Object.keys(snapshot.gauges).length,
      histograms: Object.keys(snapshot.histograms).length,
    });

    // Reset counters after flush
    this.counters.clear();
    
    // Collect system metrics for next interval
    this.collectSystemMetrics();
  }

  // Prometheus format export
  public exportPrometheus(): string {
    const lines: string[] = [];
    const snapshot = this.getSnapshot();

    // Counters
    Object.entries(snapshot.counters).forEach(([key, value]) => {
      lines.push(`# TYPE ${key} counter`);
      lines.push(`${key} ${value}`);
    });

    // Gauges
    Object.entries(snapshot.gauges).forEach(([key, value]) => {
      lines.push(`# TYPE ${key} gauge`);
      lines.push(`${key} ${value}`);
    });

    // Histograms
    Object.entries(snapshot.histograms).forEach(([key, hist]) => {
      lines.push(`# TYPE ${key} histogram`);
      lines.push(`${key}_count ${hist.count}`);
      lines.push(`${key}_sum ${hist.sum}`);
      lines.push(`${key}_bucket{le="0.005"} ${hist.p50}`);
      lines.push(`${key}_bucket{le="0.01"} ${hist.p95}`);
      lines.push(`${key}_bucket{le="0.025"} ${hist.p99}`);
    });

    return lines.join('\n');
  }

  // Cleanup
  public stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

// Export singleton instance
export default metricsService;