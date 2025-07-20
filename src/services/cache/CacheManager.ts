import Redis from 'ioredis';
import NodeCache from 'node-cache';

import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';

const logger = new Logger('CacheManager');
const metricsService = new MetricsService();

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  maxSize?: number; // Maximum number of keys
  prefix?: string; // Key prefix
  serialize?: boolean; // Whether to serialize objects
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keys: number;
  memory: number;
}

export enum CacheLevel {
  MEMORY = 'memory',
  REDIS = 'redis',
  BOTH = 'both'
}

export class CacheManager {
  private static instance: CacheManager;
  private redis: Redis | null = null;
  private readonly memoryCache: NodeCache;
  private isRedisConnected = false;
  private readonly cacheStats: Map<string, CacheStats> = new Map();

  private constructor() {
    this.memoryCache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every minute
      useClones: false, // Don't clone objects for better performance
      maxKeys: 10000, // Maximum number of keys
      deleteOnExpire: true
    });

    this.initializeRedis();
    this.setupEventHandlers();
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private async initializeRedis(): Promise<void> {
    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL, {
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: true,
          keepAlive: 30000,
          connectTimeout: 10000,
          commandTimeout: 5000,
          family: 4,
          keyPrefix: 'foodxchange:',
          db: 0
        });

        this.redis.on('connect', () => {
          this.isRedisConnected = true;
          logger.info('Redis cache connected successfully');
        });

        this.redis.on('error', (error) => {
          this.isRedisConnected = false;
          logger.error('Redis cache error:', error);
        });

        this.redis.on('close', () => {
          this.isRedisConnected = false;
          logger.warn('Redis cache connection closed');
        });

        await this.redis.connect();
      } catch (error) {
        logger.error('Failed to initialize Redis cache:', error);
        this.redis = null;
      }
    } else {
      logger.info('Redis URL not configured, using memory cache only');
    }
  }

  private setupEventHandlers(): void {
    // Memory cache event handlers
    this.memoryCache.on('set', (key: string, value: any) => {
      this.updateStats('memory', 'set');
      metricsService.incrementCounter('cache_operations_total', {
        operation: 'set',
        level: 'memory',
        key: this.sanitizeKey(key)
      });
    });

    this.memoryCache.on('get', (key: string, value: any) => {
      this.updateStats('memory', value ? 'hit' : 'miss');
      metricsService.incrementCounter('cache_operations_total', {
        operation: 'get',
        level: 'memory',
        result: value ? 'hit' : 'miss',
        key: this.sanitizeKey(key)
      });
    });

    this.memoryCache.on('del', (key: string, value: any) => {
      this.updateStats('memory', 'delete');
      metricsService.incrementCounter('cache_operations_total', {
        operation: 'delete',
        level: 'memory',
        key: this.sanitizeKey(key)
      });
    });

    this.memoryCache.on('expired', (key: string, value: any) => {
      this.updateStats('memory', 'expire');
      metricsService.incrementCounter('cache_operations_total', {
        operation: 'expire',
        level: 'memory',
        key: this.sanitizeKey(key)
      });
    });
  }

  private sanitizeKey(key: string): string {
    // Remove potentially sensitive information from keys for metrics
    return key.replace(/[0-9a-f]{24}/g, ':id').replace(/\d+/g, ':num');
  }

  private updateStats(level: string, operation: string): void {
    const stats = this.cacheStats.get(level) || {
      hits: 0,
      misses: 0,
      hitRate: 0,
      keys: 0,
      memory: 0
    };

    switch (operation) {
      case 'hit':
        stats.hits++;
        break;
      case 'miss':
        stats.misses++;
        break;
    }

    stats.hitRate = stats.hits / (stats.hits + stats.misses) * 100;
    stats.keys = level === 'memory' ? this.memoryCache.keys().length : stats.keys;

    this.cacheStats.set(level, stats);
  }

  public async get<T>(key: string, level: CacheLevel = CacheLevel.BOTH): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Try memory cache first
      if (level === CacheLevel.MEMORY || level === CacheLevel.BOTH) {
        const memoryValue = this.memoryCache.get<T>(key);
        if (memoryValue !== undefined) {
          this.recordCacheLatency('memory', Date.now() - startTime);
          return memoryValue;
        }
      }

      // Try Redis cache
      if ((level === CacheLevel.REDIS || level === CacheLevel.BOTH) && this.isRedisConnected && this.redis) {
        const redisValue = await this.redis.get(key);
        if (redisValue !== null) {
          const parsedValue = JSON.parse(redisValue);

          // Store in memory cache for faster access
          if (level === CacheLevel.BOTH) {
            this.memoryCache.set(key, parsedValue, 300); // 5 minutes in memory
          }

          this.recordCacheLatency('redis', Date.now() - startTime);
          return parsedValue;
        }
      }

      this.recordCacheLatency('miss', Date.now() - startTime);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error, { key, level });
      return null;
    }
  }

  public async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
    level: CacheLevel = CacheLevel.BOTH
  ): Promise<boolean> {
    const startTime = Date.now();
    const { ttl = 300, serialize = true } = options;

    try {
      let success = false;

      // Set in memory cache
      if (level === CacheLevel.MEMORY || level === CacheLevel.BOTH) {
        this.memoryCache.set(key, value, ttl);
        success = true;
      }

      // Set in Redis cache
      if ((level === CacheLevel.REDIS || level === CacheLevel.BOTH) && this.isRedisConnected && this.redis) {
        const serializedValue = serialize ? JSON.stringify(value) : value as string;
        await this.redis.setex(key, ttl, serializedValue);
        success = true;
      }

      this.recordCacheLatency('set', Date.now() - startTime);
      return success;
    } catch (error) {
      logger.error('Cache set error:', error, { key, level, ttl });
      return false;
    }
  }

  public async delete(key: string, level: CacheLevel = CacheLevel.BOTH): Promise<boolean> {
    const startTime = Date.now();

    try {
      let success = false;

      // Delete from memory cache
      if (level === CacheLevel.MEMORY || level === CacheLevel.BOTH) {
        this.memoryCache.del(key);
        success = true;
      }

      // Delete from Redis cache
      if ((level === CacheLevel.REDIS || level === CacheLevel.BOTH) && this.isRedisConnected && this.redis) {
        await this.redis.del(key);
        success = true;
      }

      this.recordCacheLatency('delete', Date.now() - startTime);
      return success;
    } catch (error) {
      logger.error('Cache delete error:', error, { key, level });
      return false;
    }
  }

  public async clear(level: CacheLevel = CacheLevel.BOTH): Promise<boolean> {
    try {
      let success = false;

      // Clear memory cache
      if (level === CacheLevel.MEMORY || level === CacheLevel.BOTH) {
        this.memoryCache.flushAll();
        success = true;
      }

      // Clear Redis cache
      if ((level === CacheLevel.REDIS || level === CacheLevel.BOTH) && this.isRedisConnected && this.redis) {
        await this.redis.flushdb();
        success = true;
      }

      logger.info('Cache cleared', { level });
      return success;
    } catch (error) {
      logger.error('Cache clear error:', error, { level });
      return false;
    }
  }

  public async exists(key: string, level: CacheLevel = CacheLevel.BOTH): Promise<boolean> {
    try {
      // Check memory cache
      if (level === CacheLevel.MEMORY || level === CacheLevel.BOTH) {
        if (this.memoryCache.has(key)) {
          return true;
        }
      }

      // Check Redis cache
      if ((level === CacheLevel.REDIS || level === CacheLevel.BOTH) && this.isRedisConnected && this.redis) {
        const exists = await this.redis.exists(key);
        return exists === 1;
      }

      return false;
    } catch (error) {
      logger.error('Cache exists error:', error, { key, level });
      return false;
    }
  }

  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {},
    level: CacheLevel = CacheLevel.BOTH
  ): Promise<T> {
    const cached = await this.get<T>(key, level);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options, level);
    return value;
  }

  public async setWithTags(
    key: string,
    value: any,
    tags: string[],
    options: CacheOptions = {},
    level: CacheLevel = CacheLevel.BOTH
  ): Promise<boolean> {
    const success = await this.set(key, value, options, level);

    if (success && this.isRedisConnected && this.redis) {
      // Store tag associations in Redis
      for (const tag of tags) {
        await this.redis.sadd(`tag:${tag}`, key);
      }
    }

    return success;
  }

  public async invalidateByTag(tag: string): Promise<number> {
    if (!this.isRedisConnected || !this.redis) {
      return 0;
    }

    try {
      const keys = await this.redis.smembers(`tag:${tag}`);
      if (keys.length === 0) {
        return 0;
      }

      // Delete all keys with this tag
      await Promise.all(keys.map(async key => this.delete(key)));

      // Remove tag set
      await this.redis.del(`tag:${tag}`);

      logger.info('Cache invalidated by tag', { tag, keys: keys.length });
      return keys.length;
    } catch (error) {
      logger.error('Cache invalidate by tag error:', error, { tag });
      return 0;
    }
  }

  public getStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};

    // Memory cache stats
    stats.memory = {
      hits: this.cacheStats.get('memory')?.hits || 0,
      misses: this.cacheStats.get('memory')?.misses || 0,
      hitRate: this.cacheStats.get('memory')?.hitRate || 0,
      keys: this.memoryCache.keys().length,
      memory: this.memoryCache.keys().length * 1024 // Rough estimate
    };

    // Redis stats
    if (this.isRedisConnected) {
      stats.redis = {
        hits: this.cacheStats.get('redis')?.hits || 0,
        misses: this.cacheStats.get('redis')?.misses || 0,
        hitRate: this.cacheStats.get('redis')?.hitRate || 0,
        keys: 0, // Would need to query Redis for this
        memory: 0 // Would need to query Redis for this
      };
    }

    return stats;
  }

  private recordCacheLatency(operation: string, latency: number): void {
    metricsService.recordTimer('cache_operation_duration_seconds', latency / 1000, {
      operation
    });
  }

  public async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.memoryCache.flushAll();
    this.memoryCache.close();
    logger.info('Cache manager closed');
  }
}

// Cache decorator for methods
export function Cached(options: CacheOptions & { level?: CacheLevel } = {}) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cacheManager = CacheManager.getInstance();

    descriptor.value = async function(...args: any[]) {
      const key = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;

      return await cacheManager.getOrSet(
        key,
        () => originalMethod.apply(this, args),
        options,
        options.level || CacheLevel.BOTH
      );
    };

    return descriptor;
  };
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
export default cacheManager;
