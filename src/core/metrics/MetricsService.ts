import { Counter, Histogram, Gauge, register } from 'prom-client';

export class MetricsService {
  private counters: Map<string, Counter> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private gauges: Map<string, Gauge> = new Map();

  constructor() {
    // Initialize default metrics
    this.initializeDefaultMetrics();
  }

  private initializeDefaultMetrics(): void {
    // API request counter
    this.createCounter('api_requests_total', 'Total number of API requests', ['method', 'path', 'status_code']);
    
    // API errors counter
    this.createCounter('api_errors_total', 'Total number of API errors', ['method', 'path', 'status_code', 'error_code']);
    
    // API response time histogram
    this.createHistogram('api_response_time_seconds', 'API response time in seconds', ['method', 'path']);
    
    // Active connections gauge
    this.createGauge('active_connections', 'Number of active connections');
    
    // Analytics events counter
    this.createCounter('analytics_events_total', 'Total number of analytics events', ['event_type', 'user_role']);
    
    // Analytics flush counter
    this.createCounter('analytics_events_flushed_total', 'Total number of flushed analytics events', ['batch_size']);
    
    // Analytics errors counter
    this.createCounter('analytics_errors_total', 'Total number of analytics errors', ['error_type']);
    
    // CORS blocked requests
    this.createCounter('cors_blocked_requests_total', 'Total number of CORS blocked requests', ['origin']);
    
    // IP whitelist blocked requests
    this.createCounter('ip_whitelist_blocked_total', 'Total number of IP whitelist blocked requests', ['ip']);
    
    // Malicious user agent blocked
    this.createCounter('malicious_user_agent_blocked_total', 'Total number of malicious user agent blocked requests', ['userAgent']);
    
    // Request size limit exceeded
    this.createCounter('request_size_limit_exceeded_total', 'Total number of request size limit exceeded', ['size']);
    
    // Requests without user agent
    this.createCounter('requests_without_user_agent_total', 'Total number of requests without user agent');
  }

  private createCounter(name: string, help: string, labelNames: string[] = []): Counter {
    const counter = new Counter({
      name,
      help,
      labelNames
    });
    register.registerMetric(counter);
    this.counters.set(name, counter);
    return counter;
  }

  private createHistogram(name: string, help: string, labelNames: string[] = []): Histogram {
    const histogram = new Histogram({
      name,
      help,
      labelNames,
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });
    register.registerMetric(histogram);
    this.histograms.set(name, histogram);
    return histogram;
  }

  private createGauge(name: string, help: string, labelNames: string[] = []): Gauge {
    const gauge = new Gauge({
      name,
      help,
      labelNames
    });
    register.registerMetric(gauge);
    this.gauges.set(name, gauge);
    return gauge;
  }

  public incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const counter = this.counters.get(name);
    if (counter) {
      counter.inc(labels);
    }
  }

  public recordTimer(name: string, value: number, labels: Record<string, string> = {}): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.observe(labels, value);
    }
  }

  public setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.set(labels, value);
    }
  }

  public incrementGauge(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.inc(labels, value);
    }
  }

  public decrementGauge(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.dec(labels, value);
    }
  }

  public getMetrics(): Promise<string> {
    return register.metrics();
  }

  public getContentType(): string {
    return register.contentType;
  }
}