import { createHash } from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

import Redis from 'ioredis';

import { Logger } from '../../core/logging/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const logger = new Logger('OptimizedCacheService');

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean; // Compress large values
  tags?: string[]; // Tags for bulk invalidation
  namespace?: string; // Cache namespace
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

export class OptimizedCacheService {
  private readonly redis: Redis;
  private readonly defaultTTL: number = 3600; // 1 hour
  private readonly compressionThreshold: number = 1024; // 1KB
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0
  };

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  /**
   * Get value from cache with automatic decompression
   */
  async get<T>(key: string, options?: { parse?: boolean }): Promise<T | null> {
    try {
      const value = await this.redis.get(this.formatKey(key));

      if (!value) {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }

      this.stats.hits++;
      this.updateHitRate();

      // Check if value is compressed
      if (value.startsWith('gzip:')) {
        const compressed = Buffer.from(value.substring(5), 'base64');
        const decompressed = await gunzipAsync(compressed);
        const result = decompressed.toString('utf8');
        return options?.parse !== false ? JSON.parse(result) : result as any;
      }

      return options?.parse !== false ? JSON.parse(value) : value as any;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with automatic compression
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    try {
      const ttl = options?.ttl || this.defaultTTL;
      const formattedKey = this.formatKey(key, options?.namespace);
      let stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      // Compress if value is large
      if (options?.compress !== false && stringValue.length > this.compressionThreshold) {
        const compressed = await gzipAsync(stringValue);
        stringValue = `gzip:${  compressed.toString('base64')}`;
      }

      // Set with expiration
      await this.redis.setex(formattedKey, ttl, stringValue);

      // Handle tags for bulk invalidation
      if (options?.tags && options.tags.length > 0) {
        await this.addToTags(formattedKey, options.tags);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const formattedKeys = keys.map(k => this.formatKey(k));
      const values = await this.redis.mget(...formattedKeys);

      return Promise.all(values.map(async (value, index) => {
        if (!value) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;

        // Handle decompression
        if (value.startsWith('gzip:')) {
          const compressed = Buffer.from(value.substring(5), 'base64');
          const decompressed = await gunzipAsync(compressed);
          return JSON.parse(decompressed.toString('utf8'));
        }

        return JSON.parse(value);
      }));
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.formatKey(key));
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(this.formatKey(pattern));
      if (keys.length === 0) return 0;

      const result = await this.redis.del(...keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Delete all keys with specific tags
   */
  async deleteByTags(tags: string[]): Promise<number> {
    try {
      let allKeys: string[] = [];

      for (const tag of tags) {
        const keys = await this.redis.smembers(`tag:${tag}`);
        allKeys = allKeys.concat(keys);
      }

      // Remove duplicates
      allKeys = [...new Set(allKeys)];

      if (allKeys.length === 0) return 0;

      const result = await this.redis.del(...allKeys);

      // Clean up tag sets
      await Promise.all(tags.map(async tag => this.redis.del(`tag:${tag}`)));

      this.stats.deletes += result;
      return result;
    } catch (error) {
      logger.error('Cache delete by tags error:', error);
      return 0;
    }
  }

  /**
   * Cache wrapper for functions
   */
  async remember<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate value
    const value = await factory();

    // Store in cache
    await this.set(key, value, options);

    return value;
  }

  /**
   * Implement cache-aside pattern with stale-while-revalidate
   */
  async rememberForever<T>(
    key: string,
    factory: () => Promise<T>,
    options?: { staleTime?: number }
  ): Promise<T> {
    const staleKey = `stale:${key}`;
    const lockKey = `lock:${key}`;

    // Try to get fresh value
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Try to get stale value while revalidating
    const stale = await this.get<T>(staleKey);
    if (stale !== null) {
      // Return stale value immediately
      // Revalidate in background if no one else is doing it
      const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
      if (lockAcquired) {
        factory().then(async (value) => {
          await this.set(key, value, { ttl: options?.staleTime || 300 });
          await this.set(staleKey, value, { ttl: 86400 }); // Keep stale for 24h
          await this.redis.del(lockKey);
        }).catch(error => {
          logger.error('Background revalidation failed:', error);
          this.redis.del(lockKey);
        });
      }
      return stale;
    }

    // No cache at all, generate value
    const value = await factory();
    await this.set(key, value, { ttl: options?.staleTime || 300 });
    await this.set(staleKey, value, { ttl: 86400 });

    return value;
  }

  /**
   * Implement write-through cache
   */
  async writeThrough<T>(
    key: string,
    value: T,
    persist: (value: T) => Promise<void>,
    options?: CacheOptions
  ): Promise<void> {
    // Write to cache first
    await this.set(key, value, options);

    // Then persist to database
    try {
      await persist(value);
    } catch (error) {
      // If persistence fails, remove from cache to maintain consistency
      await this.delete(key);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0
    };
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(warmUpFunctions: Array<() => Promise<void>>): Promise<void> {
    logger.info('Starting cache warm-up...');

    const startTime = Date.now();
    await Promise.all(warmUpFunctions.map(async fn => fn().catch(error => {
      logger.error('Warm-up function failed:', error);
    })));

    const duration = Date.now() - startTime;
    logger.info(`Cache warm-up completed in ${duration}ms`);
  }

  /**
   * Clear entire cache
   */
  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
      this.resetStats();
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
  }

  private formatKey(key: string, namespace?: string): string {
    const prefix = namespace || process.env.CACHE_PREFIX || 'app';
    return `${prefix}:${key}`;
  }

  private async addToTags(key: string, tags: string[]): Promise<void> {
    await Promise.all(tags.map(async tag =>
      this.redis.sadd(`tag:${tag}`, key)
    ));
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Generate cache key from object
   */
  static generateKey(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return createHash('md5').update(str).digest('hex');
  }
}

// Export singleton instance
export const optimizedCache = new OptimizedCacheService();

// Cache decorators
export function Cacheable(options?: CacheOptions) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyName}:${OptimizedCacheService.generateKey(args)}`;
      return optimizedCache.remember(cacheKey, () => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

export function CacheEvict(patterns: string[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Evict cache after method execution
      await Promise.all(patterns.map(async pattern =>
        optimizedCache.deletePattern(pattern)
      ));

      return result;
    };

    return descriptor;
  };
}
