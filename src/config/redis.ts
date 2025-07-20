import Redis from 'ioredis';

import { Logger } from '../core/logging/logger';

const logger = new Logger('RedisConfig');

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';
const isRedisDisabled = process.env.DISABLE_REDIS === 'true';

// Create a mock Redis client for development when Redis is not available
class MockRedisClient {
  private readonly store: Map<string, any> = new Map();
  private readonly ttls: Map<string, number> = new Map();
  public status: string = 'ready';

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    this.checkTTL(key);
    return this.store.get(key) || null;
  }

  async set(key: string, value: any): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: any): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (seconds * 1000));
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        this.ttls.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async exists(key: string): Promise<number> {
    this.checkTTL(key);
    return this.store.has(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0');
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + (seconds * 1000));
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    const expiry = this.ttls.get(key);
    if (!expiry) return -1;
    const remaining = Math.floor((expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map(key => {
      this.checkTTL(key);
      return this.store.get(key) || null;
    });
  }

  async flushdb(): Promise<'OK'> {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async info(): Promise<string> {
    return `# Mock Redis Info
used_memory_human:${Math.floor(this.store.size * 100)}K
connected_clients:1
total_commands_processed:0
keyspace_hits:0
keyspace_misses:0`;
  }

  multi() {
    const commands: Array<() => Promise<any>> = [];
    const multi = {
      incr: (key: string) => {
        commands.push(async () => this.incr(key));
        return multi;
      },
      expire: (key: string, seconds: number) => {
        commands.push(async () => this.expire(key, seconds));
        return multi;
      },
      exec: async () => {
        const results = [];
        for (const cmd of commands) {
          try {
            const result = await cmd();
            results.push([null, result]);
          } catch (error) {
            results.push([error, null]);
          }
        }
        return results;
      }
    };
    return multi;
  }

  pipeline() {
    const commands: Array<() => Promise<any>> = [];
    const pipeline = {
      setex: (key: string, seconds: number, value: any) => {
        commands.push(async () => this.setex(key, seconds, value));
        return pipeline;
      },
      set: (key: string, value: any) => {
        commands.push(async () => this.set(key, value));
        return pipeline;
      },
      exec: async () => {
        const results = [];
        for (const cmd of commands) {
          try {
            const result = await cmd();
            results.push([null, result]);
          } catch (error) {
            results.push([error, null]);
          }
        }
        return results;
      }
    };
    return pipeline;
  }

  duplicate() {
    return this;
  }

  on(event: string, callback: Function) {
    // Mock event handling
    if (event === 'connect' || event === 'ready') {
      setTimeout(() => callback(), 0);
    }
  }

  async quit() {
    return Promise.resolve('OK');
  }

  private checkTTL(key: string) {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
    }
  }
}

// Create Redis client with fallback for development
let redisClient: any;

if (isRedisDisabled || (isDevelopment && process.env.REDIS_HOST === undefined)) {
  logger.warn('Redis is disabled or not configured for development. Using in-memory mock.');
  redisClient = new MockRedisClient();
} else {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times: number) => {
      // In development, give up after 3 attempts and switch to mock
      if (isDevelopment && times > 3) {
        logger.warn('Redis connection failed in development. Switching to mock implementation.');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis connection retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        // Only reconnect when the error contains "READONLY"
        return true;
      }
      return false;
    },
    maxRetriesPerRequest: isDevelopment ? 1 : 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    lazyConnect: isDevelopment // In development, use lazy connect
  });

  // In development, if initial connection fails, switch to mock
  if (isDevelopment) {
    redisClient.on('error', (err: Error) => {
      if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
        logger.warn('Redis connection failed. Using mock implementation for development.');
        // Replace with mock
        const mockClient = new MockRedisClient();
        Object.assign(redisClient, mockClient);
      }
    });
  }
}

export { redisClient };

// Event handlers - only attach for real Redis client
if (!(redisClient instanceof MockRedisClient)) {
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err: Error) => {
    logger.error('Redis client error:', err);
  });

  redisClient.on('close', () => {
    logger.warn('Redis client connection closed');
  });

  redisClient.on('reconnecting', (delay: number) => {
    logger.info(`Redis client reconnecting in ${delay}ms`);
  });
}

// Create a separate client for pub/sub if needed
export const redisPubClient = redisClient.duplicate();
export const redisSubClient = redisClient.duplicate();

// Helper functions
export const cacheHelpers = {
  /**
   * Set value with expiration
   */
  async setWithExpiry(key: string, value: any, ttlSeconds: number): Promise<void> {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  },

  /**
   * Get and parse JSON value
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await redisClient.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Failed to parse JSON for key ${key}:`, error);
      return null;
    }
  },

  /**
   * Delete keys matching pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return 0;

    return await redisClient.del(...keys);
  },

  /**
   * Increment counter with expiration
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const multi = redisClient.multi();
    multi.incr(key);
    multi.expire(key, ttlSeconds);
    const results = await multi.exec();

    if (!results || results.length === 0) {
      throw new Error('Failed to increment counter');
    }

    return results[0][1] as number;
  },

  /**
   * Get remaining TTL
   */
  async getTTL(key: string): Promise<number> {
    return await redisClient.ttl(key);
  },

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await redisClient.exists(key);
    return result === 1;
  },

  /**
   * Set multiple keys with expiration
   */
  async setMultiple(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const pipeline = redisClient.pipeline();

    for (const item of items) {
      const value = JSON.stringify(item.value);
      if (item.ttl) {
        pipeline.setex(item.key, item.ttl, value);
      } else {
        pipeline.set(item.key, value);
      }
    }

    await pipeline.exec();
  },

  /**
   * Get multiple keys
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T>> {
    if (keys.length === 0) return new Map();

    const values = await redisClient.mget(...keys);
    const result = new Map<string, T>();

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        try {
          result.set(key, JSON.parse(value) as T);
        } catch (error) {
          logger.error(`Failed to parse JSON for key ${key}:`, error);
        }
      }
    });

    return result;
  }
};

// Cache key generators
export const cacheKeys = {
  // User cache keys
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `user:email:${email}`,
  userSession: (userId: string) => `session:${userId}`,

  // Company cache keys
  company: (companyId: string) => `company:${companyId}`,
  companyByDomain: (domain: string) => `company:domain:${domain}`,

  // Product cache keys
  product: (productId: string) => `product:${productId}`,
  productList: (tenantId: string, page: number) => `products:${tenantId}:page:${page}`,
  productSearch: (query: string) => `search:products:${query}`,

  // Order cache keys
  order: (orderId: string) => `order:${orderId}`,
  ordersByTenant: (tenantId: string) => `orders:tenant:${tenantId}`,

  // Rate limiting keys
  rateLimit: (identifier: string) => `rl:${identifier}`,
  apiUsage: (tenantId: string, date: string) => `api_usage:${tenantId}:${date}`,

  // API key cache
  apiKey: (hashedKey: string) => `api_key:${hashedKey}`,
  apiKeyUsage: (keyId: string, date: string) => `api_key_usage:${keyId}:${date}`,

  // 2FA cache keys
  twoFactorChallenge: (userId: string) => `2fa:challenge:${userId}`,
  twoFactorBackupCodes: (userId: string) => `2fa:backup:${userId}`,

  // General cache keys
  config: (key: string) => `config:${key}`,
  feature: (feature: string) => `feature:${feature}`,
  metrics: (metric: string) => `metrics:${metric}`
};

// Graceful shutdown
export const shutdownRedis = async (): Promise<void> => {
  logger.info('Shutting down Redis connections...');

  try {
    await Promise.all([
      redisClient.quit(),
      redisPubClient.quit(),
      redisSubClient.quit()
    ]);

    logger.info('Redis connections closed');
  } catch (error) {
    logger.warn('Error during Redis shutdown (may be using mock):', error);
  }
};

// Caching utility class
export class CacheService {
  private readonly defaultTTL: number = 3600; // 1 hour default

  constructor(private readonly client: typeof redisClient = redisClient) {}

  // Set cache with optional TTL
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.setex(key, this.defaultTTL, serialized);
      }
      logger.debug(`Cache set: ${key}`);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  // Get cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;

      logger.debug(`Cache hit: ${key}`);
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Delete cache
  async del(key: string | string[]): Promise<void> {
    try {
      if (Array.isArray(key)) {
        await this.client.del(...key);
        logger.debug(`Cache deleted: ${key.join(', ')}`);
      } else {
        await this.client.del(key);
        logger.debug(`Cache deleted: ${key}`);
      }
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  // Clear cache by pattern
  async clearPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        logger.debug(`Cache cleared for pattern: ${pattern} (${keys.length} keys)`);
      }
    } catch (error) {
      logger.error('Cache clear pattern error:', error);
    }
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  // Get remaining TTL
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // Cache wrapper function
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  // Invalidate related caches
  async invalidateRelated(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      await this.clearPattern(pattern);
    }
  }

  // Flush all cache (use with caution)
  async flushAll(): Promise<void> {
    try {
      await this.client.flushdb();
      logger.warn('All cache flushed');
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
  }
}

// Export cache service singleton
export const cacheService = new CacheService();

export default redisClient;
