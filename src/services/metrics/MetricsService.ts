import { Logger } from '../../core/logging/logger';
import { performance } from 'perf_hooks';

export interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
}

export interface CounterMetric {
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export interface TimerMetric {
  name: string;
  duration: number;
  tags?: Record<string, string>;
}

export class MetricsService {
  private static instance: MetricsService;
  private logger: Logger;
  private counters: Map<string, CounterMetric> = new Map();
  private timers: Map<string, number> = new Map();

  constructor() {
    this.logger = new Logger('MetricsService');
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Increment a counter metric
   */
  incrementCounter(name: string, tags?: Record<string, string>): void {
    const key = this.generateKey(name, tags);
    const existing = this.counters.get(key);
    
    if (existing) {
      existing.value++;
    } else {
      this.counters.set(key, {
        name,
        value: 1,
        tags
      });
    }

    this.logger.debug(`Counter incremented: ${name}`, { tags, value: this.counters.get(key)?.value });
  }

  /**
   * Record a timer metric
   */
  recordTimer(name: string, duration: number, tags?: Record<string, string>): void {
    const timerData: TimerMetric = {
      name,
      duration,
      tags
    };

    this.logger.debug(`Timer recorded: ${name}`, timerData);
    
    // In a real implementation, you would send this to a metrics backend
    // For now, we'll just log it
  }

  /**
   * Start a timer
   */
  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  /**
   * End a timer and record the duration
   */
  endTimer(name: string, tags?: Record<string, string>): void {
    const startTime = this.timers.get(name);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.recordTimer(name, duration, tags);
      this.timers.delete(name);
    }
  }

  /**
   * Record a gauge metric
   */
  recordGauge(name: string, value: number, tags?: Record<string, string>): void {
    const gaugeData: MetricData = {
      name,
      value,
      tags,
      timestamp: new Date()
    };

    this.logger.debug(`Gauge recorded: ${name}`, gaugeData);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, tags?: Record<string, string>): number {
    const key = this.generateKey(name, tags);
    return this.counters.get(key)?.value || 0;
  }

  /**
   * Get all counters
   */
  getAllCounters(): CounterMetric[] {
    return Array.from(this.counters.values());
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.timers.clear();
    this.logger.info('All metrics reset');
  }

  /**
   * Generate a unique key for metrics with tags
   */
  private generateKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    
    const sortedTags = Object.keys(tags)
      .sort()
      .map(key => `${key}:${tags[key]}`)
      .join(',');
    
    return `${name}|${sortedTags}`;
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    counters: CounterMetric[];
    activeTimers: string[];
    timestamp: Date;
  } {
    return {
      counters: this.getAllCounters(),
      activeTimers: Array.from(this.timers.keys()),
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const metricsService = MetricsService.getInstance();