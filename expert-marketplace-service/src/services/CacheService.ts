import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';
import { config } from '../config';
import crypto from 'crypto';

const logger = new Logger('CacheService');

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Tags for cache invalidation
  version?: string; // Cache version for invalidation
}

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private fallbackCache: Map<string, { value: any; expiry: number }> = new Map();
  
  // Cache configuration
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly MAX_FALLBACK_SIZE = 1000;
  
  // Cache key prefixes
  private readonly PREFIXES = {
    EXPERT_PROFILE: 'expert:profile:',
    EXPERT_SEARCH: 'expert:search:',
    EXPERT_SERVICES: 'expert:services:',
    EXPERT_AVAILABILITY: 'expert:availability:',
    EXPERT_REVIEWS: 'expert:reviews:',
    COLLABORATION: 'collaboration:',
    ANALYTICS: 'analytics:',
  };

  constructor() {
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.client = createClient({
        url: config.redis.url,
        password: config.redis.password,
        database: config.redis.db,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis reconnection limit reached');
              return null;
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis connected for caching');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis, using fallback cache', error);
      this.isConnected = false;
    }
  }

  /**
   * Get item from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isConnected) {
        const value = await this.client.get(key);
        if (value) {
          logger.debug(`Cache hit: ${key}`);
          return JSON.parse(value);
        }
      } else {
        // Fallback to in-memory cache
        const cached = this.fallbackCache.get(key);
        if (cached && cached.expiry > Date.now()) {
          logger.debug(`Fallback cache hit: ${key}`);
          return cached.value;
        }
        this.fallbackCache.delete(key);
      }
      
      logger.debug(`Cache miss: ${key}`);
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set item in cache
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = options.ttl || this.DEFAULT_TTL;
      const serialized = JSON.stringify(value);

      if (this.isConnected) {
        await this.client.setEx(key, ttl, serialized);
        
        // Store tags for invalidation
        if (options.tags && options.tags.length > 0) {
          await this.tagKeys(key, options.tags);
        }
      } else {
        // Fallback to in-memory cache
        this.fallbackCache.set(key, {
          value,
          expiry: Date.now() + (ttl * 1000)
        });
        
        // Limit fallback cache size
        if (this.fallbackCache.size > this.MAX_FALLBACK_SIZE) {
          const firstKey = this.fallbackCache.keys().next().value;
          this.fallbackCache.delete(firstKey);
        }
      }
      
      logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  /**
   * Delete item from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.del(key);
      } else {
        this.fallbackCache.delete(key);
      }
      logger.debug(`Cache delete: ${key}`);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Delete multiple items by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      if (this.isConnected) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
          logger.debug(`Cache delete pattern: ${pattern} (${keys.length} keys)`);
        }
      } else {
        // Fallback cache pattern deletion
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        for (const key of this.fallbackCache.keys()) {
          if (regex.test(key)) {
            this.fallbackCache.delete(key);
          }
        }
      }
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      if (!this.isConnected) return;

      const keysToDelete: string[] = [];
      
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.client.sMembers(tagKey);
        keysToDelete.push(...keys);
      }

      if (keysToDelete.length > 0) {
        await this.client.del(keysToDelete);
        logger.debug(`Cache invalidated by tags: ${tags.join(', ')} (${keysToDelete.length} keys)`);
      }

      // Clean up tag sets
      await Promise.all(tags.map(tag => this.client.del(`tag:${tag}`)));
    } catch (error) {
      logger.error('Cache invalidate by tags error:', error);
    }
  }

  /**
   * Tag keys for invalidation
   */
  private async tagKeys(key: string, tags: string[]): Promise<void> {
    if (!this.isConnected) return;

    const pipeline = this.client.multi();
    
    for (const tag of tags) {
      pipeline.sAdd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, this.DEFAULT_TTL);
    }
    
    await pipeline.exec();
  }

  /**
   * Cache wrapper for async functions
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, options);
    
    return result;
  }

  /**
   * Generate cache key with version
   */
  generateKey(prefix: string, params: Record<string, any>, version?: string): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(sortedParams))
      .digest('hex');

    return version ? `${prefix}${version}:${hash}` : `${prefix}${hash}`;
  }

  // Expert-specific cache methods

  /**
   * Cache expert profile
   */
  async cacheExpertProfile(expertId: string, profile: any): Promise<void> {
    const key = `${this.PREFIXES.EXPERT_PROFILE}${expertId}`;
    await this.set(key, profile, {
      ttl: 3600, // 1 hour
      tags: ['expert', `expert:${expertId}`]
    });
  }

  /**
   * Get cached expert profile
   */
  async getCachedExpertProfile(expertId: string): Promise<any | null> {
    const key = `${this.PREFIXES.EXPERT_PROFILE}${expertId}`;
    return this.get(key);
  }

  /**
   * Cache expert search results
   */
  async cacheSearchResults(
    searchParams: Record<string, any>,
    results: any[],
    userId?: string
  ): Promise<void> {
    const key = this.generateKey(
      this.PREFIXES.EXPERT_SEARCH,
      { ...searchParams, userId }
    );
    
    await this.set(key, results, {
      ttl: 300, // 5 minutes
      tags: ['search', 'expert-search']
    });
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(
    searchParams: Record<string, any>,
    userId?: string
  ): Promise<any[] | null> {
    const key = this.generateKey(
      this.PREFIXES.EXPERT_SEARCH,
      { ...searchParams, userId }
    );
    
    return this.get(key);
  }

  /**
   * Cache expert services
   */
  async cacheExpertServices(expertId: string, services: any[]): Promise<void> {
    const key = `${this.PREFIXES.EXPERT_SERVICES}${expertId}`;
    await this.set(key, services, {
      ttl: 1800, // 30 minutes
      tags: ['services', `expert:${expertId}`]
    });
  }

  /**
   * Cache expert availability
   */
  async cacheExpertAvailability(
    expertId: string,
    date: string,
    availability: any
  ): Promise<void> {
    const key = `${this.PREFIXES.EXPERT_AVAILABILITY}${expertId}:${date}`;
    await this.set(key, availability, {
      ttl: 300, // 5 minutes
      tags: ['availability', `expert:${expertId}`]
    });
  }

  /**
   * Invalidate expert cache
   */
  async invalidateExpertCache(expertId: string): Promise<void> {
    await this.invalidateByTags([`expert:${expertId}`]);
  }

  /**
   * Cache analytics data
   */
  async cacheAnalytics(
    type: string,
    params: Record<string, any>,
    data: any,
    ttl: number = 3600
  ): Promise<void> {
    const key = this.generateKey(
      `${this.PREFIXES.ANALYTICS}${type}:`,
      params
    );
    
    await this.set(key, data, {
      ttl,
      tags: ['analytics', `analytics:${type}`]
    });
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmupCache(): Promise<void> {
    logger.info('Starting cache warmup...');
    
    try {
      // Warm up top experts
      // This would fetch and cache top experts from database
      
      logger.info('Cache warmup completed');
    } catch (error) {
      logger.error('Cache warmup error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage?: string;
    keyCount?: number;
    hitRate?: number;
  }> {
    if (!this.isConnected) {
      return {
        connected: false,
        keyCount: this.fallbackCache.size
      };
    }

    try {
      const info = await this.client.info('memory');
      const dbSize = await this.client.dbSize();
      
      return {
        connected: true,
        memoryUsage: info.match(/used_memory_human:(.+)/)?.[1] || 'unknown',
        keyCount: dbSize
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return { connected: this.isConnected };
    }
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    this.fallbackCache.clear();
  }
}