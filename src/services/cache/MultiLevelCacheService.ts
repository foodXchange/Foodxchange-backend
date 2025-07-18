import NodeCache from 'node-cache';
import Redis from 'ioredis';
import { Logger } from '../../core/logging/logger';
import { prometheusMetrics } from '../metrics/PrometheusMetricsService';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  priority?: 'low' | 'medium' | 'high';
  compress?: boolean;
  namespace?: string;
}

export interface CacheStats {
  localCacheHits: number;
  localCacheMisses: number;
  redisCacheHits: number;
  redisCacheMisses: number;
  localCacheSize: number;
  totalOperations: number;
}

export class MultiLevelCacheService {
  private static instance: MultiLevelCacheService;
  private logger: Logger;
  private localCache: NodeCache;
  private redisClient: Redis;
  private stats: CacheStats;

  // Cache configuration
  private readonly LOCAL_CACHE_CONFIG = {
    stdTTL: 300, // 5 minutes default
    checkperiod: 600, // Check for expired keys every 10 minutes
    maxKeys: 1000, // Maximum number of keys in local cache
    useClones: false, // Don't clone objects for better performance
  };

  private readonly REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    commandTimeout: 5000,
  };

  constructor() {
    this.logger = new Logger('MultiLevelCacheService');
    this.stats = {
      localCacheHits: 0,
      localCacheMisses: 0,
      redisCacheHits: 0,
      redisCacheMisses: 0,
      localCacheSize: 0,
      totalOperations: 0,
    };

    this.initializeLocalCache();
    this.initializeRedisCache();
    this.startMetricsCollection();
  }

  static getInstance(): MultiLevelCacheService {
    if (!MultiLevelCacheService.instance) {
      MultiLevelCacheService.instance = new MultiLevelCacheService();
    }
    return MultiLevelCacheService.instance;
  }

  private initializeLocalCache(): void {
    this.localCache = new NodeCache(this.LOCAL_CACHE_CONFIG);
    
    // Set up event listeners for cache statistics
    this.localCache.on('set', (key, value) => {
      this.stats.localCacheSize = this.localCache.keys().length;
      this.logger.debug(`Local cache set: ${key}`);
    });

    this.localCache.on('del', (key, value) => {
      this.stats.localCacheSize = this.localCache.keys().length;
      this.logger.debug(`Local cache delete: ${key}`);
    });

    this.localCache.on('expired', (key, value) => {
      this.stats.localCacheSize = this.localCache.keys().length;
      this.logger.debug(`Local cache expired: ${key}`);
    });

    this.logger.info('Local cache initialized successfully');
  }

  private initializeRedisCache(): void {
    this.redisClient = new Redis(this.REDIS_CONFIG);

    this.redisClient.on('connect', () => {
      this.logger.info('Redis cache connected successfully');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error('Redis cache connection error:', error);
    });

    this.redisClient.on('close', () => {
      this.logger.warn('Redis cache connection closed');
    });

    this.redisClient.on('reconnecting', () => {
      this.logger.info('Redis cache reconnecting...');
    });
  }

  private startMetricsCollection(): void {
    // Update metrics every 30 seconds
    setInterval(() => {
      this.updateMetrics();
    }, 30000);
  }

  private updateMetrics(): void {
    // Update cache hit rates
    const localHitRate = this.stats.totalOperations > 0 
      ? (this.stats.localCacheHits / this.stats.totalOperations) * 100 
      : 0;
    
    const redisHitRate = this.stats.totalOperations > 0 
      ? (this.stats.redisCacheHits / this.stats.totalOperations) * 100 
      : 0;

    prometheusMetrics.setCacheHitRate('local', localHitRate);
    prometheusMetrics.setCacheHitRate('redis', redisHitRate);
  }

  private generateKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Get value from cache (checks local cache first, then Redis)
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.generateKey(key, options.namespace);
    this.stats.totalOperations++;

    try {
      // Check local cache first
      const localValue = this.localCache.get<T>(fullKey);
      if (localValue !== undefined) {
        this.stats.localCacheHits++;
        prometheusMetrics.recordCacheOperation('get', 'local', true);
        this.logger.debug(`Cache hit (local): ${fullKey}`);
        return localValue;
      }

      this.stats.localCacheMisses++;
      prometheusMetrics.recordCacheOperation('get', 'local', false);

      // Check Redis cache
      const redisValue = await this.redisClient.get(fullKey);
      if (redisValue !== null) {
        this.stats.redisCacheHits++;
        prometheusMetrics.recordCacheOperation('get', 'redis', true);
        
        const parsedValue = JSON.parse(redisValue) as T;
        
        // Store in local cache for faster access next time
        const localTTL = Math.min(options.ttl || this.LOCAL_CACHE_CONFIG.stdTTL, this.LOCAL_CACHE_CONFIG.stdTTL);
        this.localCache.set(fullKey, parsedValue, localTTL);
        
        this.logger.debug(`Cache hit (redis): ${fullKey}`);
        return parsedValue;
      }

      this.stats.redisCacheMisses++;
      prometheusMetrics.recordCacheOperation('get', 'redis', false);
      this.logger.debug(`Cache miss: ${fullKey}`);
      
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${fullKey}:`, error);
      prometheusMetrics.recordCacheOperation('get', 'error', false);
      return null;
    }
  }

  /**
   * Set value in cache (stores in both local cache and Redis)
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);
    const ttl = options.ttl || this.LOCAL_CACHE_CONFIG.stdTTL;

    try {
      // Store in local cache
      const localTTL = Math.min(ttl, this.LOCAL_CACHE_CONFIG.stdTTL);
      this.localCache.set(fullKey, value, localTTL);
      
      // Store in Redis
      const serializedValue = JSON.stringify(value);
      await this.redisClient.setex(fullKey, ttl, serializedValue);
      
      prometheusMetrics.recordCacheOperation('set', 'local', true);
      prometheusMetrics.recordCacheOperation('set', 'redis', true);
      
      this.logger.debug(`Cache set: ${fullKey} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      this.logger.error(`Cache set error for key ${fullKey}:`, error);
      prometheusMetrics.recordCacheOperation('set', 'error', false);
      return false;
    }
  }

  /**
   * Delete value from cache (removes from both local cache and Redis)
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);

    try {
      // Delete from local cache
      this.localCache.del(fullKey);
      
      // Delete from Redis
      await this.redisClient.del(fullKey);
      
      prometheusMetrics.recordCacheOperation('delete', 'local', true);
      prometheusMetrics.recordCacheOperation('delete', 'redis', true);
      
      this.logger.debug(`Cache delete: ${fullKey}`);
      return true;
    } catch (error) {
      this.logger.error(`Cache delete error for key ${fullKey}:`, error);
      prometheusMetrics.recordCacheOperation('delete', 'error', false);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.generateKey(key, options.namespace);

    try {
      // Check local cache first
      if (this.localCache.has(fullKey)) {
        return true;
      }

      // Check Redis
      const exists = await this.redisClient.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Cache exists check error for key ${fullKey}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(namespace?: string): Promise<void> {
    try {
      if (namespace) {
        // Clear specific namespace
        const pattern = `${namespace}:*`;
        
        // Clear from local cache
        const localKeys = this.localCache.keys().filter(key => key.startsWith(`${namespace}:`));
        localKeys.forEach(key => this.localCache.del(key));
        
        // Clear from Redis
        const redisKeys = await this.redisClient.keys(pattern);
        if (redisKeys.length > 0) {
          await this.redisClient.del(...redisKeys);
        }
        
        this.logger.info(`Cache cleared for namespace: ${namespace}`);
      } else {
        // Clear all cache
        this.localCache.flushAll();
        await this.redisClient.flushdb();
        
        this.logger.info('All cache cleared');
      }
    } catch (error) {
      this.logger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      localCacheSize: this.localCache.keys().length,
    };
  }

  /**
   * Get cache keys
   */
  async getKeys(namespace?: string): Promise<string[]> {
    try {
      const localKeys = this.localCache.keys();
      const redisKeys = await this.redisClient.keys(namespace ? `${namespace}:*` : '*');
      
      // Combine and deduplicate
      const allKeys = [...new Set([...localKeys, ...redisKeys])];
      
      return namespace 
        ? allKeys.filter(key => key.startsWith(`${namespace}:`))
        : allKeys;
    } catch (error) {
      this.logger.error('Get cache keys error:', error);
      return [];
    }
  }

  /**
   * Get or set pattern - if key doesn't exist, execute function and cache result
   */
  async getOrSet<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute function to get fresh data
    const freshData = await fetchFunction();
    
    // Cache the result
    await this.set(key, freshData, options);
    
    return freshData;
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // Invalidate from local cache
      const localKeys = this.localCache.keys().filter(key => key.includes(pattern));
      localKeys.forEach(key => this.localCache.del(key));

      // Invalidate from Redis
      const redisKeys = await this.redisClient.keys(`*${pattern}*`);
      if (redisKeys.length > 0) {
        await this.redisClient.del(...redisKeys);
      }

      this.logger.info(`Cache invalidated for pattern: ${pattern}`);
    } catch (error) {
      this.logger.error(`Cache invalidate pattern error: ${pattern}`, error);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      await this.redisClient.quit();
      this.logger.info('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
}

// Export singleton instance
export const multiLevelCache = MultiLevelcacheService;