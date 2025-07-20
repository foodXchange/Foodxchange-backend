import { performance } from 'perf_hooks';

import Redis from 'ioredis';
import mongoose from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { multiLevelCache } from '../cache/MultiLevelCacheService';
import { prometheusMetrics } from '../metrics/PrometheusMetricsService';


export interface HealthCheck {
  name: string;
  execute(): Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  healthy: boolean;
  message?: string;
  timestamp: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface SystemHealthReport {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, HealthCheckResult>;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

export class HealthCheckService {
  private static instance: HealthCheckService;
  private readonly logger: Logger;
  private readonly checks: Map<string, HealthCheck> = new Map();
  private readonly startTime: number = Date.now();

  constructor() {
    this.logger = new Logger('HealthCheckService');
    this.registerDefaultChecks();
  }

  static getInstance(): HealthCheckService {
    if (!HealthCheckService.instance) {
      HealthCheckService.instance = new HealthCheckService();
    }
    return HealthCheckService.instance;
  }

  private registerDefaultChecks(): void {
    // Database health check
    this.registerCheck('database', new DatabaseHealthCheck());

    // Redis health check
    this.registerCheck('redis', new RedisHealthCheck());

    // Memory health check
    this.registerCheck('memory', new MemoryHealthCheck());

    // Disk space health check
    this.registerCheck('disk', new DiskHealthCheck());

    // External services health check
    this.registerCheck('external_services', new ExternalServicesHealthCheck());

    // Cache health check
    this.registerCheck('cache', new CacheHealthCheck());

    // Application health check
    this.registerCheck('application', new ApplicationHealthCheck());
  }

  registerCheck(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
    this.logger.info(`Health check registered: ${name}`);
  }

  async runHealthChecks(): Promise<SystemHealthReport> {
    const results: Record<string, HealthCheckResult> = {};
    let healthyCount = 0;
    let unhealthyCount = 0;
    const degradedCount = 0;

    for (const [name, check] of this.checks) {
      try {
        const result = await check.execute();
        results[name] = result;

        if (result.healthy) {
          healthyCount++;
        } else {
          unhealthyCount++;
        }
      } catch (error) {
        unhealthyCount++;
        results[name] = {
          healthy: false,
          message: `Health check failed: ${error.message}`,
          timestamp: new Date().toISOString()
        };
      }
    }

    const overallStatus = this.determineOverallStatus(healthyCount, unhealthyCount, degradedCount);

    const report: SystemHealthReport = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0',
      checks: results,
      summary: {
        total: this.checks.size,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        degraded: degradedCount
      }
    };

    // Log unhealthy services
    if (unhealthyCount > 0) {
      this.logger.warn(`Health check failed for ${unhealthyCount} services`, {
        unhealthyServices: Object.keys(results).filter(key => !results[key].healthy)
      });
    }

    return report;
  }

  private determineOverallStatus(healthy: number, unhealthy: number, degraded: number): 'healthy' | 'unhealthy' | 'degraded' {
    if (unhealthy === 0 && degraded === 0) {
      return 'healthy';
    }

    if (unhealthy > 0 && (unhealthy >= healthy / 2)) {
      return 'unhealthy';
    }

    return 'degraded';
  }

  async getQuickHealth(): Promise<{ status: string; timestamp: string; uptime: number }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime
    };
  }

  async getLivenessCheck(): Promise<{ alive: boolean; timestamp: string }> {
    return {
      alive: true,
      timestamp: new Date().toISOString()
    };
  }

  async getReadinessCheck(): Promise<{ ready: boolean; timestamp: string; details?: Record<string, any> }> {
    // Check critical services for readiness
    const criticalChecks = ['database', 'redis'];
    const results: Record<string, any> = {};
    let ready = true;

    for (const checkName of criticalChecks) {
      const check = this.checks.get(checkName);
      if (check) {
        try {
          const result = await check.execute();
          results[checkName] = result;
          if (!result.healthy) {
            ready = false;
          }
        } catch (error) {
          results[checkName] = { healthy: false, message: error.message };
          ready = false;
        }
      }
    }

    return {
      ready,
      timestamp: new Date().toISOString(),
      details: results
    };
  }
}

// Individual health check implementations
class DatabaseHealthCheck implements HealthCheck {
  name = 'database';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const state = mongoose.connection.readyState;
      const isConnected = state === 1; // 1 = connected

      if (isConnected) {
        // Test database operation
        await mongoose.connection.db.admin().ping();

        const responseTime = performance.now() - startTime;

        return {
          healthy: true,
          message: 'Database connection is healthy',
          timestamp: new Date().toISOString(),
          responseTime,
          details: {
            state: this.getConnectionState(state),
            host: mongoose.connection.host,
            name: mongoose.connection.name
          }
        };
      }
      return {
        healthy: false,
        message: `Database connection is not ready. State: ${this.getConnectionState(state)}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };

    } catch (error) {
      return {
        healthy: false,
        message: `Database health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }

  private getConnectionState(state: number): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[state] || 'unknown';
  }
}

class RedisHealthCheck implements HealthCheck {
  name = 'redis';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        commandTimeout: 2000
      });

      await redis.ping();
      const info = await redis.info('server');
      await redis.quit();

      const responseTime = performance.now() - startTime;

      return {
        healthy: true,
        message: 'Redis connection is healthy',
        timestamp: new Date().toISOString(),
        responseTime,
        details: {
          version: info.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1],
          uptime: info.split('\r\n').find(line => line.startsWith('uptime_in_seconds:'))?.split(':')[1]
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Redis health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

class MemoryHealthCheck implements HealthCheck {
  name = 'memory';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const freeMemory = totalMemory - usedMemory;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      // Consider memory usage > 90% as unhealthy
      const healthy = memoryUsagePercent < 90;

      return {
        healthy,
        message: healthy ? 'Memory usage is normal' : 'Memory usage is high',
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime,
        details: {
          usedMemory: Math.round(usedMemory / 1024 / 1024), // MB
          totalMemory: Math.round(totalMemory / 1024 / 1024), // MB
          freeMemory: Math.round(freeMemory / 1024 / 1024), // MB
          usagePercent: Math.round(memoryUsagePercent),
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024) // MB
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Memory health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

class DiskHealthCheck implements HealthCheck {
  name = 'disk';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      // This is a simplified disk check - in a real implementation,
      // you'd use a library like 'check-disk-space' or similar
      const stats = process.cwd(); // Just check if we can access the current directory

      return {
        healthy: true,
        message: 'Disk access is healthy',
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime,
        details: {
          currentDirectory: stats
          // In a real implementation, you'd include actual disk space metrics
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Disk health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

class ExternalServicesHealthCheck implements HealthCheck {
  name = 'external_services';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      // Check if Azure services are configured
      const azureConfigured = !!(
        process.env.AZURE_OPENAI_API_KEY &&
        process.env.AZURE_OPENAI_ENDPOINT
      );

      // Check if email service is configured
      const emailConfigured = !!(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER
      );

      const details = {
        azure: azureConfigured ? 'configured' : 'not configured',
        email: emailConfigured ? 'configured' : 'not configured'
      };

      return {
        healthy: true, // External services being unconfigured doesn't make the app unhealthy
        message: 'External services status checked',
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime,
        details
      };
    } catch (error) {
      return {
        healthy: false,
        message: `External services health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

class CacheHealthCheck implements HealthCheck {
  name = 'cache';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const testKey = 'health_check_test';
      const testValue = 'test_value';

      // Test cache set and get
      await multiLevelCache.set(testKey, testValue, { ttl: 60 });
      const retrievedValue = await multiLevelCache.get(testKey);
      await multiLevelCache.delete(testKey);

      const healthy = retrievedValue === testValue;
      const stats = multiLevelCache.getStats();

      return {
        healthy,
        message: healthy ? 'Cache is working properly' : 'Cache test failed',
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime,
        details: {
          localCacheSize: stats.localCacheSize,
          totalOperations: stats.totalOperations,
          localHitRate: stats.totalOperations > 0 ? (stats.localCacheHits / stats.totalOperations) * 100 : 0,
          redisHitRate: stats.totalOperations > 0 ? (stats.redisCacheHits / stats.totalOperations) * 100 : 0
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Cache health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

class ApplicationHealthCheck implements HealthCheck {
  name = 'application';

  async execute(): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const uptime = process.uptime();
      const nodeVersion = process.version;
      const {platform} = process;
      const {arch} = process;

      return {
        healthy: true,
        message: 'Application is running normally',
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime,
        details: {
          uptime: `${Math.floor(uptime / 60)} minutes`,
          nodeVersion,
          platform,
          arch,
          pid: process.pid,
          environment: process.env.NODE_ENV || 'development'
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Application health check failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        responseTime: performance.now() - startTime
      };
    }
  }
}

// Export singleton instance
export const healthCheckService = HealthCheckService.getInstance();
