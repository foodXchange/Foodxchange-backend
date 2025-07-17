import { Logger } from '../../core/logging/logger';
import Redis from 'ioredis';

const logger = new Logger('CacheService');

export interface ICacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
  compress?: boolean;
  tags?: string[];
}

export interface ICacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour
  private stats = {
    hits: 0,
    misses: 0
  };

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: 'foodxchange:',
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      }
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options: ICacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.namespace);
      const value = await this.redis.get(fullKey);
      
      if (value !== null) {
        this.stats.hits++;
        const parsed = JSON.parse(value);
        logger.debug('Cache hit', { key: fullKey });
        return parsed;
      } else {
        this.stats.misses++;
        logger.debug('Cache miss', { key: fullKey });
        return null;
      }
    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options: ICacheOptions = {}): Promise<void> {
    try {
      const fullKey = this.buildKey(key, options.namespace);
      const ttl = options.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      
      await this.redis.setex(fullKey, ttl, serialized);
      
      // Add tags if provided
      if (options.tags && options.tags.length > 0) {
        await this.addTags(fullKey, options.tags);
      }
      
      logger.debug('Cache set', { key: fullKey, ttl });
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, namespace?: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key, namespace);
      await this.redis.del(fullKey);
      logger.debug('Cache delete', { key: fullKey });
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[], namespace?: string): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, namespace));
      const values = await this.redis.mget(...fullKeys);
      
      return values.map(value => {
        if (value !== null) {
          this.stats.hits++;
          return JSON.parse(value);
        } else {
          this.stats.misses++;
          return null;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset<T>(keyValuePairs: Array<{key: string, value: T}>, options: ICacheOptions = {}): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const ttl = options.ttl || this.defaultTTL;
      
      keyValuePairs.forEach(({ key, value }) => {
        const fullKey = this.buildKey(key, options.namespace);
        const serialized = JSON.stringify(value);
        pipeline.setex(fullKey, ttl, serialized);
      });
      
      await pipeline.exec();
      logger.debug('Cache mset', { count: keyValuePairs.length, ttl });
    } catch (error) {
      logger.error('Cache mset error:', error);
    }
  }

  /**
   * Increment counter in cache
   */
  async increment(key: string, namespace?: string, amount: number = 1): Promise<number> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const result = await this.redis.incrby(fullKey, amount);
      return result;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, seconds: number, namespace?: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key, namespace);
      await this.redis.expire(fullKey, seconds);
    } catch (error) {
      logger.error('Cache expire error:', error);
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: ICacheOptions = {}
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key, options);
      if (cached !== null) {
        return cached;
      }
      
      const value = await factory();
      await this.set(key, value, options);
      return value;
    } catch (error) {
      logger.error('Cache getOrSet error:', error);
      return await factory();
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string, namespace?: string): Promise<void> {
    try {
      const fullPattern = this.buildKey(pattern, namespace);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug('Cache invalidate pattern', { pattern: fullPattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Cache invalidate pattern error:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.redis.smembers(tagKey);
        
        if (keys.length > 0) {
          pipeline.del(...keys);
          pipeline.del(tagKey);
        }
      }
      
      await pipeline.exec();
      logger.debug('Cache invalidate by tags', { tags });
    } catch (error) {
      logger.error('Cache invalidate by tags error:', error);
    }
  }

  /**
   * Clear all cache
   */
  async clear(namespace?: string): Promise<void> {
    try {
      if (namespace) {
        const pattern = this.buildKey('*', namespace);
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        await this.redis.flushdb();
      }
      logger.debug('Cache cleared', { namespace });
    } catch (error) {
      logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<ICacheStats> {
    try {
      const info = await this.redis.info('memory');
      const keyspaceInfo = await this.redis.info('keyspace');
      
      // Parse memory usage
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      // Parse total keys
      const keysMatch = keyspaceInfo.match(/keys=(\d+)/);
      const totalKeys = keysMatch ? parseInt(keysMatch[1]) : 0;
      
      const hitRate = this.stats.hits + this.stats.misses > 0 
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
        : 0;
      
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: Math.round(hitRate * 100) / 100,
        totalKeys,
        memoryUsage
      };
    } catch (error) {
      logger.error('Get cache stats error:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
        totalKeys: 0,
        memoryUsage: 0
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Cache health check error:', error);
      return false;
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Redis close error:', error);
    }
  }

  /**
   * Private helper methods
   */
  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private async addTags(key: string, tags: string[]): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      tags.forEach(tag => {
        const tagKey = `tag:${tag}`;
        pipeline.sadd(tagKey, key);
      });
      
      await pipeline.exec();
    } catch (error) {
      logger.error('Add tags error:', error);
    }
  }
}

// Application-specific cache methods
export class ApplicationCacheService extends CacheService {
  /**
   * Cache user data
   */
  async cacheUser(userId: string, userData: any, ttl: number = 3600): Promise<void> {
    await this.set(`user:${userId}`, userData, { ttl, namespace: 'users' });
  }

  /**
   * Get cached user data
   */
  async getCachedUser(userId: string): Promise<any | null> {
    return await this.get(`user:${userId}`, { namespace: 'users' });
  }

  /**
   * Cache product data
   */
  async cacheProduct(productId: string, productData: any, ttl: number = 1800): Promise<void> {
    await this.set(`product:${productId}`, productData, { 
      ttl, 
      namespace: 'products',
      tags: ['products', `category:${productData.category}`]
    });
  }

  /**
   * Get cached product data
   */
  async getCachedProduct(productId: string): Promise<any | null> {
    return await this.get(`product:${productId}`, { namespace: 'products' });
  }

  /**
   * Cache order data
   */
  async cacheOrder(orderId: string, orderData: any, ttl: number = 900): Promise<void> {
    await this.set(`order:${orderId}`, orderData, { 
      ttl, 
      namespace: 'orders',
      tags: ['orders', `status:${orderData.status}`]
    });
  }

  /**
   * Get cached order data
   */
  async getCachedOrder(orderId: string): Promise<any | null> {
    return await this.get(`order:${orderId}`, { namespace: 'orders' });
  }

  /**
   * Cache analytics data
   */
  async cacheAnalytics(key: string, data: any, ttl: number = 300): Promise<void> {
    await this.set(key, data, { ttl, namespace: 'analytics', tags: ['analytics'] });
  }

  /**
   * Get cached analytics data
   */
  async getCachedAnalytics(key: string): Promise<any | null> {
    return await this.get(key, { namespace: 'analytics' });
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(searchKey: string, results: any, ttl: number = 600): Promise<void> {
    await this.set(`search:${searchKey}`, results, { 
      ttl, 
      namespace: 'search',
      tags: ['search']
    });
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(searchKey: string): Promise<any | null> {
    return await this.get(`search:${searchKey}`, { namespace: 'search' });
  }

  /**
   * Cache session data
   */
  async cacheSession(sessionId: string, sessionData: any, ttl: number = 86400): Promise<void> {
    await this.set(`session:${sessionId}`, sessionData, { 
      ttl, 
      namespace: 'sessions',
      tags: ['sessions']
    });
  }

  /**
   * Get cached session data
   */
  async getCachedSession(sessionId: string): Promise<any | null> {
    return await this.get(`session:${sessionId}`, { namespace: 'sessions' });
  }

  /**
   * Invalidate user-related cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await this.delete(`user:${userId}`, 'users');
    await this.invalidateByTags([`user:${userId}`]);
  }

  /**
   * Invalidate product-related cache
   */
  async invalidateProductCache(productId: string, category?: string): Promise<void> {
    await this.delete(`product:${productId}`, 'products');
    if (category) {
      await this.invalidateByTags([`category:${category}`]);
    }
  }

  /**
   * Invalidate order-related cache
   */
  async invalidateOrderCache(orderId: string, status?: string): Promise<void> {
    await this.delete(`order:${orderId}`, 'orders');
    if (status) {
      await this.invalidateByTags([`status:${status}`]);
    }
  }

  /**
   * Invalidate analytics cache
   */
  async invalidateAnalyticsCache(): Promise<void> {
    await this.invalidateByTags(['analytics']);
  }

  /**
   * Invalidate search cache
   */
  async invalidateSearchCache(): Promise<void> {
    await this.invalidateByTags(['search']);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUpCache(): Promise<void> {
    try {
      logger.info('Starting cache warm-up...');
      
      // This would contain logic to pre-populate cache with frequently accessed data
      // For example: top products, active users, etc.
      
      logger.info('Cache warm-up completed');
    } catch (error) {
      logger.error('Cache warm-up error:', error);
    }
  }
}

// Singleton instances
let cacheService: CacheService;
let applicationCacheService: ApplicationCacheService;

export const getCacheService = (): CacheService => {
  if (!cacheService) {
    cacheService = new CacheService();
  }
  return cacheService;
};

export const getApplicationCacheService = (): ApplicationCacheService => {
  if (!applicationCacheService) {
    applicationCacheService = new ApplicationCacheService();
  }
  return applicationCacheService;
};

export default getApplicationCacheService();