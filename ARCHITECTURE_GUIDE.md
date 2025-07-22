# FoodXchange Advanced Architecture Guide

## Overview

The FoodXchange backend has been completely transformed with enterprise-grade architectural patterns to ensure scalability, reliability, and maintainability. This guide provides comprehensive documentation on the new architecture components and how to use them.

## Architecture Components

### 1. Dependency Injection Container (`AdvancedContainer`)

**Location**: `src/core/container/AdvancedContainer.ts`

Enterprise-grade IoC container with lifecycle management, decorators, and async resolution.

#### Features:
- **Service Lifecycles**: Singleton, Transient, Scoped, Request
- **Async Resolution**: Full support for async service creation
- **Decorator Support**: `@Injectable` and `@Inject` decorators
- **Lifecycle Hooks**: onActivation and onDeactivation callbacks
- **Tag-based Resolution**: Find services by tags

#### Usage Example:
```typescript
import { AdvancedContainer, Injectable, Inject } from './core/container/AdvancedContainer';

@Injectable({ lifecycle: 'singleton', tags: ['service'] })
class UserService {
  constructor(
    @Inject('Database') private db: Database,
    @Inject('Logger') private logger: Logger
  ) {}
}

// Register services
const container = AdvancedContainer.getInstance();
await container.start();

// Resolve services
const userService = await container.resolve<UserService>('UserService');
```

### 2. Event-Driven Architecture (`EventBus`)

**Location**: `src/core/events/EventBus.ts`

Supports domain events, integration events, and event sourcing patterns with Redis Streams.

#### Features:
- **Domain Events**: For internal business logic
- **Integration Events**: For external system communication
- **Retry Policies**: Exponential, linear, and fixed backoff
- **Dead Letter Queue**: Failed event handling
- **Event Sourcing**: Built-in event store
- **Redis Streams**: Distributed event processing

#### Usage Example:
```typescript
import { EventBus, EventFactory } from './core/events/EventBus';

// Create and publish domain event
const event = EventFactory.createDomainEvent(
  'user.created',
  userId,
  'User',
  1,
  { name: 'John Doe', email: 'john@example.com' },
  userId
);

await eventBus.publishDomainEvent(event);

// Subscribe to events
eventBus.subscribe('user.created', {
  handle: async (event) => {
    console.log('User created:', event.data);
  }
}, {
  retryPolicy: { type: 'exponential', initialDelay: 1000, maxDelay: 30000 },
  maxRetries: 3
});
```

### 3. Multi-Level Caching (`AdvancedCacheService`)

**Location**: `src/core/cache/AdvancedCacheService.ts`

Implements L1 (Memory), L2 (Redis), and L3 strategies with intelligent cache management.

#### Features:
- **L1 Cache**: In-memory using node-cache
- **L2 Cache**: Redis with compression
- **Smart Level Selection**: Automatic optimal level determination
- **Tag-based Invalidation**: Group-based cache clearing
- **Compression**: Automatic compression for large data
- **Warmup Strategies**: Eager, lazy, and background warming

#### Usage Example:
```typescript
import { AdvancedCacheService } from './core/cache/AdvancedCacheService';

// Cache with options
await cache.set('user:123', userData, {
  ttl: 300,
  level: 'L2',
  tags: ['user', 'profile'],
  compress: true
});

// Get with fallback
const user = await cache.getOrSet('user:123', async () => {
  return await userService.findById(123);
}, { ttl: 300 });

// Invalidate by tag
await cache.invalidateByTag('user');
```

### 4. Circuit Breaker Pattern (`CircuitBreaker`)

**Location**: `src/core/resilience/CircuitBreaker.ts`

Provides fault tolerance and prevents cascading failures with configurable thresholds.

#### Features:
- **Three States**: Closed, Open, Half-Open
- **Configurable Thresholds**: Failure count and time-based
- **Fallback Support**: Custom fallback functions
- **Retry Logic**: Built-in exponential backoff
- **Metrics Integration**: Comprehensive monitoring
- **Circuit Breaker Manager**: Centralized management

#### Usage Example:
```typescript
import { CircuitBreakerManager, CircuitBreakerTemplates } from './core/resilience/CircuitBreaker';

const manager = new CircuitBreakerManager(metrics);

// Execute with circuit breaker protection
const result = await manager.execute('external-api', async () => {
  return await externalApiCall();
}, CircuitBreakerTemplates.externalApi('payment-service'));

// Create custom circuit breaker
const breaker = manager.getCircuitBreaker('database', {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  fallback: () => ({ error: 'Service unavailable' })
});
```

### 5. Distributed Tracing (`TracingService`)

**Location**: `src/core/observability/TracingService.ts`

OpenTelemetry-based tracing with custom spans and business metrics.

#### Features:
- **OpenTelemetry Integration**: Industry-standard tracing
- **Business Operation Tracing**: Domain-specific spans
- **HTTP Request Tracing**: Automatic request instrumentation
- **Database Operation Tracing**: Query performance tracking
- **External API Tracing**: Third-party service monitoring
- **Correlation IDs**: Request correlation across services

#### Usage Example:
```typescript
import { TracingService } from './core/observability/TracingService';

const tracing = new TracingService('foodxchange-backend');
await tracing.initialize();

// Trace business operation
await tracing.traceBusinessOperation(
  'order',
  'create',
  async (span, context) => {
    span.setAttribute('order.total', orderTotal);
    return await orderService.create(orderData);
  },
  {
    userId: user.id,
    entityType: 'Order',
    businessContext: { total: orderTotal }
  }
);
```

### 6. Database Optimization (`DatabaseOptimizer`)

**Location**: `src/core/database/DatabaseOptimizer.ts`

Advanced database optimization with connection pooling, query optimization, and monitoring.

#### Features:
- **Connection Pooling**: Optimized connection management
- **Read/Write Splitting**: Replica connection support
- **Query Caching**: Intelligent query result caching
- **Slow Query Analysis**: Performance monitoring
- **Index Optimization**: Automatic index suggestions
- **Query Metrics**: Comprehensive query analytics

#### Usage Example:
```typescript
import { DatabaseOptimizer } from './core/database/DatabaseOptimizer';

const optimizer = new DatabaseOptimizer(config, metrics, cache, circuitBreaker);
await optimizer.initialize();

// Execute optimized query
const users = await optimizer.executeQuery<User[]>(
  'User',
  'find',
  { filter: { status: 'active' } },
  {
    useCache: true,
    cacheKey: 'active-users',
    cacheTtl: 300
  }
);

// Optimize indexes
const createdIndexes = await optimizer.optimizeIndexes('Order');
```

### 7. Advanced Security (`AdvancedSecurityService`)

**Location**: `src/core/security/AdvancedSecurityService.ts`

Enterprise-grade security with rate limiting, threat detection, and API key management.

#### Features:
- **Multi-Level Rate Limiting**: Global, IP, and user-based
- **Threat Detection**: Pattern-based suspicious activity detection
- **API Key Management**: Automatic rotation and permissions
- **Data Encryption**: AES-256-GCM encryption
- **Security Auditing**: Comprehensive audit trail
- **Auto-Blocking**: Automatic threat response

#### Usage Example:
```typescript
import { AdvancedSecurityService } from './core/security/AdvancedSecurityService';

// Rate limiting check
const rateLimit = await security.checkRateLimit(req);
if (!rateLimit.allowed) {
  return res.status(429).json({ error: 'Rate limit exceeded' });
}

// Threat analysis
const threat = await security.analyzeThreat(req);
if (threat.recommendedAction === 'block') {
  return res.status(403).json({ error: 'Request blocked' });
}

// Generate API key
const apiKey = await security.generateApiKey(
  userId,
  ['read', 'write'],
  30 * 24 * 60 * 60 * 1000 // 30 days
);
```

### 8. Error Handling (`AdvancedErrorHandler`)

**Location**: `src/core/error/AdvancedErrorHandler.ts`

Comprehensive error handling with automatic recovery, pattern matching, and dead letter queues.

#### Features:
- **Error Pattern Matching**: Automatic error categorization
- **Recovery Strategies**: Retry, fallback, circuit breaker
- **Dead Letter Queue**: Failed operation queuing
- **Error Analysis**: Frequency and pattern analysis
- **Automatic Alerting**: Threshold-based notifications
- **Express Middleware**: Seamless Express integration

#### Usage Example:
```typescript
import { AdvancedErrorHandler } from './core/error/AdvancedErrorHandler';

// Express middleware
app.use(errorHandler.middleware());

// Execute with recovery
const result = await errorHandler.executeWithRecovery(
  async () => {
    return await riskyOperation();
  },
  {
    operationName: 'risky-operation',
    context: { userId: user.id },
    timeout: 5000
  }
);

// Add custom error pattern
errorHandler.addErrorPattern({
  name: 'CustomTimeout',
  matcher: (error) => error.message.includes('custom timeout'),
  severity: 'high',
  recovery: { type: 'retry', maxAttempts: 3 }
});
```

### 9. Performance Optimization (`PerformanceOptimizer`)

**Location**: `src/core/performance/PerformanceOptimizer.ts`

Advanced performance patterns including compression, batching, and resource pooling.

#### Features:
- **Response Compression**: Gzip, deflate, brotli
- **Request Batching**: Automatic request aggregation
- **Resource Pooling**: Connection and resource management
- **CDN Integration**: Static asset optimization
- **Performance Monitoring**: Real-time metrics
- **Smart Optimization**: Context-aware optimization

#### Usage Example:
```typescript
import { PerformanceOptimizer } from './core/performance/PerformanceOptimizer';

// Use middleware
app.use(performance.performanceMiddleware());
app.use(performance.compressionMiddleware());

// Batch requests
const results = await performance.batchRequest(
  'user-lookup',
  'findUsers',
  userIds,
  async (requests) => {
    const ids = requests.map(r => r.data);
    return await userService.findByIds(ids);
  }
);

// Create resource pool
performance.createResourcePool(
  'database-connections',
  () => createDatabaseConnection(),
  (conn) => conn.close(),
  (conn) => conn.isValid()
);
```

### 10. Architecture Integration (`ArchitectureIntegrator`)

**Location**: `src/core/integration/ArchitectureIntegrator.ts`

Orchestrates all components and provides unified initialization.

#### Features:
- **Unified Initialization**: Single entry point for all services
- **Service Registration**: Automatic DI container setup
- **Middleware Stack**: Pre-configured Express middleware
- **Health Checks**: Comprehensive system health monitoring
- **Graceful Shutdown**: Proper cleanup and resource management

#### Usage Example:
```typescript
import { ArchitectureIntegrator, createDefaultConfig } from './core/integration/ArchitectureIntegrator';

// Initialize architecture
const config = createDefaultConfig();
const integrator = new ArchitectureIntegrator(config);
const services = await integrator.initialize();

// Use middleware stack
const middlewares = integrator.createMiddlewareStack();
app.use(middlewares);

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = await integrator.getHealthStatus();
  res.json(health);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await integrator.shutdown();
  process.exit(0);
});
```

## Integration with Existing Code

### Server Initialization

Update your `src/server.ts`:

```typescript
import { ArchitectureIntegrator, createDefaultConfig } from './core/integration/ArchitectureIntegrator';

async function startServer() {
  try {
    // Initialize advanced architecture
    const config = createDefaultConfig();
    const integrator = new ArchitectureIntegrator(config);
    const services = await integrator.initialize();

    // Apply middleware stack
    const middlewares = integrator.createMiddlewareStack();
    app.use(middlewares);

    // Add health check
    app.get('/health', async (req, res) => {
      const health = await integrator.getHealthStatus();
      res.json(health);
    });

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down gracefully...');
      server.close();
      await integrator.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

### Controller Updates

Example controller using new architecture:

```typescript
import { Request, Response } from 'express';
import { AdvancedContainer } from '../core/container/AdvancedContainer';

export class UserController {
  private readonly container = AdvancedContainer.getInstance();

  async createUser(req: Request, res: Response) {
    try {
      // Get services from container
      const userService = await this.container.resolve<UserService>('UserService');
      const eventBus = await this.container.resolve<EventBus>('EventBus');
      const tracing = await this.container.resolve<TracingService>('TracingService');

      // Execute with tracing
      const user = await tracing.traceBusinessOperation(
        'user',
        'create',
        async () => {
          return await userService.create(req.body);
        },
        {
          userId: req.user?.id,
          entityType: 'User'
        }
      );

      // Publish domain event
      const event = EventFactory.createDomainEvent(
        'user.created',
        user.id,
        'User',
        1,
        { name: user.name, email: user.email },
        req.user?.id
      );
      await eventBus.publishDomainEvent(event);

      res.status(201).json({ success: true, data: user });

    } catch (error) {
      // Error handler will catch and process this
      throw error;
    }
  }
}
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Tracing Configuration
JAEGER_ENDPOINT=http://localhost:14268/api/traces
TRACING_SAMPLE_RATE=0.1

# Security Configuration
ENCRYPTION_KEY=your-256-bit-encryption-key-here

# Performance Configuration
ENABLE_COMPRESSION=true
ENABLE_REQUEST_BATCHING=true
ENABLE_RESOURCE_POOLING=true

# Database Configuration
ENABLE_QUERY_OPTIMIZATION=true
ENABLE_READ_WRITE_SPLIT=false
SLOW_QUERY_THRESHOLD=1000
```

### Custom Configuration

```typescript
import { ArchitectureConfig } from './core/integration/ArchitectureIntegrator';

const customConfig: ArchitectureConfig = {
  database: {
    primary: { uri: process.env.MONGODB_URI },
    enableQueryOptimization: true,
    enableReadWriteSplit: false,
    poolSize: 20,
    maxPoolSize: 100,
    minPoolSize: 5
  },
  security: {
    rateLimiting: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 1000,
      maxRequestsPerUser: 500,
      maxRequestsPerIP: 100
    }
  },
  performance: {
    compression: {
      enabled: true,
      threshold: 1024,
      algorithms: ['gzip', 'brotli'],
      level: 6
    }
  }
  // ... other configuration
};
```

## Monitoring and Observability

### Metrics

All components automatically emit metrics to the MetricsService. Key metrics include:

- **Request Metrics**: Duration, throughput, error rates
- **Cache Metrics**: Hit rates, sizes, performance
- **Database Metrics**: Query performance, connection pool stats
- **Security Metrics**: Rate limit violations, threat detections
- **Circuit Breaker Metrics**: State changes, failure rates

### Health Checks

The `/health` endpoint provides comprehensive system status:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": { "connections": { "primary": true, "replicas": 2 } },
    "cache": { "l1": { "hitRate": 0.85 }, "l2": { "hitRate": 0.92 } },
    "security": { "blockedIPs": 0, "activeApiKeys": 150 },
    "circuitBreakers": { "healthy": true }
  },
  "metrics": {
    "memoryUsage": { "heapUsed": 256, "heapTotal": 512 },
    "uptime": 3600,
    "nodeVersion": "v18.17.0"
  }
}
```

## Best Practices

### 1. Service Registration

Always register services in the DI container:

```typescript
// Register with proper lifecycle
container.register('MyService', MyService, { 
  lifecycle: 'singleton',
  tags: ['business-service']
});
```

### 2. Error Handling

Use the error handler for all operations:

```typescript
const result = await errorHandler.executeWithRecovery(
  async () => await riskyOperation(),
  { operationName: 'my-operation' }
);
```

### 3. Caching Strategy

Layer your caching appropriately:

```typescript
// Fast, small data in L1
await cache.set('user-session', session, { level: 'L1', ttl: 300 });

// Larger data in L2 with compression
await cache.set('user-profile', profile, { 
  level: 'L2', 
  ttl: 3600, 
  compress: true,
  tags: ['user']
});
```

### 4. Event Publishing

Use appropriate event types:

```typescript
// Internal business logic
await eventBus.publishDomainEvent(domainEvent);

// External system integration
await eventBus.publishIntegrationEvent(integrationEvent);
```

### 5. Security

Always check security constraints:

```typescript
// Rate limiting
const rateLimit = await security.checkRateLimit(req);
if (!rateLimit.allowed) throw new Error('Rate limited');

// Threat analysis
const threat = await security.analyzeThreat(req);
if (threat.threatLevel === 'critical') throw new Error('Blocked');
```

## Troubleshooting

### Common Issues

1. **Container Resolution Errors**: Ensure all dependencies are registered
2. **Cache Misses**: Check TTL settings and key generation
3. **Circuit Breaker Opens**: Review failure thresholds and fallback strategies
4. **High Memory Usage**: Monitor cache sizes and enable compression
5. **Slow Performance**: Check database queries and enable optimizations

### Debug Logging

Enable debug logging for specific components:

```typescript
process.env.LOG_LEVEL = 'debug';
process.env.DEBUG_COMPONENTS = 'container,cache,circuit-breaker';
```

### Performance Analysis

Use the performance metrics to identify bottlenecks:

```typescript
const metrics = performance.getMetrics();
console.log('P95 Response Time:', metrics.p95ResponseTime);
console.log('Cache Hit Rate:', metrics.cacheHitRate);
console.log('Throughput:', metrics.throughput);
```

## Migration Guide

### From Legacy Code

1. **Initialize Architecture**: Replace manual service initialization with ArchitectureIntegrator
2. **Update Controllers**: Use DI container for service resolution
3. **Add Error Handling**: Wrap operations with error handler
4. **Enable Caching**: Add caching to expensive operations
5. **Add Monitoring**: Implement health checks and metrics

### Breaking Changes

- Manual service instantiation is replaced by DI container
- Error handling requires using the new error handler patterns
- Database queries should use the optimizer for best performance
- Security middleware replaces manual rate limiting

## Future Enhancements

The architecture is designed to support:

- **Microservices**: Easy service extraction and communication
- **Multi-tenant**: Scoped services and data isolation
- **Real-time**: WebSocket integration with event bus
- **AI/ML**: Model serving and inference pipelines
- **Blockchain**: Distributed ledger integration

This architecture provides a solid foundation for scaling the FoodXchange platform to enterprise levels while maintaining code quality and developer productivity.