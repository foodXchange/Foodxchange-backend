/**
 * Advanced Multi-Level Cache Service
 * Implements L1 (Memory), L2 (Redis), and L3 (CDN/Database) caching strategies
 */

import Redis from 'ioredis';
import NodeCache from 'node-cache';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { EventBus } from '../events/EventBus';

export interface CacheOptions {
  ttl?: number;
  level?: 'L1' | 'L2' | 'L3' | 'ALL';
  compress?: boolean;
  serialize?: boolean;
  tags?: string[];
  namespace?: string;
  retryOnFailure?: boolean;
  warmupStrategy?: 'eager' | 'lazy' | 'background';
}

export interface CacheStats {
  l1: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
  l2: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  l3: {
    hits: number;
    misses: number;
    hitRate: number;
  };
}

export interface CacheEntry<T = any> {
  value: T;
  metadata: {
    createdAt: Date;
    expiresAt?: Date;
    lastAccessed: Date;
    accessCount: number;
    tags?: string[];
    namespace?: string;
    level: 'L1' | 'L2' | 'L3';
  };
}

export interface CacheInvalidationStrategy {
  type: 'time' | 'tag' | 'dependency' | 'event';
  params: any;
}

export class AdvancedCacheService {
  private readonly logger = new Logger('AdvancedCacheService');
  private readonly metrics: MetricsService;
  private readonly eventBus: EventBus;
  
  // L1 Cache (Memory)
  private readonly l1Cache: NodeCache;
  
  // L2 Cache (Redis)
  private readonly l2Cache?: Redis;
  
  // Cache statistics
  private stats: CacheStats = {
    l1: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    l2: { hits: 0, misses: 0, hitRate: 0 },
    l3: { hits: 0, misses: 0, hitRate: 0 }
  };

  // Tag mappings for invalidation
  private readonly tagMappings = new Map<string, Set<string>>();
  
  // Background tasks
  private warmupTasks = new Map<string, NodeJS.Timeout>();
  private readonly compressionThreshold = 1024; // 1KB

  constructor(
    metrics: MetricsService,
    eventBus: EventBus,
    redisClient?: Redis,
    options: {
      l1MaxSize?: number;
      l1TtlSeconds?: number;
      l1CheckPeriod?: number;
    } = {}
  ) {
    this.metrics = metrics;
    this.eventBus = eventBus;
    this.l2Cache = redisClient;

    // Initialize L1 cache
    this.l1Cache = new NodeCache({
      stdTTL: options.l1TtlSeconds || 300, // 5 minutes default
      checkperiod: options.l1CheckPeriod || 120, // 2 minutes
      maxKeys: options.l1MaxSize || 10000,
      useClones: false
    });

    this.setupEventHandlers();
    this.startBackgroundTasks();
  }

  private setupEventHandlers(): void {
    // L1 cache events
    this.l1Cache.on('hit', (key) => {
      this.stats.l1.hits++;
      this.updateL1HitRate();
      this.metrics.incrementCounter('cache_l1_hits_total', { key });
    });

    this.l1Cache.on('missed', (key) => {
      this.stats.l1.misses++;
      this.updateL1HitRate();
      this.metrics.incrementCounter('cache_l1_misses_total', { key });
    });

    this.l1Cache.on('expired', (key, value) => {
      this.logger.debug('L1 cache entry expired', { key });
      this.metrics.incrementCounter('cache_l1_expired_total', { key });
    });

    // Subscribe to cache invalidation events
    this.eventBus.subscribe('cache.invalidate', {
      handle: async (event) => {
        await this.handleInvalidationEvent(event);
      }
    });
  }

  private startBackgroundTasks(): void {
    // Stats update task
    setInterval(() => {
      this.updateStats();
    }, 30000); // Every 30 seconds

    // Cache cleanup task
    setInterval(() => {
      this.performMaintenance();
    }, 300000); // Every 5 minutes
  }

  /**
   * Get value from cache with fallthrough strategy
   */
  public async get<T>(
    key: string,
    options: CacheOptions = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.buildKey(key, options.namespace);

    try {
      // L1 Cache lookup
      if (options.level !== 'L2' && options.level !== 'L3') {
        const l1Value = this.l1Cache.get<CacheEntry<T>>(fullKey);
        if (l1Value) {
          this.updateAccessMetadata(l1Value, 'L1');
          this.metrics.observeHistogram('cache_get_duration_ms', Date.now() - startTime, { level: 'L1' });
          return l1Value.value;
        }
      }

      // L2 Cache lookup (Redis)
      if (this.l2Cache && options.level !== 'L1' && options.level !== 'L3') {
        const l2Value = await this.getFromL2<T>(fullKey);
        if (l2Value) {
          // Backfill L1 cache if needed
          if (options.level !== 'L2') {
            await this.setToL1(fullKey, l2Value, options);
          }
          
          this.stats.l2.hits++;
          this.updateL2HitRate();
          this.metrics.observeHistogram('cache_get_duration_ms', Date.now() - startTime, { level: 'L2' });
          return l2Value.value;
        } else {
          this.stats.l2.misses++;
          this.updateL2HitRate();
        }
      }

      // L3 - Database/CDN would be handled by caller
      this.stats.l3.misses++;
      this.updateL3HitRate();
      
      return null;

    } catch (error) {
      this.logger.error('Cache get error', { key: fullKey, error });
      this.metrics.incrementCounter('cache_errors_total', { operation: 'get', key: fullKey });
      
      if (options.retryOnFailure) {
        // Fallback to lower cache level
        return this.getFallback<T>(key, options);
      }
      
      throw error;
    } finally {
      this.metrics.observeHistogram('cache_get_duration_ms', Date.now() - startTime);
    }
  }

  /**
   * Set value in cache with intelligent level selection
   */
  public async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const startTime = Date.now();
    const fullKey = this.buildKey(key, options.namespace);

    try {
      const entry: CacheEntry<T> = {
        value,
        metadata: {
          createdAt: new Date(),
          expiresAt: options.ttl ? new Date(Date.now() + options.ttl * 1000) : undefined,
          lastAccessed: new Date(),
          accessCount: 0,
          tags: options.tags,
          namespace: options.namespace,
          level: 'L1'
        }
      };

      // Determine optimal cache levels based on data size and options
      const levels = this.determineOptimalLevels(value, options);

      // Set in L1 cache
      if (levels.includes('L1')) {
        await this.setToL1(fullKey, entry, options);
      }

      // Set in L2 cache (Redis)
      if (levels.includes('L2') && this.l2Cache) {
        await this.setToL2(fullKey, entry, options);
      }

      // Update tag mappings
      if (options.tags) {
        this.updateTagMappings(fullKey, options.tags);
      }

      this.metrics.observeHistogram('cache_set_duration_ms', Date.now() - startTime);
      this.logger.debug('Cache set completed', { 
        key: fullKey, 
        levels: levels.join(','),
        ttl: options.ttl 
      });

    } catch (error) {
      this.logger.error('Cache set error', { key: fullKey, error });
      this.metrics.incrementCounter('cache_errors_total', { operation: 'set', key: fullKey });
      throw error;
    }
  }

  /**
   * Get or set pattern - cache-aside pattern
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T> | T,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    let value = await this.get<T>(key, options);
    
    if (value === null) {
      // Generate value using factory
      const startTime = Date.now();
      value = await factory();
      
      this.metrics.observeHistogram('cache_factory_duration_ms', Date.now() - startTime);
      
      // Store in cache
      await this.set(key, value, options);
    }

    return value;
  }

  /**
   * Invalidate cache entries by key pattern
   */
  public async invalidate(pattern: string, namespace?: string): Promise<number> {
    const fullPattern = this.buildKey(pattern, namespace);
    let invalidatedCount = 0;

    try {
      // L1 Cache invalidation
      const l1Keys = this.l1Cache.keys().filter(key => this.matchesPattern(key, fullPattern));
      for (const key of l1Keys) {
        this.l1Cache.del(key);
        invalidatedCount++;
      }

      // L2 Cache invalidation (Redis)
      if (this.l2Cache) {
        const l2Keys = await this.l2Cache.keys(fullPattern);
        if (l2Keys.length > 0) {
          await this.l2Cache.del(...l2Keys);
          invalidatedCount += l2Keys.length;
        }
      }

      this.metrics.incrementCounter('cache_invalidations_total', { pattern: fullPattern });
      this.logger.debug('Cache invalidation completed', { 
        pattern: fullPattern, 
        invalidatedCount 
      });

      return invalidatedCount;

    } catch (error) {
      this.logger.error('Cache invalidation error', { pattern: fullPattern, error });
      this.metrics.incrementCounter('cache_errors_total', { operation: 'invalidate', pattern: fullPattern });
      throw error;
    }
  }

  /**
   * Invalidate by tags
   */
  public async invalidateByTag(tag: string): Promise<number> {
    const keys = this.tagMappings.get(tag);
    if (!keys || keys.size === 0) {
      return 0;
    }

    let invalidatedCount = 0;

    for (const key of keys) {
      // Remove from L1
      if (this.l1Cache.has(key)) {
        this.l1Cache.del(key);
        invalidatedCount++;
      }

      // Remove from L2
      if (this.l2Cache) {
        await this.l2Cache.del(key);
        invalidatedCount++;
      }
    }

    // Clean up tag mapping
    this.tagMappings.delete(tag);

    this.metrics.incrementCounter('cache_tag_invalidations_total', { tag });
    this.logger.debug('Tag-based invalidation completed', { tag, invalidatedCount });

    return invalidatedCount;
  }

  /**
   * Bulk get operation
   */
  public async mget<T>(
    keys: string[],
    options: CacheOptions = {}
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const missingKeys: string[] = [];

    // Try L1 first
    for (const key of keys) {
      const fullKey = this.buildKey(key, options.namespace);
      const entry = this.l1Cache.get<CacheEntry<T>>(fullKey);
      
      if (entry) {
        results.set(key, entry.value);
        this.updateAccessMetadata(entry, 'L1');
      } else {
        missingKeys.push(key);
      }
    }

    // Try L2 for missing keys
    if (missingKeys.length > 0 && this.l2Cache) {
      const fullMissingKeys = missingKeys.map(key => this.buildKey(key, options.namespace));
      const l2Results = await this.l2Cache.mget(...fullMissingKeys);

      for (let i = 0; i < missingKeys.length; i++) {
        const rawValue = l2Results[i];
        if (rawValue) {
          try {
            const entry: CacheEntry<T> = JSON.parse(rawValue);
            results.set(missingKeys[i], entry.value);
            
            // Backfill L1
            const fullKey = this.buildKey(missingKeys[i], options.namespace);
            await this.setToL1(fullKey, entry, options);
            
          } catch (error) {
            this.logger.warn('Failed to parse L2 cache entry', { key: missingKeys[i], error });
          }
        }
      }
    }

    return results;
  }

  /**
   * Bulk set operation
   */
  public async mset<T>(
    entries: Map<string, T>,
    options: CacheOptions = {}
  ): Promise<void> {
    const operations: Promise<void>[] = [];

    for (const [key, value] of entries) {
      operations.push(this.set(key, value, options));
    }

    await Promise.all(operations);
  }

  /**
   * Cache warming strategies
   */
  public async warmup(
    keys: string[],
    factory: (key: string) => Promise<any>,
    options: CacheOptions = {}
  ): Promise<void> {
    if (options.warmupStrategy === 'eager') {
      // Warm up all keys immediately
      const operations = keys.map(async (key) => {
        const value = await factory(key);
        await this.set(key, value, options);
      });
      
      await Promise.all(operations);
      
    } else if (options.warmupStrategy === 'background') {
      // Warm up keys in background
      keys.forEach((key) => {
        const taskId = `warmup-${key}`;
        
        if (this.warmupTasks.has(taskId)) {
          clearTimeout(this.warmupTasks.get(taskId)!);
        }

        const timeout = setTimeout(async () => {
          try {
            const value = await factory(key);
            await this.set(key, value, options);
          } catch (error) {
            this.logger.warn('Background warmup failed', { key, error });
          } finally {
            this.warmupTasks.delete(taskId);
          }
        }, Math.random() * 5000); // Random delay up to 5 seconds

        this.warmupTasks.set(taskId, timeout);
      });
    }
    // 'lazy' strategy does nothing - cache is warmed on first access
  }

  private async setToL1<T>(
    key: string,
    entry: CacheEntry<T>,
    options: CacheOptions
  ): Promise<void> {
    const ttl = options.ttl || 300; // 5 minutes default
    this.l1Cache.set(key, entry, ttl);
    this.stats.l1.size = this.l1Cache.keys().length;
  }

  private async setToL2<T>(
    key: string,
    entry: CacheEntry<T>,
    options: CacheOptions
  ): Promise<void> {
    if (!this.l2Cache) return;

    const serialized = JSON.stringify(entry);
    const compressed = options.compress && serialized.length > this.compressionThreshold;
    
    const value = compressed ? this.compress(serialized) : serialized;
    
    if (options.ttl) {
      await this.l2Cache.setex(key, options.ttl, value);
    } else {
      await this.l2Cache.set(key, value);
    }
  }

  private async getFromL2<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.l2Cache) return null;

    const rawValue = await this.l2Cache.get(key);
    if (!rawValue) return null;

    try {
      const decompressed = this.isCompressed(rawValue) ? this.decompress(rawValue) : rawValue;
      return JSON.parse(decompressed);
    } catch (error) {
      this.logger.warn('Failed to parse L2 cache entry', { key, error });
      return null;
    }
  }

  private async getFallback<T>(key: string, options: CacheOptions): Promise<T | null> {
    // Try lower cache levels on failure
    if (options.level === 'L1') {
      return this.get<T>(key, { ...options, level: 'L2' });
    }
    return null;
  }

  private determineOptimalLevels<T>(value: T, options: CacheOptions): string[] {
    if (options.level && options.level !== 'ALL') {
      return [options.level];
    }

    const levels: string[] = [];
    const serializedSize = JSON.stringify(value).length;

    // Always use L1 for small, frequently accessed data
    if (serializedSize < 10240) { // 10KB
      levels.push('L1');
    }

    // Use L2 for larger data or when specified
    if (this.l2Cache && (serializedSize >= 1024 || options.level === 'ALL')) {
      levels.push('L2');
    }

    return levels.length > 0 ? levels : ['L1'];
  }

  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Simple pattern matching - can be enhanced with more sophisticated logic
    return key.startsWith(pattern.replace('*', ''));
  }

  private updateTagMappings(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.tagMappings.has(tag)) {
        this.tagMappings.set(tag, new Set());
      }
      this.tagMappings.get(tag)!.add(key);
    }
  }

  private updateAccessMetadata<T>(entry: CacheEntry<T>, level: string): void {
    entry.metadata.lastAccessed = new Date();
    entry.metadata.accessCount++;
    entry.metadata.level = level as any;
  }

  private updateL1HitRate(): void {
    const total = this.stats.l1.hits + this.stats.l1.misses;
    this.stats.l1.hitRate = total > 0 ? this.stats.l1.hits / total : 0;
    this.metrics.setGauge('cache_l1_hit_rate', this.stats.l1.hitRate);
  }

  private updateL2HitRate(): void {
    const total = this.stats.l2.hits + this.stats.l2.misses;
    this.stats.l2.hitRate = total > 0 ? this.stats.l2.hits / total : 0;
    this.metrics.setGauge('cache_l2_hit_rate', this.stats.l2.hitRate);
  }

  private updateL3HitRate(): void {
    const total = this.stats.l3.hits + this.stats.l3.misses;
    this.stats.l3.hitRate = total > 0 ? this.stats.l3.hits / total : 0;
    this.metrics.setGauge('cache_l3_hit_rate', this.stats.l3.hitRate);
  }

  private updateStats(): void {
    this.stats.l1.size = this.l1Cache.keys().length;
    this.metrics.setGauge('cache_l1_size', this.stats.l1.size);
    this.metrics.setGauge('cache_tag_mappings', this.tagMappings.size);
  }

  private performMaintenance(): void {
    // Clean up expired tag mappings
    for (const [tag, keys] of this.tagMappings) {
      const validKeys = new Set<string>();
      
      for (const key of keys) {
        if (this.l1Cache.has(key)) {
          validKeys.add(key);
        }
      }
      
      if (validKeys.size === 0) {
        this.tagMappings.delete(tag);
      } else if (validKeys.size < keys.size) {
        this.tagMappings.set(tag, validKeys);
      }
    }

    this.logger.debug('Cache maintenance completed', {
      tagMappings: this.tagMappings.size,
      l1Size: this.stats.l1.size
    });
  }

  private compress(data: string): string {
    // Implement compression logic (e.g., gzip, brotli)
    return data; // Placeholder
  }

  private decompress(data: string): string {
    // Implement decompression logic
    return data; // Placeholder
  }

  private isCompressed(data: string): boolean {
    // Check if data is compressed
    return false; // Placeholder
  }

  private async handleInvalidationEvent(event: any): Promise<void> {
    if (event.type === 'key') {
      await this.invalidate(event.key, event.namespace);
    } else if (event.type === 'tag') {
      await this.invalidateByTag(event.tag);
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clear all cache levels
   */
  public async clear(): Promise<void> {
    // Clear L1
    this.l1Cache.flushAll();
    
    // Clear L2
    if (this.l2Cache) {
      await this.l2Cache.flushall();
    }
    
    // Clear tag mappings
    this.tagMappings.clear();
    
    // Reset stats
    this.stats = {
      l1: { hits: 0, misses: 0, size: 0, hitRate: 0 },
      l2: { hits: 0, misses: 0, hitRate: 0 },
      l3: { hits: 0, misses: 0, hitRate: 0 }
    };

    this.logger.info('All cache levels cleared');
  }
}

export default AdvancedCacheService;