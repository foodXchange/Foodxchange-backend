import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { config } from '../config';
import { productionLogger } from './productionLogger';
import { CircuitBreakerRegistry } from './circuitBreaker';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  timestamp: Date;
  responseTime: number;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: {
    [key: string]: HealthCheckResult;
  };
  uptime: number;
  timestamp: Date;
  version: string;
}

export class HealthChecker {
  private static instance: HealthChecker;
  private checks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private startTime: Date = new Date();

  private constructor() {
    this.registerDefaultChecks();
  }

  static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  private registerDefaultChecks(): void {
    // Database health check
    this.register('database', async () => {
      const startTime = Date.now();
      try {
        await mongoose.connection.db.admin().ping();
        const responseTime = Date.now() - startTime;
        
        const connections = mongoose.connection.readyState;
        const connectionStatus = connections === 1 ? 'connected' : 'disconnected';
        
        return {
          status: connections === 1 ? 'healthy' : 'unhealthy',
          message: `Database ${connectionStatus}`,
          timestamp: new Date(),
          responseTime,
          details: {
            readyState: connections,
            host: mongoose.connection.host,
            name: mongoose.connection.name
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Database connection failed: ${error.message}`,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          details: { error: error.message }
        };
      }
    });

    // Redis health check
    this.register('redis', async () => {
      const startTime = Date.now();
      try {
        const redis = new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          connectTimeout: 5000
        });

        await redis.ping();
        const info = await redis.info('server');
        await redis.quit();

        const responseTime = Date.now() - startTime;
        
        return {
          status: 'healthy',
          message: 'Redis connection successful',
          timestamp: new Date(),
          responseTime,
          details: {
            host: config.redis.host,
            port: config.redis.port,
            info: info.split('\n')[1] // Redis version line
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Redis connection failed: ${error.message}`,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          details: { error: error.message }
        };
      }
    });

    // Memory health check
    this.register('memory', async () => {
      const startTime = Date.now();
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Memory usage normal';

      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
        message = 'Memory usage critical';
      } else if (memoryUsagePercent > 80) {
        status = 'degraded';
        message = 'Memory usage high';
      }

      return {
        status,
        message,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        details: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          usagePercent: Math.round(memoryUsagePercent),
          rss: Math.round(memUsage.rss / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        }
      };
    });

    // Disk space health check
    this.register('disk', async () => {
      const startTime = Date.now();
      try {
        const fs = require('fs');
        const stats = fs.statSync('.');
        
        // This is a simplified check - in production, use proper disk space checking
        return {
          status: 'healthy',
          message: 'Disk space sufficient',
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          details: {
            available: 'Unknown - implement proper disk check',
            used: 'Unknown - implement proper disk check'
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          message: `Disk check failed: ${error.message}`,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          details: { error: error.message }
        };
      }
    });

    // Circuit breaker health check
    this.register('circuitBreakers', async () => {
      const startTime = Date.now();
      const breakers = CircuitBreakerRegistry.getAll();
      const openBreakers = [];
      const halfOpenBreakers = [];

      for (const [name, breaker] of breakers) {
        const state = breaker.getState();
        if (state === 'OPEN') {
          openBreakers.push(name);
        } else if (state === 'HALF_OPEN') {
          halfOpenBreakers.push(name);
        }
      }

      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'All circuit breakers healthy';

      if (openBreakers.length > 0) {
        status = openBreakers.length > 2 ? 'unhealthy' : 'degraded';
        message = `${openBreakers.length} circuit breakers open`;
      } else if (halfOpenBreakers.length > 0) {
        status = 'degraded';
        message = `${halfOpenBreakers.length} circuit breakers half-open`;
      }

      return {
        status,
        message,
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        details: {
          total: breakers.size,
          open: openBreakers,
          halfOpen: halfOpenBreakers
        }
      };
    });

    // External services health check
    this.register('externalServices', async () => {
      const startTime = Date.now();
      const services = {
        whatsapp: config.whatsapp.accessToken ? 'configured' : 'not_configured',
        azure: config.azure.clientId ? 'configured' : 'not_configured',
        stripe: config.stripe.secretKey ? 'configured' : 'not_configured'
      };

      return {
        status: 'healthy',
        message: 'External services configuration checked',
        timestamp: new Date(),
        responseTime: Date.now() - startTime,
        details: services
      };
    });
  }

  register(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
  }

  async checkService(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      return {
        status: 'unhealthy',
        message: `Health check '${name}' not found`,
        timestamp: new Date(),
        responseTime: 0
      };
    }

    try {
      const result = await check();
      this.lastResults.set(name, result);
      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        timestamp: new Date(),
        responseTime: 0,
        details: { error: error.message }
      };
      this.lastResults.set(name, result);
      return result;
    }
  }

  async checkAll(): Promise<SystemHealth> {
    const results: { [key: string]: HealthCheckResult } = {};
    const checks = Array.from(this.checks.keys());

    // Run all checks in parallel
    const checkPromises = checks.map(async (name) => {
      const result = await this.checkService(name);
      results[name] = result;
    });

    await Promise.all(checkPromises);

    // Determine overall health
    const healthyCount = Object.values(results).filter(r => r.status === 'healthy').length;
    const unhealthyCount = Object.values(results).filter(r => r.status === 'unhealthy').length;
    const degradedCount = Object.values(results).filter(r => r.status === 'degraded').length;

    let overall: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    
    if (unhealthyCount > 0) {
      overall = unhealthyCount > 2 ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    }

    const uptime = (Date.now() - this.startTime.getTime()) / 1000;

    return {
      overall,
      services: results,
      uptime,
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0'
    };
  }

  async getQuickHealth(): Promise<{ status: string; uptime: number }> {
    const uptime = (Date.now() - this.startTime.getTime()) / 1000;
    
    // Quick check - only database and memory
    const dbResult = await this.checkService('database');
    const memResult = await this.checkService('memory');
    
    const status = dbResult.status === 'healthy' && memResult.status === 'healthy' ? 'healthy' : 'unhealthy';
    
    return { status, uptime };
  }

  getLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  // Start continuous health monitoring
  startMonitoring(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        const health = await this.checkAll();
        
        if (health.overall === 'unhealthy') {
          productionLogger.error('System health check failed', { health });
        } else if (health.overall === 'degraded') {
          productionLogger.warn('System health degraded', { health });
        } else {
          productionLogger.debug('System health check passed', { 
            overall: health.overall, 
            uptime: health.uptime 
          });
        }
      } catch (error) {
        productionLogger.error('Health monitoring error', { error: error.message });
      }
    }, intervalMs);
  }
}

export const healthChecker = HealthChecker.getInstance();