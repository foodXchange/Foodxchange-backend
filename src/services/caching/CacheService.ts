import Redis from 'ioredis';

import { Logger } from '../../core/logging/logger';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  version?: string; // Cache version
  compress?: boolean; // Enable compression for large data
  serialize?: boolean; // Enable custom serialization
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  hitRate: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface CachePattern {
  pattern: string;
  ttl: number;
  tags: string[];
  description: string;
}

export class CacheService {
  private readonly redis: Redis;
  private readonly logger: Logger;
  private readonly stats: CacheStats;
  private readonly defaultTTL: number = 3600; // 1 hour
  private readonly keyPrefix: string = 'foodx:';

  // Cache patterns for different data types
  private readonly patterns: Map<string, CachePattern> = new Map([
    ['user', { pattern: 'user:{id}', ttl: 1800, tags: ['users'], description: 'User profile data' }],
    ['company', { pattern: 'company:{id}', ttl: 3600, tags: ['companies'], description: 'Company information' }],
    ['product', { pattern: 'product:{id}', ttl: 1800, tags: ['products'], description: 'Product details' }],
    ['rfq', { pattern: 'rfq:{id}', ttl: 900, tags: ['rfqs'], description: 'RFQ data' }],
    ['proposal', { pattern: 'proposal:{id}', ttl: 900, tags: ['proposals'], description: 'Proposal data' }],
    ['session', { pattern: 'session:{token}', ttl: 7200, tags: ['sessions'], description: 'User sessions' }],
    ['search', { pattern: 'search:{query}:{filters}', ttl: 300, tags: ['search'], description: 'Search results' }],
    ['analytics', { pattern: 'analytics:{type}:{period}', ttl: 1800, tags: ['analytics'], description: 'Analytics data' }],
    ['notifications', { pattern: 'notifications:{userId}', ttl: 300, tags: ['notifications'], description: 'User notifications' }],
    ['feed', { pattern: 'feed:{userId}:{type}', ttl: 600, tags: ['feeds'], description: 'Activity feeds' }]
  ]);

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      commandTimeout: 5000,
      keyPrefix: this.keyPrefix
    });

    this.logger = new Logger('CacheService');
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      hitRate: 0,
      memory: { used: 0, total: 0, percentage: 0 }
    };

    this.setupEventHandlers();
    this.startStatsCollection();
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      this.logger.info('Redis connection established');
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis is ready for operations');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      this.logger.info('Redis reconnecting...');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options?: { deserialize?: boolean }): Promise<T | null> {
    try {
      const value = await this.redis.get(key);

      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;

      if (options?.deserialize !== false) {
        try {
          return JSON.parse(value) as T;
        } catch (error) {
          this.logger.warn('Failed to deserialize cached value:', error);
          return value as unknown as T;
        }
      }

      return value as unknown as T;
    } catch (error) {
      this.logger.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const {
        ttl = this.defaultTTL,
        tags = [],
        version,
        serialize = true
      } = options;

      let serializedValue: string;

      if (serialize) {
        serializedValue = JSON.stringify(value);
      } else {
        serializedValue = value as unknown as string;
      }

      // Set the main cache entry
      let result: string;
      if (ttl > 0) {
        result = await this.redis.setex(key, ttl, serializedValue);
      } else {
        result = await this.redis.set(key, serializedValue);
      }

      // Add to tag sets for cache invalidation
      if (tags.length > 0) {
        const tagPromises = tags.map(async tag =>
          this.redis.sadd(`tag:${tag}`, key)
        );
        await Promise.all(tagPromises);
      }

      // Set version if provided
      if (version) {
        await this.redis.set(`version:${key}`, version);
      }

      this.stats.sets++;
      return result === 'OK';
    } catch (error) {
      this.logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);

      // Also delete version info
      await this.redis.del(`version:${key}`);

      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      const values = await this.redis.mget(...keys);

      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }

        this.stats.hits++;
        try {
          return JSON.parse(value) as T;
        } catch (error) {
          return value as unknown as T;
        }
      });
    } catch (error) {
      this.logger.error('Cache mget error:', error);
      this.stats.misses += keys.length;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const { key, value, options = {} } = entry;
        const { ttl = this.defaultTTL, serialize = true } = options;

        let serializedValue: string;
        if (serialize) {
          serializedValue = JSON.stringify(value);
        } else {
          serializedValue = value as unknown as string;
        }

        if (ttl > 0) {
          pipeline.setex(key, ttl, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      }

      const results = await pipeline.exec();
      this.stats.sets += entries.length;

      return results?.every(result => result[1] === 'OK') ?? false;
    } catch (error) {
      this.logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Increment counter in cache
   */
  async increment(key: string, amount: number = 1, ttl?: number): Promise<number> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incrby(key, amount);

      if (ttl) {
        pipeline.expire(key, ttl);
      }

      const results = await pipeline.exec();
      return results?.[0]?.[1] as number || 0;
    } catch (error) {
      this.logger.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Decrement counter in cache
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(key, amount);
    } catch (error) {
      this.logger.error('Cache decrement error:', error);
      return 0;
    }
  }

  /**
   * Set with expiration time
   */
  async setWithExpiry<T>(
    key: string,
    value: T,
    expiryInSeconds: number
  ): Promise<boolean> {
    return this.set(key, value, { ttl: expiryInSeconds });
  }

  /**
   * Get or set pattern - cache-aside pattern
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, generate new value
    const value = await factory();

    // Store in cache for next time
    await this.set(key, value, options);

    return value;
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let deletedCount = 0;

      for (const tag of tags) {
        const keys = await this.redis.smembers(`tag:${tag}`);

        if (keys.length > 0) {
          const pipeline = this.redis.pipeline();

          // Delete all keys with this tag
          keys.forEach(key => pipeline.del(key));

          // Remove the tag set
          pipeline.del(`tag:${tag}`);

          const results = await pipeline.exec();
          deletedCount += keys.length;
        }
      }

      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      this.logger.error('Cache tag invalidation error:', error);
      return 0;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deletedCount = await this.redis.del(...keys);
      this.stats.deletes += deletedCount;

      return deletedCount;
    } catch (error) {
      this.logger.error('Cache pattern invalidation error:', error);
      return 0;
    }
  }

  /**
   * Clear entire cache
   */
  async clear(): Promise<boolean> {
    try {
      await this.redis.flushdb();
      this.logger.info('Cache cleared successfully');
      return true;
    } catch (error) {
      this.logger.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const maxMemoryMatch = info.match(/maxmemory:(\d+)/);

      const usedMemory = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      const maxMemory = maxMemoryMatch ? parseInt(maxMemoryMatch[1]) : 0;

      this.stats.hitRate = this.stats.hits + this.stats.misses > 0
        ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100
        : 0;

      this.stats.memory = {
        used: usedMemory,
        total: maxMemory,
        percentage: maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0
      };

      return { ...this.stats };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      return this.stats;
    }
  }

  /**
   * Get cache health status
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    ping: number;
    memory: number;
    hitRate: number;
    details: Record<string, any>;
  }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const ping = Date.now() - start;

      const stats = await this.getStats();

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (ping > 100 || stats.memory.percentage > 90 || stats.hitRate < 50) {
        status = 'degraded';
      }

      if (ping > 1000 || stats.memory.percentage > 95) {
        status = 'unhealthy';
      }

      return {
        status,
        ping,
        memory: stats.memory.percentage,
        hitRate: stats.hitRate,
        details: {
          connected: true,
          stats,
          patterns: Array.from(this.patterns.entries())
        }
      };
    } catch (error) {
      this.logger.error('Cache health check failed:', error);
      return {
        status: 'unhealthy',
        ping: -1,
        memory: 0,
        hitRate: 0,
        details: { error: error.message }
      };
    }
  }

  /**
   * Warm cache with predefined data
   */
  async warmCache(warmupData: Array<{
    key: string;
    factory: () => Promise<any>;
    options?: CacheOptions;
  }>): Promise<void> {
    this.logger.info(`Warming cache with ${warmupData.length} entries...`);

    const promises = warmupData.map(async ({ key, factory, options }) => {
      try {
        const exists = await this.exists(key);
        if (!exists) {
          const value = await factory();
          await this.set(key, value, options);
        }
      } catch (error) {
        this.logger.error(`Failed to warm cache for key ${key}:`, error);
      }
    });

    await Promise.all(promises);
    this.logger.info('Cache warmup completed');
  }

  /**
   * Start collecting cache statistics
   */
  private startStatsCollection(): void {
    setInterval(async () => {
      try {
        await this.getStats();
      } catch (error) {
        this.logger.error('Error collecting cache stats:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Get cache pattern by name
   */
  getPattern(name: string): CachePattern | undefined {
    return this.patterns.get(name);
  }

  /**
   * Add or update cache pattern
   */
  setPattern(name: string, pattern: CachePattern): void {
    this.patterns.set(name, pattern);
  }

  /**
   * Build cache key from pattern
   */
  buildKey(patternName: string, params: Record<string, string>): string {
    const pattern = this.patterns.get(patternName);
    if (!pattern) {
      throw new Error(`Cache pattern '${patternName}' not found`);
    }

    let key = pattern.pattern;
    Object.entries(params).forEach(([param, value]) => {
      key = key.replace(`{${param}}`, value);
    });

    return key;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
}

export const cacheService = new CacheService();
