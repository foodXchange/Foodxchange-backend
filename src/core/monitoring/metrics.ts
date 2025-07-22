/**
 * Metrics Collection System
 * Provides standardized metrics collection and reporting
 */

import { register, Counter, Histogram, Gauge } from 'prom-client';

// HTTP Request metrics
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'tenant_id']
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

// Database metrics
export const databaseConnections = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections'
});

export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5]
});

export const databaseQueryCounter = new Counter({
  name: 'database_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'collection', 'status']
});

// Cache metrics
export const cacheHitCounter = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'key_pattern']
});

export const cacheMissCounter = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'key_pattern']
});

export const cacheOperationDuration = new Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['operation', 'cache_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

// Business metrics
export const businessMetricCounter = new Counter({
  name: 'business_events_total',
  help: 'Total number of business events',
  labelNames: ['event_type', 'tenant_id', 'user_role']
});

export const activeUsersGauge = new Gauge({
  name: 'active_users_current',
  help: 'Current number of active users',
  labelNames: ['tenant_id', 'user_role']
});

export const orderValueHistogram = new Histogram({
  name: 'order_value_dollars',
  help: 'Distribution of order values in dollars',
  labelNames: ['tenant_id', 'currency'],
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000]
});

// RFQ metrics
export const rfqMetrics = {
  created: new Counter({
    name: 'rfqs_created_total',
    help: 'Total number of RFQs created',
    labelNames: ['tenant_id', 'category']
  }),
  
  proposals: new Counter({
    name: 'rfq_proposals_total',
    help: 'Total number of RFQ proposals',
    labelNames: ['tenant_id', 'rfq_category']
  }),

  awarded: new Counter({
    name: 'rfqs_awarded_total',
    help: 'Total number of RFQs awarded',
    labelNames: ['tenant_id', 'category']
  })
};

// Error metrics
export const errorCounter = new Counter({
  name: 'application_errors_total',
  help: 'Total number of application errors',
  labelNames: ['error_type', 'service', 'severity']
});

export const validationErrorCounter = new Counter({
  name: 'validation_errors_total',
  help: 'Total number of validation errors',
  labelNames: ['field', 'validation_type', 'route']
});

// AI Service metrics
export const aiServiceMetrics = {
  requests: new Counter({
    name: 'ai_service_requests_total',
    help: 'Total number of AI service requests',
    labelNames: ['service_type', 'model', 'tenant_id']
  }),

  duration: new Histogram({
    name: 'ai_service_duration_seconds',
    help: 'Duration of AI service calls in seconds',
    labelNames: ['service_type', 'model'],
    buckets: [1, 5, 10, 30, 60, 120, 300]
  }),

  tokens: new Histogram({
    name: 'ai_service_tokens_used',
    help: 'Number of tokens used in AI service calls',
    labelNames: ['service_type', 'model', 'token_type'],
    buckets: [100, 500, 1000, 2000, 5000, 10000, 20000]
  })
};

// Rate limiting metrics
export const rateLimitMetrics = {
  requests: new Counter({
    name: 'rate_limit_requests_total',
    help: 'Total number of rate-limited requests',
    labelNames: ['limit_type', 'tenant_id', 'exceeded']
  }),

  exceeded: new Counter({
    name: 'rate_limit_exceeded_total',
    help: 'Total number of rate limit violations',
    labelNames: ['limit_type', 'tenant_id']
  })
};

// Compliance metrics
export const complianceMetrics = {
  checks: new Counter({
    name: 'compliance_checks_total',
    help: 'Total number of compliance checks',
    labelNames: ['check_type', 'entity_type', 'result']
  }),

  violations: new Counter({
    name: 'compliance_violations_total',
    help: 'Total number of compliance violations',
    labelNames: ['violation_type', 'severity', 'tenant_id']
  })
};

// Export metrics registry
export { register as metricsRegistry };

// Utility functions
export const incrementBusinessEvent = (eventType: string, tenantId?: string, userRole?: string) => {
  businessMetricCounter.inc({
    event_type: eventType,
    tenant_id: tenantId || 'unknown',
    user_role: userRole || 'unknown'
  });
};

export const recordHttpRequest = (method: string, route: string, statusCode: number, duration: number, tenantId?: string) => {
  httpRequestCounter.inc({
    method,
    route,
    status_code: statusCode.toString(),
    tenant_id: tenantId || 'unknown'
  });
  
  httpRequestDuration.observe(
    { method, route, status_code: statusCode.toString() },
    duration
  );
};

export const recordDatabaseQuery = (operation: string, collection: string, duration: number, success: boolean) => {
  databaseQueryCounter.inc({
    operation,
    collection,
    status: success ? 'success' : 'error'
  });
  
  databaseQueryDuration.observe(
    { operation, collection },
    duration
  );
};

export const recordCacheOperation = (operation: 'hit' | 'miss' | 'set' | 'delete', cacheType: string, keyPattern: string, duration?: number) => {
  if (operation === 'hit') {
    cacheHitCounter.inc({ cache_type: cacheType, key_pattern: keyPattern });
  } else if (operation === 'miss') {
    cacheMissCounter.inc({ cache_type: cacheType, key_pattern: keyPattern });
  }
  
  if (duration !== undefined) {
    cacheOperationDuration.observe(
      { operation, cache_type: cacheType },
      duration
    );
  }
};

export const recordError = (errorType: string, service: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
  errorCounter.inc({
    error_type: errorType,
    service,
    severity
  });
};

export const updateActiveUsers = (count: number, tenantId?: string, userRole?: string) => {
  activeUsersGauge.set(
    {
      tenant_id: tenantId || 'unknown',
      user_role: userRole || 'unknown'
    },
    count
  );
};

// Middleware factory for automatic HTTP metrics collection
export const createMetricsMiddleware = () => {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration,
        req.tenantId
      );
    });
    
    next();
  };
};

/**
 * Modern MetricsService class for new architecture
 */
export class MetricsService {
  /**
   * Increment a counter metric
   */
  public incrementCounter(name: string, labels?: Record<string, string>): void {
    // Map to existing prometheus counters based on name
    switch (name) {
      case 'http_requests_total':
        if (labels) {
          httpRequestCounter.inc(labels);
        }
        break;
      case 'database_queries_total':
        if (labels) {
          databaseQueryCounter.inc(labels);
        }
        break;
      case 'cache_hits_total':
        if (labels) {
          cacheHitCounter.inc(labels);
        }
        break;
      case 'cache_misses_total':
        if (labels) {
          cacheMissCounter.inc(labels);
        }
        break;
      case 'application_errors_total':
        if (labels) {
          errorCounter.inc(labels);
        }
        break;
      default:
        // Create dynamic counter if not exists
        const counter = new Counter({
          name,
          help: `Auto-generated counter for ${name}`,
          labelNames: labels ? Object.keys(labels) : []
        });
        counter.inc(labels);
        break;
    }
  }

  /**
   * Set a gauge metric
   */
  public setGauge(name: string, value: number, labels?: Record<string, string>): void {
    switch (name) {
      case 'database_connections_active':
        databaseConnections.set(value);
        break;
      case 'active_users_current':
        if (labels) {
          activeUsersGauge.set(labels, value);
        }
        break;
      default:
        // Create dynamic gauge if not exists
        const gauge = new Gauge({
          name,
          help: `Auto-generated gauge for ${name}`,
          labelNames: labels ? Object.keys(labels) : []
        });
        gauge.set(labels || {}, value);
        break;
    }
  }

  /**
   * Observe a histogram metric
   */
  public observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    // Convert milliseconds to seconds for prometheus
    const secondsValue = name.includes('_ms') ? value / 1000 : value;
    
    switch (name) {
      case 'http_request_duration_ms':
      case 'http_request_duration_seconds':
        if (labels) {
          httpRequestDuration.observe(labels, secondsValue);
        }
        break;
      case 'database_query_duration_ms':
      case 'database_query_duration_seconds':
        if (labels) {
          databaseQueryDuration.observe(labels, secondsValue);
        }
        break;
      case 'cache_operation_duration_ms':
      case 'cache_operation_duration_seconds':
        if (labels) {
          cacheOperationDuration.observe(labels, secondsValue);
        }
        break;
      default:
        // Create dynamic histogram if not exists
        const histogram = new Histogram({
          name: name.replace('_ms', '_seconds'),
          help: `Auto-generated histogram for ${name}`,
          labelNames: labels ? Object.keys(labels) : [],
          buckets: [0.001, 0.01, 0.1, 1, 5, 10, 30, 60]
        });
        histogram.observe(labels || {}, secondsValue);
        break;
    }
  }

  /**
   * Record timer metric (alias for observeHistogram)
   */
  public recordTimer(name: string, duration: number, labels?: Record<string, string>): void {
    this.observeHistogram(name, duration, labels);
  }

  /**
   * Get metrics registry for export
   */
  public getRegistry() {
    return register;
  }
}

export default {
  httpRequestCounter,
  httpRequestDuration,
  databaseConnections,
  databaseQueryDuration,
  databaseQueryCounter,
  cacheHitCounter,
  cacheMissCounter,
  cacheOperationDuration,
  businessMetricCounter,
  activeUsersGauge,
  orderValueHistogram,
  rfqMetrics,
  errorCounter,
  validationErrorCounter,
  aiServiceMetrics,
  rateLimitMetrics,
  complianceMetrics,
  metricsRegistry: register,
  incrementBusinessEvent,
  recordHttpRequest,
  recordDatabaseQuery,
  recordCacheOperation,
  recordError,
  updateActiveUsers,
  createMetricsMiddleware
};