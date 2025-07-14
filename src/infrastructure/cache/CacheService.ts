/**
 * Enterprise-grade Caching Service
 * Supports Redis and in-memory caching with automatic fallback
 */

import Redis from 'ioredis';
import NodeCache from 'node-cache';
import { config } from '../../core/config';
import { Logger } from '../../core/logging/logger';
import { ExternalServiceError } from '../../core/errors';

const logger = new Logger('CacheService');

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
  compress?: boolean;
}

export class CacheService {
  private static instance: CacheService;
  private redisClient?: Redis;
  private memoryCache: NodeCache;
  private isRedisConnected = false;
  private readonly defaultTTL = 3600; // 1 hour
  private readonly keyPrefix = 'fdx:'; // FoodXchange prefix

  private constructor() {
    // Initialize in-memory cache as fallback
    this.memoryCache = new NodeCache({
      stdTTL: this.defaultTTL,
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false, // Better performance
    });

    // Initialize Redis if configured
    if (config.features.caching && config.external.redis.url) {
      this.initializeRedis();
    }
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = new Redis(config.external.redis.url, {
        password: config.external.redis.password,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err: Error) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected');
        this.isRedisConnected = true;
      });

      this.redisClient.on('error', (error: Error) => {
        logger.error('Redis error', error);
        this.isRedisConnected = false;
      });

      this.redisClient.on('close', () => {
        logger.warn('Redis connection closed');
        this.isRedisConnected = false;
      });

      // Test connection
      await this.redisClient.ping();
      this.isRedisConnected = true;
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to initialize Redis', error);
      this.isRedisConnected = false;
    }
  }

  // Main cache operations
  public async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.buildKey(key, options.namespace);
    const startTime = Date.now();

    try {
      // Try Redis first
      if (this.isRedisConnected && this.redisClient) {
        const value = await this.redisClient.get(fullKey);
        if (value) {
          logger.debug('Cache hit (Redis)', { key: fullKey, duration: Date.now() - startTime });
          return this.deserialize<T>(value, options.compress);
        }
      }

      // Fallback to memory cache
      const memValue = this.memoryCache.get<string>(fullKey);
      if (memValue) {
        logger.debug('Cache hit (Memory)', { key: fullKey, duration: Date.now() - startTime });
        return this.deserialize<T>(memValue, false);
      }

      logger.debug('Cache miss', { key: fullKey, duration: Date.now() - startTime });
      return null;
    } catch (error) {
      logger.error('Cache get error', error, { key: fullKey });
      return null;
    }
  }

  public async set<T>(
    key: string,
    value: T,
    ttl?: number,
    options: CacheOptions = {}
  ): Promise<boolean> {
    const fullKey = this.buildKey(key, options.namespace);
    const finalTTL = ttl || options.ttl || this.defaultTTL;
    const startTime = Date.now();

    try {
      const serialized = await this.serialize(value, options.compress);

      // Set in Redis if available
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.setex(fullKey, finalTTL, serialized);
        logger.debug('Cache set (Redis)', { key: fullKey, ttl: finalTTL, duration: Date.now() - startTime });
      }

      // Always set in memory cache as backup
      this.memoryCache.set(fullKey, serialized, finalTTL);
      
      return true;
    } catch (error) {
      logger.error('Cache set error', error, { key: fullKey });
      return false;
    }
  }

  public async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.namespace);

    try {
      // Delete from Redis
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.del(fullKey);
      }

      // Delete from memory cache
      this.memoryCache.del(fullKey);
      
      logger.debug('Cache delete', { key: fullKey });
      return true;
    } catch (error) {
      logger.error('Cache delete error', error, { key: fullKey });
      return false;
    }
  }

  public async deletePattern(pattern: string, options: CacheOptions = {}): Promise<number> {
    const fullPattern = this.buildKey(pattern, options.namespace);
    let deletedCount = 0;

    try {
      // Delete from Redis
      if (this.isRedisConnected && this.redisClient) {
        const keys = await this.redisClient.keys(fullPattern);
        if (keys.length > 0) {
          deletedCount = await this.redisClient.del(...keys);
        }
      }

      // Delete from memory cache
      const memKeys = this.memoryCache.keys().filter(k => k.match(fullPattern));
      memKeys.forEach(k => this.memoryCache.del(k));
      deletedCount += memKeys.length;

      logger.debug('Cache pattern delete', { pattern: fullPattern, deletedCount });
      return deletedCount;
    } catch (error) {
      logger.error('Cache pattern delete error', error, { pattern: fullPattern });
      return 0;
    }
  }

  public async flush(namespace?: string): Promise<void> {
    try {
      if (namespace) {
        await this.deletePattern('*', { namespace });
      } else {
        // Flush all cache
        if (this.isRedisConnected && this.redisClient) {
          await this.redisClient.flushdb();
        }
        this.memoryCache.flushAll();
      }
      logger.info('Cache flushed', { namespace });
    } catch (error) {
      logger.error('Cache flush error', error);
    }
  }

  // Utility methods
  private buildKey(key: string, namespace?: string): string {
    const parts = [this.keyPrefix];
    if (namespace) parts.push(namespace);
    parts.push(key);
    return parts.join(':');
  }

  private async serialize<T>(value: T, compress?: boolean): Promise<string> {
    const json = JSON.stringify(value);
    if (compress && json.length > 1024) {
      // TODO: Implement compression if needed
      return json;
    }
    return json;
  }

  private deserialize<T>(value: string, compressed?: boolean): T {
    if (compressed) {
      // TODO: Implement decompression if needed
      return JSON.parse(value);
    }
    return JSON.parse(value);
  }

  // Cached function wrapper
  public async cached<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    try {
      const result = await fn();
      await this.set(key, result, ttl, options);
      return result;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
  }

  // Decorator for caching method results
  public cacheMethod(options: CacheOptions & { keyGenerator?: (...args: any[]) => string } = {}) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const key = options.keyGenerator
          ? options.keyGenerator(...args)
          : `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;

        const cache = CacheService.getInstance();
        return cache.cached(
          key,
          () => originalMethod.apply(this, args),
          options.ttl,
          options
        );
      };

      return descriptor;
    };
  }

  // Health check
  public async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    memory: boolean;
  }> {
    const memoryHealthy = this.memoryCache.keys().length >= 0;
    let redisHealthy = false;

    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        redisHealthy = true;
      } catch (error) {
        redisHealthy = false;
      }
    }

    return {
      healthy: memoryHealthy || redisHealthy,
      redis: redisHealthy,
      memory: memoryHealthy,
    };
  }

  // Statistics
  public getStats(): {
    memory: {
      keys: number;
      hits: number;
      misses: number;
    };
    redis: {
      connected: boolean;
    };
  } {
    return {
      memory: {
        keys: this.memoryCache.keys().length,
        hits: this.memoryCache.getStats().hits,
        misses: this.memoryCache.getStats().misses,
      },
      redis: {
        connected: this.isRedisConnected,
      },
    };
  }
}

// Export singleton instance
export default CacheService.getInstance();