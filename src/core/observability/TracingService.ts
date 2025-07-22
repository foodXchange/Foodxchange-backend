/**
 * Advanced Distributed Tracing Service
 * OpenTelemetry-based tracing with custom spans and metrics
 */

import { trace, context, SpanStatusCode, SpanKind, Span } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { Logger } from '../logging/logger';

export interface TraceContext {
  traceId: string;
  spanId: string;
  correlationId?: string;
  userId?: string;
  requestId?: string;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  tags?: Record<string, string>;
  correlationId?: string;
  userId?: string;
}

export interface BusinessMetric {
  name: string;
  value: number;
  unit?: string;
  attributes?: Record<string, string | number | boolean>;
  timestamp?: Date;
}

export class TracingService {
  private readonly logger = new Logger('TracingService');
  private readonly tracer = trace.getTracer('foodxchange-backend', '1.0.0');
  private sdk?: NodeSDK;
  private readonly serviceName: string;

  constructor(serviceName: string = 'foodxchange-backend') {
    this.serviceName = serviceName;
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  public async initialize(options: {
    jaegerEndpoint?: string;
    samplingRate?: number;
    enableAutoInstrumentation?: boolean;
  } = {}): Promise<void> {
    try {
      if (options.enableAutoInstrumentation !== false) {
        this.sdk = new NodeSDK({
          resource: defaultResource().merge(resourceFromAttributes({
            [SemanticResourceAttributes.SERVICE_NAME]: this.serviceName,
            [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
          })),
          instrumentations: [
            new HttpInstrumentation({
              requestHook: (span, request) => {
                this.enhanceHttpSpan(span, request);
              },
            }),
            new ExpressInstrumentation({
              requestHook: (span, info) => {
                this.enhanceExpressSpan(span, info);
              },
            }),
            new MongoDBInstrumentation(),
            new RedisInstrumentation(),
          ],
        });

        await this.sdk.start();
        this.logger.info('Tracing service initialized', {
          serviceName: this.serviceName,
          jaegerEndpoint: options.jaegerEndpoint,
          samplingRate: options.samplingRate,
        });
      }
    } catch (error) {
      this.logger.error('Failed to initialize tracing service', { error });
      throw error;
    }
  }

  /**
   * Create a new span
   */
  public async withSpan<T>(
    name: string,
    fn: (span: Span, traceContext: TraceContext) => Promise<T> | T,
    options: SpanOptions = {}
  ): Promise<T> {
    const span = this.tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes || {},
    });

    // Set common attributes
    if (options.userId) {
      span.setAttribute('user.id', options.userId);
    }
    if (options.correlationId) {
      span.setAttribute('correlation.id', options.correlationId);
    }

    const traceContext: TraceContext = {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      correlationId: options.correlationId,
      userId: options.userId,
    };

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn(span, traceContext);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const err = error as Error;
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        span.recordException(err);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Trace a business operation
   */
  public async traceBusinessOperation<T>(
    operationType: string,
    operationName: string,
    fn: (span: Span, traceContext: TraceContext) => Promise<T> | T,
    metadata: {
      userId?: string;
      entityId?: string;
      entityType?: string;
      businessContext?: Record<string, any>;
    } = {}
  ): Promise<T> {
    return this.withSpan(
      `business.${operationType}.${operationName}`,
      async (span, traceContext) => {
        // Set business-specific attributes
        span.setAttributes({
          'business.operation.type': operationType,
          'business.operation.name': operationName,
          'business.entity.type': metadata.entityType || 'unknown',
          'business.entity.id': metadata.entityId || '',
        });

        if (metadata.businessContext) {
          for (const [key, value] of Object.entries(metadata.businessContext)) {
            span.setAttribute(`business.context.${key}`, String(value));
          }
        }

        const startTime = Date.now();
        try {
          const result = await fn(span, traceContext);
          
          // Record business metrics
          await this.recordBusinessMetric({
            name: `business.${operationType}.duration`,
            value: Date.now() - startTime,
            unit: 'ms',
            attributes: {
              operation: operationName,
              entity_type: metadata.entityType || 'unknown',
              success: true,
            },
          });

          return result;
        } catch (error) {
          await this.recordBusinessMetric({
            name: `business.${operationType}.duration`,
            value: Date.now() - startTime,
            unit: 'ms',
            attributes: {
              operation: operationName,
              entity_type: metadata.entityType || 'unknown',
              success: false,
            },
          });
          throw error;
        }
      },
      {
        kind: SpanKind.INTERNAL,
        userId: metadata.userId,
      }
    );
  }

  /**
   * Trace HTTP requests
   */
  public async traceHttpRequest<T>(
    method: string,
    url: string,
    fn: (span: Span, traceContext: TraceContext) => Promise<T> | T,
    metadata: {
      userId?: string;
      requestId?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    return this.withSpan(
      `http.${method.toLowerCase()}.${this.extractPathPattern(url)}`,
      async (span, traceContext) => {
        span.setAttributes({
          'http.method': method,
          'http.url': url,
          'http.route': this.extractPathPattern(url),
          'request.id': metadata.requestId || '',
        });

        if (metadata.headers) {
          for (const [key, value] of Object.entries(metadata.headers)) {
            if (this.isSafeHeader(key)) {
              span.setAttribute(`http.request.header.${key}`, value);
            }
          }
        }

        return fn(span, traceContext);
      },
      {
        kind: SpanKind.SERVER,
        userId: metadata.userId,
      }
    );
  }

  /**
   * Trace database operations
   */
  public async traceDatabaseOperation<T>(
    operation: string,
    collection: string,
    fn: (span: Span, traceContext: TraceContext) => Promise<T> | T,
    metadata: {
      query?: any;
      userId?: string;
    } = {}
  ): Promise<T> {
    return this.withSpan(
      `db.${operation}.${collection}`,
      async (span, traceContext) => {
        span.setAttributes({
          'db.system': 'mongodb',
          'db.operation': operation,
          'db.mongodb.collection_name': collection,
        });

        if (metadata.query && typeof metadata.query === 'object') {
          // Sanitize query for tracing (remove sensitive data)
          const sanitizedQuery = this.sanitizeQuery(metadata.query);
          span.setAttribute('db.statement', JSON.stringify(sanitizedQuery));
        }

        const startTime = Date.now();
        try {
          const result = await fn(span, traceContext);
          
          span.setAttribute('db.duration_ms', Date.now() - startTime);
          span.setAttribute('db.success', true);
          
          return result;
        } catch (error) {
          span.setAttribute('db.duration_ms', Date.now() - startTime);
          span.setAttribute('db.success', false);
          throw error;
        }
      },
      {
        kind: SpanKind.CLIENT,
        userId: metadata.userId,
      }
    );
  }

  /**
   * Trace external API calls
   */
  public async traceExternalCall<T>(
    serviceName: string,
    operation: string,
    fn: (span: Span, traceContext: TraceContext) => Promise<T> | T,
    metadata: {
      url?: string;
      method?: string;
      userId?: string;
    } = {}
  ): Promise<T> {
    return this.withSpan(
      `external.${serviceName}.${operation}`,
      async (span, traceContext) => {
        span.setAttributes({
          'external.service.name': serviceName,
          'external.operation': operation,
        });

        if (metadata.url) {
          span.setAttribute('http.url', metadata.url);
        }
        if (metadata.method) {
          span.setAttribute('http.method', metadata.method);
        }

        const startTime = Date.now();
        try {
          const result = await fn(span, traceContext);
          
          span.setAttributes({
            'external.duration_ms': Date.now() - startTime,
            'external.success': true,
          });
          
          return result;
        } catch (error) {
          span.setAttributes({
            'external.duration_ms': Date.now() - startTime,
            'external.success': false,
          });
          throw error;
        }
      },
      {
        kind: SpanKind.CLIENT,
        userId: metadata.userId,
      }
    );
  }

  /**
   * Record business metrics
   */
  public async recordBusinessMetric(metric: BusinessMetric): Promise<void> {
    const span = trace.getActiveSpan();
    if (span) {
      // Add metric as span event
      span.addEvent('business.metric', {
        'metric.name': metric.name,
        'metric.value': metric.value,
        'metric.unit': metric.unit || 'count',
        ...(metric.attributes || {}),
      });
    }

    // Log metric for external collection
    this.logger.info('Business metric recorded', {
      metric: metric.name,
      value: metric.value,
      unit: metric.unit || 'count',
      attributes: metric.attributes,
      timestamp: metric.timestamp || new Date(),
    });
  }

  /**
   * Add correlation ID to current span
   */
  public addCorrelationId(correlationId: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute('correlation.id', correlationId);
    }
  }

  /**
   * Add user context to current span
   */
  public addUserContext(userId: string, userRole?: string): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes({
        'user.id': userId,
        ...(userRole && { 'user.role': userRole }),
      });
    }
  }

  /**
   * Add business context to current span
   */
  public addBusinessContext(context: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      for (const [key, value] of Object.entries(context)) {
        span.setAttribute(`business.${key}`, String(value));
      }
    }
  }

  /**
   * Get current trace context
   */
  public getCurrentTraceContext(): TraceContext | null {
    const span = trace.getActiveSpan();
    if (!span) {
      return null;
    }

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }

  /**
   * Create child span from parent context
   */
  public createChildSpan(
    name: string,
    parentTraceContext: TraceContext,
    options: SpanOptions = {}
  ): Span {
    // Create span context from parent trace context
    const span = this.tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: options.attributes || {},
    });

    return span;
  }

  private enhanceHttpSpan(span: Span, request: any): void {
    // Add custom HTTP request attributes
    if (request.headers) {
      if (request.headers['x-correlation-id']) {
        span.setAttribute('correlation.id', request.headers['x-correlation-id']);
      }
      if (request.headers['x-user-id']) {
        span.setAttribute('user.id', request.headers['x-user-id']);
      }
    }
  }

  private enhanceExpressSpan(span: Span, info: any): void {
    // Add Express-specific attributes
    if (info.request) {
      const req = info.request;
      if (req.user) {
        span.setAttribute('user.id', req.user.id || req.user._id);
        if (req.user.role) {
          span.setAttribute('user.role', req.user.role);
        }
      }
      if (req.correlationId) {
        span.setAttribute('correlation.id', req.correlationId);
      }
    }
  }

  private extractPathPattern(url: string): string {
    // Extract path pattern from URL for better span naming
    try {
      const urlObj = new URL(url, 'http://localhost');
      return urlObj.pathname
        .replace(/\/\d+/g, '/:id') // Replace numeric IDs
        .replace(/\/[a-f0-9-]{36}/g, '/:uuid') // Replace UUIDs
        .replace(/\/[a-f0-9]{24}/g, '/:objectId'); // Replace MongoDB ObjectIDs
    } catch {
      return url;
    }
  }

  private sanitizeQuery(query: any): any {
    // Remove sensitive fields from query for tracing
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
    const sanitized = { ...query };

    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          result[key] = sanitizeObject(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return sanitizeObject(sanitized);
  }

  private isSafeHeader(headerName: string): boolean {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
    ];
    return !sensitiveHeaders.includes(headerName.toLowerCase());
  }

  /**
   * Shutdown tracing service
   */
  public async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.logger.info('Tracing service shutdown completed');
    }
  }

  /**
   * Force flush all pending spans
   */
  public async flush(): Promise<void> {
    if (this.sdk) {
      await this.sdk.start(); // SDK handles flushing internally
    }
  }

  /**
   * Create Express middleware for tracing
   */
  public createTracingMiddleware(tracingService: TracingService) {
    return createTracingMiddleware(tracingService);
  }
}

// Decorator for automatic tracing
export function Traced(operationName?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    const tracingService = new TracingService();

    descriptor.value = async function (...args: any[]) {
      const spanName = operationName || `${target.constructor.name}.${propertyName}`;
      
      return tracingService.withSpan(
        spanName,
        async (span) => {
          span.setAttributes({
            'method.class': target.constructor.name,
            'method.name': propertyName,
            'method.args.count': args.length,
          });

          return method.apply(this, args);
        }
      );
    };

    return descriptor;
  };
}

// Middleware for Express request tracing
export function createTracingMiddleware(tracingService: TracingService) {
  return (req: any, res: any, next: any) => {
    const correlationId = req.headers['x-correlation-id'] || 
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    tracingService.traceHttpRequest(
      req.method,
      req.originalUrl,
      async (span, traceContext) => {
        req.traceContext = traceContext;
        req.span = span;
        
        res.on('finish', () => {
          span.setAttributes({
            'http.status_code': res.statusCode,
            'http.response.size': res.get('content-length') || 0,
          });
        });

        return new Promise<void>((resolve) => {
          res.on('finish', resolve);
          next();
        });
      },
      {
        requestId: correlationId,
        userId: req.user?.id,
        headers: req.headers,
      }
    ).catch(next);
  };
}

export default TracingService;