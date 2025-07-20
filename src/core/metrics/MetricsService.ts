import * as promClient from 'prom-client';

import { Logger } from '../logging/logger';

const logger = new Logger('MetricsService');

export class MetricsService {
  private readonly register: promClient.Registry;
  private readonly counters: Map<string, promClient.Counter>;
  private readonly gauges: Map<string, promClient.Gauge>;
  private readonly histograms: Map<string, promClient.Histogram>;
  private readonly summaries: Map<string, promClient.Summary>;

  constructor() {
    this.register = new promClient.Registry();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.summaries = new Map();

    // Register default metrics
    promClient.collectDefaultMetrics({ register: this.register });

    // Initialize common metrics
    this.initializeMetrics();
  }

  private initializeMetrics() {
    // HTTP metrics
    this.createHistogram('http_request_duration_seconds', 'Duration of HTTP requests in seconds', ['method', 'route', 'status_code']);
    this.createCounter('http_requests_total', 'Total number of HTTP requests', ['method', 'route', 'status_code']);

    // Business metrics
    this.createCounter('user_registrations_total', 'Total number of user registrations', ['user_type']);
    this.createCounter('login_attempts_total', 'Total number of login attempts', ['status']);
    this.createCounter('orders_total', 'Total number of orders', ['status', 'payment_method']);
    this.createGauge('active_users', 'Number of active users', ['user_type']);

    // Performance metrics
    this.createHistogram('database_query_duration_seconds', 'Duration of database queries', ['operation', 'collection']);
    this.createHistogram('external_api_duration_seconds', 'Duration of external API calls', ['service', 'endpoint']);

    // Error metrics
    this.createCounter('errors_total', 'Total number of errors', ['error_type', 'service']);
    this.createCounter('unhandled_rejections_total', 'Total number of unhandled promise rejections');
  }

  // Counter methods
  createCounter(name: string, help: string, labels: string[] = []): promClient.Counter {
    const counter = new promClient.Counter({
      name,
      help,
      labelNames: labels,
      registers: [this.register]
    });
    this.counters.set(name, counter);
    return counter;
  }

  incrementCounter(name: string, labels?: Record<string, string | number>) {
    const counter = this.counters.get(name);
    if (!counter) {
      logger.warn(`Counter ${name} not found`);
      return;
    }
    counter.inc(labels as any);
  }

  // Gauge methods
  createGauge(name: string, help: string, labels: string[] = []): promClient.Gauge {
    const gauge = new promClient.Gauge({
      name,
      help,
      labelNames: labels,
      registers: [this.register]
    });
    this.gauges.set(name, gauge);
    return gauge;
  }

  setGauge(name: string, value: number, labels?: Record<string, string | number>) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      logger.warn(`Gauge ${name} not found`);
      return;
    }
    gauge.set(labels as any, value);
  }

  incrementGauge(name: string, value: number = 1, labels?: Record<string, string | number>) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      logger.warn(`Gauge ${name} not found`);
      return;
    }
    gauge.inc(labels as any, value);
  }

  decrementGauge(name: string, value: number = 1, labels?: Record<string, string | number>) {
    const gauge = this.gauges.get(name);
    if (!gauge) {
      logger.warn(`Gauge ${name} not found`);
      return;
    }
    gauge.dec(labels as any, value);
  }

  // Histogram methods
  createHistogram(name: string, help: string, labels: string[] = [], buckets?: number[]): promClient.Histogram {
    const histogram = new promClient.Histogram({
      name,
      help,
      labelNames: labels,
      buckets: buckets || promClient.exponentialBuckets(0.001, 2, 10),
      registers: [this.register]
    });
    this.histograms.set(name, histogram);
    return histogram;
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string | number>) {
    const histogram = this.histograms.get(name);
    if (!histogram) {
      logger.warn(`Histogram ${name} not found`);
      return;
    }
    histogram.observe(labels as any, value);
  }

  // Summary methods
  createSummary(name: string, help: string, labels: string[] = [], percentiles?: number[]): promClient.Summary {
    const summary = new promClient.Summary({
      name,
      help,
      labelNames: labels,
      percentiles: percentiles || [0.5, 0.9, 0.95, 0.99],
      registers: [this.register]
    });
    this.summaries.set(name, summary);
    return summary;
  }

  recordSummary(name: string, value: number, labels?: Record<string, string | number>) {
    const summary = this.summaries.get(name);
    if (!summary) {
      logger.warn(`Summary ${name} not found`);
      return;
    }
    summary.observe(labels as any, value);
  }

  // Timer utility
  startTimer(histogramName: string): () => void {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      this.recordHistogram(histogramName, duration);
    };
  }

  // Record timer duration in milliseconds
  recordTimer(name: string, duration: number, labels?: Record<string, string | number>) {
    // Convert milliseconds to seconds for Prometheus
    this.recordHistogram(name, duration / 1000, labels);
  }

  // Get metrics for Prometheus
  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  // Get metrics as JSON
  async getMetricsJSON() {
    return this.register.getMetricsAsJSON();
  }

  // Reset all metrics
  reset() {
    this.register.resetMetrics();
  }

  // Common metric recording methods
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    const labels = { method, route, status_code: statusCode.toString() };
    this.incrementCounter('http_requests_total', labels);
    this.recordHistogram('http_request_duration_seconds', duration / 1000, labels);
  }

  recordDatabaseQuery(operation: string, collection: string, duration: number) {
    this.recordHistogram('database_query_duration_seconds', duration / 1000, { operation, collection });
  }

  recordError(errorType: string, service: string) {
    this.incrementCounter('errors_total', { error_type: errorType, service });
  }

  recordLogin(success: boolean) {
    this.incrementCounter('login_attempts_total', { status: success ? 'success' : 'failure' });
  }

  recordUserRegistration(userType: string) {
    this.incrementCounter('user_registrations_total', { user_type: userType });
  }

  recordOrder(status: string, paymentMethod: string) {
    this.incrementCounter('orders_total', { status, payment_method: paymentMethod });
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
