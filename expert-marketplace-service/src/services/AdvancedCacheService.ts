import { Redis } from 'ioredis';
import { Logger } from '../utils/logger';
import { config } from '../config';

const logger = new Logger('AdvancedCacheService');

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  version?: string;
  serialize?: boolean;
  compress?: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  avgResponseTime: number;
}

export class AdvancedCacheService {
  private primaryClient: Redis;
  private replicaClient: Redis;
  private metrics: CacheMetrics;
  private compressionThreshold: number = 1024; // 1KB

  constructor() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      avgResponseTime: 0
    };

    this.initializeClients();
  }

  private initializeClients(): void {
    // Primary Redis instance (writes)
    this.primaryClient = new Redis({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      keyPrefix: 'foodx:expert:',
    });

    // Replica Redis instance (reads) - fallback to primary if not configured
    this.replicaClient = config.redis?.replicaHost ? new Redis({
      host: config.redis.replicaHost,
      port: config.redis.replicaPort || 6379,
      password: config.redis.password,
      db: config.redis.db || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      readOnly: true,
      keyPrefix: 'foodx:expert:',
    }) : this.primaryClient;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.primaryClient.on('error', (error) => {
      logger.error('Primary Redis connection error:', error);
      this.metrics.errors++;
    });

    this.replicaClient.on('error', (error) => {
      logger.error('Replica Redis connection error:', error);
      this.metrics.errors++;
    });

    this.primaryClient.on('ready', () => {
      logger.info('Primary Redis connection established');
    });

    this.replicaClient.on('ready', () => {
      logger.info('Replica Redis connection established');
    });
  }

  /**
   * Multi-layer caching with compression and versioning
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Try L1 cache (in-memory) first for hot data
      const l1Result = await this.getFromL1Cache(key);
      if (l1Result !== null) {
        this.updateMetrics('hit', Date.now() - startTime);
        return l1Result as T;
      }

      // Try L2 cache (Redis replica)
      const versionedKey = this.getVersionedKey(key, options.version);
      let cachedData = await this.replicaClient.get(versionedKey);
      
      if (cachedData === null) {
        this.updateMetrics('miss', Date.now() - startTime);
        return null;
      }

      // Handle compressed data
      if (cachedData.startsWith('COMPRESSED:')) {
        cachedData = await this.decompress(cachedData.substring(11));
      }

      let parsedData: T;
      if (options.serialize !== false) {
        parsedData = JSON.parse(cachedData);
      } else {
        parsedData = cachedData as T;
      }

      // Store in L1 cache for future requests
      await this.setToL1Cache(key, parsedData);
      
      this.updateMetrics('hit', Date.now() - startTime);
      return parsedData;
    } catch (error) {
      logger.error('Cache get error:', error);
      this.updateMetrics('error', Date.now() - startTime);
      return null;
    }
  }

  /**
   * Set data with intelligent caching strategies
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      const ttl = options.ttl || 3600; // Default 1 hour
      const versionedKey = this.getVersionedKey(key, options.version);
      
      let serializedData: string;
      if (options.serialize !== false) {
        serializedData = JSON.stringify(value);
      } else {
        serializedData = value as string;
      }

      // Compress large data
      if (options.compress !== false && serializedData.length > this.compressionThreshold) {
        serializedData = 'COMPRESSED:' + await this.compress(serializedData);
      }

      // Write to primary Redis
      await this.primaryClient.setex(versionedKey, ttl, serializedData);
      
      // Store tags for cache invalidation
      if (options.tags && options.tags.length > 0) {
        await this.storeTags(versionedKey, options.tags, ttl);
      }

      // Store in L1 cache
      await this.setToL1Cache(key, value);
      
      this.updateMetrics('set', Date.now() - startTime);
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      this.updateMetrics('error', Date.now() - startTime);
      return false;
    }
  }

  /**
   * Tag-based cache invalidation
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let invalidatedCount = 0;
      
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.primaryClient.smembers(tagKey);
        
        if (keys.length > 0) {
          // Delete all keys associated with this tag
          await this.primaryClient.del(...keys);
          // Clear L1 cache for these keys
          for (const key of keys) {
            await this.deleteFromL1Cache(key);
          }
          invalidatedCount += keys.length;
        }
        
        // Clean up the tag set
        await this.primaryClient.del(tagKey);
      }
      
      logger.info(`Invalidated ${invalidatedCount} cache entries for tags:`, tags);
      return invalidatedCount;
    } catch (error) {
      logger.error('Tag-based invalidation error:', error);
      return 0;
    }
  }

  /**
   * Pattern-based cache invalidation
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.primaryClient.keys(pattern);
      
      if (keys.length > 0) {
        await this.primaryClient.del(...keys);
        
        // Clear L1 cache
        for (const key of keys) {
          await this.deleteFromL1Cache(key.replace('foodx:expert:', ''));
        }
      }
      
      logger.info(`Invalidated ${keys.length} cache entries for pattern: ${pattern}`);
      return keys.length;
    } catch (error) {
      logger.error('Pattern-based invalidation error:', error);
      return 0;
    }
  }

  /**
   * Bulk operations for efficiency
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const results = await this.replicaClient.mget(keys);
      return results.map(result => {
        if (result === null) return null;
        try {
          return JSON.parse(result) as T;
        } catch {
          return result as T;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      return new Array(keys.length).fill(null);
    }
  }

  async mset<T>(data: Record<string, T>, ttl: number = 3600): Promise<boolean> {
    try {
      const pipeline = this.primaryClient.pipeline();
      
      for (const [key, value] of Object.entries(data)) {
        const serializedValue = JSON.stringify(value);
        pipeline.setex(key, ttl, serializedValue);
      }
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Cache warming strategies
   */
  async warmCache(): Promise<void> {
    logger.info('Starting cache warming...');
    
    try {
      // Warm frequently accessed data
      await this.warmExpertProfiles();
      await this.warmProductCategories();
      await this.warmSpecializations();
      
      logger.info('Cache warming completed successfully');
    } catch (error) {
      logger.error('Cache warming failed:', error);
    }
  }

  private async warmExpertProfiles(): Promise<void> {
    // This would typically fetch top experts and cache them
    // Implementation depends on business logic
    logger.info('Warming expert profiles cache...');
  }

  private async warmProductCategories(): Promise<void> {
    // Cache product categories and hierarchies
    logger.info('Warming product categories cache...');
  }

  private async warmSpecializations(): Promise<void> {
    // Cache expert specializations
    logger.info('Warming specializations cache...');
  }

  /**
   * L1 Cache (In-Memory) implementation
   */
  private l1Cache = new Map<string, { value: any; expires: number }>();
  private l1MaxSize = 1000;
  private l1TTL = 300000; // 5 minutes

  private async getFromL1Cache(key: string): Promise<any> {
    const entry = this.l1Cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.l1Cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  private async setToL1Cache(key: string, value: any): Promise<void> {
    // LRU eviction if cache is full
    if (this.l1Cache.size >= this.l1MaxSize) {
      const firstKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(firstKey);
    }
    
    this.l1Cache.set(key, {
      value,
      expires: Date.now() + this.l1TTL
    });
  }

  private async deleteFromL1Cache(key: string): Promise<void> {
    this.l1Cache.delete(key);
  }

  /**
   * Utility methods
   */
  private getVersionedKey(key: string, version?: string): string {
    return version ? `${key}:v${version}` : key;
  }

  private async storeTags(key: string, tags: string[], ttl: number): Promise<void> {
    const pipeline = this.primaryClient.pipeline();
    
    for (const tag of tags) {
      const tagKey = `tag:${tag}`;
      pipeline.sadd(tagKey, key);
      pipeline.expire(tagKey, ttl);
    }
    
    await pipeline.exec();
  }

  private async compress(data: string): Promise<string> {
    // Implement compression (e.g., using zlib)
    // For now, return as-is
    return data;
  }

  private async decompress(data: string): Promise<string> {
    // Implement decompression
    // For now, return as-is
    return data;
  }

  private updateMetrics(operation: 'hit' | 'miss' | 'set' | 'delete' | 'error', responseTime: number): void {
    this.metrics[operation === 'hit' ? 'hits' : operation === 'miss' ? 'misses' : 
                  operation === 'set' ? 'sets' : operation === 'delete' ? 'deletes' : 'errors']++;
    
    // Update average response time
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime + responseTime) / 2;
  }

  /**
   * Get cache metrics and health
   */
  getMetrics(): CacheMetrics & { hitRate: number; health: string } {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests) * 100 : 0;
    
    return {
      ...this.metrics,
      hitRate,
      health: this.metrics.errors < 10 ? 'healthy' : 'degraded'
    };
  }

  /**
   * Cleanup and connection management
   */
  async disconnect(): Promise<void> {
    await this.primaryClient.quit();
    if (this.replicaClient !== this.primaryClient) {
      await this.replicaClient.quit();
    }
    this.l1Cache.clear();
    logger.info('Cache service disconnected');
  }
}

export const advancedCacheService = new AdvancedCacheService();