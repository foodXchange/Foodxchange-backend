/**
 * Architecture Integration Service
 * Orchestrates all advanced architecture components and provides unified initialization
 */

import Redis from 'ioredis';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { AdvancedContainer } from '../container/AdvancedContainer';
import { EventBus } from '../events/EventBus';
import { AdvancedCacheService } from '../cache/AdvancedCacheService';
import { CircuitBreaker, CircuitBreakerManager } from '../resilience/CircuitBreaker';
import { TracingService } from '../observability/TracingService';
import { DatabaseOptimizer } from '../database/DatabaseOptimizer';
import { AdvancedSecurityService } from '../security/AdvancedSecurityService';
import { AdvancedErrorHandler } from '../error/AdvancedErrorHandler';
import { PerformanceOptimizer } from '../performance/PerformanceOptimizer';

export interface ArchitectureConfig {
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  database: {
    primary: {
      uri: string;
    };
    replicas?: Array<{
      uri: string;
      weight: number;
    }>;
    poolSize: number;
    maxPoolSize: number;
    minPoolSize: number;
    acquireTimeoutMillis: number;
    enableQueryOptimization: boolean;
    enableReadWriteSplit: boolean;
    enableQueryCache: boolean;
    slowQueryThreshold: number;
  };
  security: {
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
      maxRequestsPerUser: number;
      maxRequestsPerIP: number;
      skipSuccessfulRequests: boolean;
      skipFailedRequests: boolean;
    };
    apiKeys: {
      rotationIntervalMs: number;
      keyLength: number;
      algorithm: string;
    };
    encryption: {
      algorithm: string;
      keyLength: number;
      ivLength: number;
    };
    threatDetection: {
      maxFailedAttempts: number;
      suspiciousActivityThreshold: number;
      blockDurationMs: number;
      geoLocationEnabled: boolean;
    };
    audit: {
      enabled: boolean;
      retentionDays: number;
      sensitiveFields: string[];
    };
  };
  performance: {
    compression: {
      enabled: boolean;
      threshold: number;
      algorithms: ('gzip' | 'deflate' | 'brotli')[];
      level: number;
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
      slowRequestThreshold: number;
      memoryThreshold: number;
      cpuThreshold: number;
    };
  };
  tracing: {
    serviceName: string;
    jaegerEndpoint?: string;
    samplingRate: number;
    enableAutoInstrumentation: boolean;
  };
  circuitBreaker: {
    defaultFailureThreshold: number;
    defaultRecoveryTimeout: number;
    defaultMonitoringPeriod: number;
  };
}

export interface ArchitectureServices {
  container: AdvancedContainer;
  logger: Logger;
  metrics: MetricsService;
  eventBus: EventBus;
  cache: AdvancedCacheService;
  circuitBreakerManager: CircuitBreakerManager;
  tracing: TracingService;
  database: DatabaseOptimizer;
  security: AdvancedSecurityService;
  errorHandler: AdvancedErrorHandler;
  performance: PerformanceOptimizer;
  redis?: Redis;
}

export class ArchitectureIntegrator {
  private readonly logger = new Logger('ArchitectureIntegrator');
  private readonly config: ArchitectureConfig;
  private services?: ArchitectureServices;
  private isInitialized = false;

  constructor(config: ArchitectureConfig) {
    this.config = config;
  }

  /**
   * Initialize all architecture components in correct order
   */
  public async initialize(): Promise<ArchitectureServices> {
    if (this.isInitialized && this.services) {
      return this.services;
    }

    this.logger.info('Initializing advanced architecture...');
    const startTime = Date.now();

    try {
      // Phase 1: Initialize core infrastructure
      const { redis, container, metrics } = await this.initializeCore();

      // Phase 2: Initialize monitoring and observability
      const { tracing, eventBus } = await this.initializeObservability(metrics, redis);

      // Phase 3: Initialize caching and circuit breakers
      const { cache, circuitBreakerManager } = await this.initializeResilience(
        metrics, eventBus, redis
      );

      // Phase 4: Initialize specialized services
      const { database, security, errorHandler, performance } = await this.initializeServices(
        metrics, eventBus, cache, circuitBreakerManager, tracing, redis
      );

      // Phase 5: Register services in container
      await this.registerServices(container, {
        container,
        logger: this.logger,
        metrics,
        eventBus,
        cache,
        circuitBreakerManager,
        tracing,
        database,
        security,
        errorHandler,
        performance,
        redis
      });

      // Phase 6: Start all services
      await this.startServices(container);

      this.services = {
        container,
        logger: this.logger,
        metrics,
        eventBus,
        cache,
        circuitBreakerManager,
        tracing,
        database,
        security,
        errorHandler,
        performance,
        redis
      };

      this.isInitialized = true;
      const initTime = Date.now() - startTime;

      this.logger.info('Advanced architecture initialized successfully', {
        initializationTime: initTime,
        redisEnabled: !!redis,
        servicesCount: Object.keys(this.services).length
      });

      return this.services;

    } catch (error) {
      this.logger.error('Architecture initialization failed', { error });
      throw error;
    }
  }

  private async initializeCore(): Promise<{
    redis?: Redis;
    container: AdvancedContainer;
    metrics: MetricsService;
  }> {
    // Initialize Redis if configured
    let redis: Redis | undefined;
    if (this.config.redis) {
      redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      try {
        await redis.connect();
        this.logger.info('Redis connection established');
      } catch (error) {
        this.logger.warn('Redis connection failed, continuing without Redis:', error);
        redis = null;
      }
    }

    // Initialize dependency injection container
    const container = AdvancedContainer.getInstance();

    // Initialize metrics service
    const metrics = new MetricsService();

    return { redis, container, metrics };
  }

  private async initializeObservability(
    metrics: MetricsService,
    redis?: Redis
  ): Promise<{
    tracing: TracingService;
    eventBus: EventBus;
  }> {
    // Initialize tracing service
    const tracing = new TracingService(this.config.tracing.serviceName);
    await tracing.initialize({
      jaegerEndpoint: this.config.tracing.jaegerEndpoint,
      samplingRate: this.config.tracing.samplingRate,
      enableAutoInstrumentation: this.config.tracing.enableAutoInstrumentation
    });

    // Initialize event bus
    const eventBus = new EventBus(metrics, redis);

    return { tracing, eventBus };
  }

  private async initializeResilience(
    metrics: MetricsService,
    eventBus: EventBus,
    redis?: Redis
  ): Promise<{
    cache: AdvancedCacheService;
    circuitBreakerManager: CircuitBreakerManager;
  }> {
    // Initialize advanced cache service
    const cache = new AdvancedCacheService(
      metrics,
      eventBus,
      redis,
      {
        l1MaxSize: 10000,
        l1TtlSeconds: 300,
        l1CheckPeriod: 120
      }
    );

    // Initialize circuit breaker manager
    const circuitBreakerManager = new CircuitBreakerManager(metrics);

    return { cache, circuitBreakerManager };
  }

  private async initializeServices(
    metrics: MetricsService,
    eventBus: EventBus,
    cache: AdvancedCacheService,
    circuitBreakerManager: CircuitBreakerManager,
    tracing: TracingService,
    redis?: Redis
  ): Promise<{
    database: DatabaseOptimizer;
    security: AdvancedSecurityService;
    errorHandler: AdvancedErrorHandler;
    performance: PerformanceOptimizer;
  }> {
    // Create default circuit breaker for database operations
    const dbCircuitBreaker = circuitBreakerManager.getCircuitBreaker('database', {
      failureThreshold: this.config.circuitBreaker.defaultFailureThreshold,
      recoveryTimeout: this.config.circuitBreaker.defaultRecoveryTimeout,
      monitoringPeriod: this.config.circuitBreaker.defaultMonitoringPeriod
    });

    // Initialize database optimizer
    const database = new DatabaseOptimizer(
      this.config.database,
      metrics,
      cache,
      dbCircuitBreaker
    );
    await database.initialize();

    // Initialize security service
    const security = new AdvancedSecurityService(
      this.config.security,
      metrics,
      eventBus,
      cache,
      redis
    );

    // Initialize error handler
    const errorHandler = new AdvancedErrorHandler(
      metrics,
      eventBus,
      circuitBreakerManager,
      tracing
    );

    // Initialize performance optimizer
    const performance = new PerformanceOptimizer(
      this.config.performance,
      metrics,
      cache,
      tracing
    );

    return { database, security, errorHandler, performance };
  }

  private async registerServices(
    container: AdvancedContainer,
    services: ArchitectureServices
  ): Promise<void> {
    // Register all services as singletons in the container
    container.registerInstance('Logger', services.logger);
    container.registerInstance('MetricsService', services.metrics);
    container.registerInstance('EventBus', services.eventBus);
    container.registerInstance('CacheService', services.cache);
    container.registerInstance('CircuitBreakerManager', services.circuitBreakerManager);
    container.registerInstance('TracingService', services.tracing);
    container.registerInstance('DatabaseOptimizer', services.database);
    container.registerInstance('SecurityService', services.security);
    container.registerInstance('ErrorHandler', services.errorHandler);
    container.registerInstance('PerformanceOptimizer', services.performance);

    if (services.redis) {
      container.registerInstance('Redis', services.redis);
    }

    this.logger.info('All services registered in DI container');
  }

  private async startServices(container: AdvancedContainer): Promise<void> {
    // Start the container (initializes all eager services)
    await container.start();

    this.logger.info('All services started successfully');
  }

  /**
   * Get initialized services
   */
  public getServices(): ArchitectureServices {
    if (!this.isInitialized || !this.services) {
      throw new Error('Architecture not initialized. Call initialize() first.');
    }
    return this.services;
  }

  /**
   * Create Express middleware stack with all optimizations
   */
  public createMiddlewareStack() {
    if (!this.services) {
      throw new Error('Architecture not initialized');
    }

    const { security, performance, errorHandler, tracing } = this.services;

    return [
      // Request tracing
      tracing.createTracingMiddleware(tracing),
      
      // Performance monitoring
      performance.performanceMiddleware(),
      
      // Security checks
      async (req: any, res: any, next: any) => {
        try {
          // Rate limiting
          const rateLimitResult = await security.checkRateLimit(req);
          if (!rateLimitResult.allowed) {
            return res.status(429).json({
              error: rateLimitResult.reason || 'Rate limit exceeded',
              retryAfter: rateLimitResult.retryAfter
            });
          }

          // Threat analysis
          const threatAnalysis = await security.analyzeThreat(req);
          if (threatAnalysis.recommendedAction === 'block') {
            return res.status(403).json({
              error: 'Request blocked due to security threat'
            });
          }

          req.securityContext = {
            threatLevel: threatAnalysis.threatLevel,
            indicators: threatAnalysis.indicators
          };

          next();
        } catch (error) {
          next(error);
        }
      },

      // Response compression
      performance.compressionMiddleware(),

      // Error handling (should be last)
      errorHandler.middleware()
    ];
  }

  /**
   * Health check endpoint
   */
  public async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    services: Record<string, any>;
    metrics: Record<string, any>;
  }> {
    if (!this.services) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        services: {},
        metrics: {}
      };
    }

    const { database, security, errorHandler, performance, cache, circuitBreakerManager } = this.services;

    try {
      // Check all services
      const serviceHealth = {
        database: database.getStats(),
        security: security.getStats(),
        errorHandler: errorHandler.getStats(),
        performance: performance.getMetrics(),
        cache: cache.getStats(),
        circuitBreakers: circuitBreakerManager.getHealthStatus()
      };

      // Determine overall health
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Check for critical issues
      if (errorHandler.getStats().criticalErrors > 10) {
        status = 'unhealthy';
      } else if (
        !circuitBreakerManager.getHealthStatus().healthy ||
        performance.getMetrics().errorRate > 0.1
      ) {
        status = 'degraded';
      }

      return {
        status,
        timestamp: new Date(),
        services: serviceHealth,
        metrics: {
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          nodeVersion: process.version
        }
      };

    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        services: { error: 'Health check failed' },
        metrics: {}
      };
    }
  }

  /**
   * Graceful shutdown of all services
   */
  public async shutdown(): Promise<void> {
    if (!this.services) return;

    this.logger.info('Shutting down architecture...');

    try {
      // Shutdown in reverse order
      await this.services.tracing.shutdown();
      await this.services.database.shutdown();
      await this.services.container.stop();
      
      if (this.services.redis) {
        await this.services.redis.quit();
      }

      this.logger.info('Architecture shutdown completed successfully');
      this.isInitialized = false;
      this.services = undefined;

    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): ArchitectureConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart)
   */
  public async updateConfig(newConfig: Partial<ArchitectureConfig>): Promise<void> {
    Object.assign(this.config, newConfig);
    
    if (this.isInitialized) {
      this.logger.info('Configuration updated, restart required for changes to take effect');
    }
  }
}

// Default configuration factory
export function createDefaultConfig(): ArchitectureConfig {
  return {
    database: {
      primary: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange'
      },
      poolSize: 10,
      maxPoolSize: 100,
      minPoolSize: 5,
      acquireTimeoutMillis: 10000,
      enableQueryOptimization: true,
      enableReadWriteSplit: false,
      enableQueryCache: true,
      slowQueryThreshold: 1000
    },
    security: {
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000,
        maxRequestsPerUser: 500,
        maxRequestsPerIP: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      apiKeys: {
        rotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
        keyLength: 32,
        algorithm: 'HS256'
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 16
      },
      threatDetection: {
        maxFailedAttempts: 5,
        suspiciousActivityThreshold: 100,
        blockDurationMs: 60 * 60 * 1000, // 1 hour
        geoLocationEnabled: false
      },
      audit: {
        enabled: true,
        retentionDays: 90,
        sensitiveFields: ['password', 'token', 'secret', 'key']
      }
    },
    performance: {
      compression: {
        enabled: true,
        threshold: 1024, // 1KB
        algorithms: ['gzip', 'deflate'],
        level: 6,
        chunkSize: 16384
      },
      batching: {
        enabled: true,
        maxBatchSize: 100,
        batchTimeoutMs: 10,
        maxWaitTimeMs: 100
      },
      resourcePooling: {
        enabled: true,
        connectionPoolSize: 10,
        maxIdleTimeMs: 30000,
        acquireTimeoutMs: 5000
      },
      cdn: {
        enabled: false,
        baseUrl: '',
        cacheBustingEnabled: false,
        staticFileExtensions: ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg']
      },
      monitoring: {
        enabled: true,
        slowRequestThreshold: 5000, // 5 seconds
        memoryThreshold: 512, // MB
        cpuThreshold: 80 // percentage
      }
    },
    tracing: {
      serviceName: 'foodxchange-backend',
      samplingRate: 0.1,
      enableAutoInstrumentation: true
    },
    circuitBreaker: {
      defaultFailureThreshold: 5,
      defaultRecoveryTimeout: 60000, // 1 minute
      defaultMonitoringPeriod: 10000 // 10 seconds
    }
  };
}

export default ArchitectureIntegrator;