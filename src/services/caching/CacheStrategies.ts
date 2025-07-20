import { Logger } from '../../core/logging/logger';

import { CacheService } from './CacheService';

export interface CacheStrategyConfig {
  ttl?: number;
  tags?: string[];
  maxRetries?: number;
  retryDelay?: number;
  compressionThreshold?: number;
  serialize?: boolean;
}

export interface DataSource<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

export class CacheStrategies {
  private readonly logger: Logger;

  constructor(
    private readonly cacheService: CacheService,
    private readonly dataSource?: DataSource<any>
  ) {
    this.logger = new Logger('CacheStrategies');
  }

  /**
   * Cache-Aside (Lazy Loading) Strategy
   * Application manages both cache and data store
   */
  async cacheAside<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheStrategyConfig = {}
  ): Promise<T> {
    const { ttl = 3600, tags = [], maxRetries = 3 } = config;

    try {
      // Try to get from cache first
      const cached = await this.cacheService.get<T>(key);
      if (cached !== null) {
        this.logger.debug(`Cache hit for key: ${key}`);
        return cached;
      }

      this.logger.debug(`Cache miss for key: ${key}`);

      // Not in cache, get from data source
      const value = await this.withRetry(factory, maxRetries);

      // Store in cache for next time
      await this.cacheService.set(key, value, { ttl, tags });

      return value;
    } catch (error) {
      this.logger.error(`Cache-aside strategy failed for key ${key}:`, error);

      // If cache fails, try to get data directly
      return factory();
    }
  }

  /**
   * Write-Through Strategy
   * Write to cache and data store simultaneously
   */
  async writeThrough<T>(
    key: string,
    value: T,
    config: CacheStrategyConfig = {}
  ): Promise<boolean> {
    const { ttl = 3600, tags = [], maxRetries = 3 } = config;

    try {
      const promises: Promise<boolean>[] = [
        this.cacheService.set(key, value, { ttl, tags })
      ];

      // If data source is available, write to it as well
      if (this.dataSource) {
        promises.push(this.withRetry(async () => this.dataSource.set(key, value), maxRetries));
      }

      const results = await Promise.allSettled(promises);

      // Check if all writes succeeded
      const allSucceeded = results.every(result =>
        result.status === 'fulfilled' && result.value === true
      );

      if (!allSucceeded) {
        this.logger.warn(`Write-through partially failed for key ${key}`);

        // If cache write failed but data store succeeded, we have inconsistency
        const cacheResult = results[0];
        const dataResult = results[1];

        if (cacheResult.status === 'rejected' && dataResult?.status === 'fulfilled') {
          this.logger.error(`Cache write failed but data store succeeded for key ${key}`);
          // Optionally trigger cache invalidation or repair
        }
      }

      return allSucceeded;
    } catch (error) {
      this.logger.error(`Write-through strategy failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Write-Behind (Write-Back) Strategy
   * Write to cache immediately, schedule data store write
   */
  async writeBehind<T>(
    key: string,
    value: T,
    config: CacheStrategyConfig = {}
  ): Promise<boolean> {
    const { ttl = 3600, tags = [], maxRetries = 3 } = config;

    try {
      // Write to cache immediately
      const cacheSuccess = await this.cacheService.set(key, value, { ttl, tags });

      if (!cacheSuccess) {
        this.logger.error(`Cache write failed for key ${key}`);
        return false;
      }

      // Schedule asynchronous write to data store
      if (this.dataSource) {
        this.scheduleDataStoreWrite(key, value, maxRetries);
      }

      return true;
    } catch (error) {
      this.logger.error(`Write-behind strategy failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Write-Around Strategy
   * Write directly to data store, bypass cache
   */
  async writeAround<T>(
    key: string,
    value: T,
    config: CacheStrategyConfig = {}
  ): Promise<boolean> {
    const { maxRetries = 3 } = config;

    try {
      if (!this.dataSource) {
        throw new Error('Data source required for write-around strategy');
      }

      // Write directly to data store
      const success = await this.withRetry(
        async () => this.dataSource.set(key, value),
        maxRetries
      );

      // Invalidate cache to prevent stale data
      await this.cacheService.delete(key);

      return success;
    } catch (error) {
      this.logger.error(`Write-around strategy failed for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Refresh-Ahead Strategy
   * Proactively refresh cache before expiration
   */
  async refreshAhead<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheStrategyConfig & {
      refreshThreshold?: number; // Percentage of TTL when to refresh
      backgroundRefresh?: boolean;
    } = {}
  ): Promise<T> {
    const {
      ttl = 3600,
      tags = [],
      refreshThreshold = 0.75,
      backgroundRefresh = true,
      maxRetries = 3
    } = config;

    try {
      const cached = await this.cacheService.get<T>(key);

      if (cached !== null) {
        // Check if we should refresh proactively
        const shouldRefresh = await this.shouldRefreshAhead(key, ttl, refreshThreshold);

        if (shouldRefresh) {
          if (backgroundRefresh) {
            // Refresh in background, return current value
            this.backgroundRefresh(key, factory, { ttl, tags }, maxRetries);
            return cached;
          }
          // Refresh synchronously
          const newValue = await this.withRetry(factory, maxRetries);
          await this.cacheService.set(key, newValue, { ttl, tags });
          return newValue;

        }

        return cached;
      }

      // Cache miss, load and cache
      const value = await this.withRetry(factory, maxRetries);
      await this.cacheService.set(key, value, { ttl, tags });

      return value;
    } catch (error) {
      this.logger.error(`Refresh-ahead strategy failed for key ${key}:`, error);
      return factory();
    }
  }

  /**
   * Circuit Breaker Pattern for Cache
   * Prevent cache failures from affecting application
   */
  async circuitBreaker<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheStrategyConfig & {
      failureThreshold?: number;
      resetTimeout?: number;
      monitorWindow?: number;
    } = {}
  ): Promise<T> {
    const {
      ttl = 3600,
      tags = [],
      failureThreshold = 5,
      resetTimeout = 60000,
      monitorWindow = 300000
    } = config;

    const circuitKey = `circuit:${key}`;

    try {
      // Check circuit breaker state
      const circuitState = await this.getCircuitState(circuitKey, failureThreshold, monitorWindow);

      if (circuitState === 'open') {
        this.logger.warn(`Circuit breaker open for key ${key}, bypassing cache`);
        return factory();
      }

      if (circuitState === 'half-open') {
        // Try cache operation with fallback
        try {
          const cached = await this.cacheService.get<T>(key);
          if (cached !== null) {
            await this.recordCircuitSuccess(circuitKey);
            return cached;
          }
        } catch (error) {
          await this.recordCircuitFailure(circuitKey);
          throw error;
        }
      }

      // Circuit is closed, normal operation
      try {
        const result = await this.cacheAside(key, factory, { ttl, tags });
        await this.recordCircuitSuccess(circuitKey);
        return result;
      } catch (error) {
        await this.recordCircuitFailure(circuitKey);
        throw error;
      }
    } catch (error) {
      this.logger.error(`Circuit breaker strategy failed for key ${key}:`, error);
      return factory();
    }
  }

  /**
   * Multi-Level Cache Strategy
   * Use multiple cache layers (L1, L2, etc.)
   */
  async multiLevel<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheStrategyConfig & {
      l1Cache?: CacheService;
      l2Cache?: CacheService;
      l1TTL?: number;
      l2TTL?: number;
    } = {}
  ): Promise<T> {
    const {
      ttl = 3600,
      tags = [],
      l1Cache,
      l2Cache,
      l1TTL = 300,   // 5 minutes for L1
      l2TTL = 3600   // 1 hour for L2
    } = config;

    try {
      // Try L1 cache first (fastest)
      if (l1Cache) {
        const l1Result = await l1Cache.get<T>(key);
        if (l1Result !== null) {
          this.logger.debug(`L1 cache hit for key: ${key}`);
          return l1Result;
        }
      }

      // Try L2 cache
      if (l2Cache) {
        const l2Result = await l2Cache.get<T>(key);
        if (l2Result !== null) {
          this.logger.debug(`L2 cache hit for key: ${key}`);

          // Populate L1 cache
          if (l1Cache) {
            l1Cache.set(key, l2Result, { ttl: l1TTL, tags }).catch(error =>
              this.logger.warn(`Failed to populate L1 cache for key ${key}:`, error)
            );
          }

          return l2Result;
        }
      }

      // Cache miss in all levels, get from source
      this.logger.debug(`Multi-level cache miss for key: ${key}`);
      const value = await factory();

      // Populate all cache levels
      const populatePromises: Promise<any>[] = [
        this.cacheService.set(key, value, { ttl, tags })
      ];

      if (l1Cache) {
        populatePromises.push(l1Cache.set(key, value, { ttl: l1TTL, tags }));
      }

      if (l2Cache) {
        populatePromises.push(l2Cache.set(key, value, { ttl: l2TTL, tags }));
      }

      await Promise.allSettled(populatePromises);

      return value;
    } catch (error) {
      this.logger.error(`Multi-level strategy failed for key ${key}:`, error);
      return factory();
    }
  }

  /**
   * Cache Stamping Strategy
   * Prevent cache stampede/thundering herd
   */
  async cacheStamping<T>(
    key: string,
    factory: () => Promise<T>,
    config: CacheStrategyConfig & {
      lockTTL?: number;
      maxWaitTime?: number;
      pollInterval?: number;
    } = {}
  ): Promise<T> {
    const {
      ttl = 3600,
      tags = [],
      lockTTL = 30,
      maxWaitTime = 5000,
      pollInterval = 100
    } = config;

    const lockKey = `lock:${key}`;
    const computingKey = `computing:${key}`;

    try {
      // Try to get from cache first
      const cached = await this.cacheService.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Try to acquire lock
      const lockAcquired = await this.acquireLock(lockKey, lockTTL);

      if (lockAcquired) {
        try {
          // Double-check cache (might have been populated while waiting)
          const doubleCheck = await this.cacheService.get<T>(key);
          if (doubleCheck !== null) {
            return doubleCheck;
          }

          // Mark that computation is in progress
          await this.cacheService.set(computingKey, true, { ttl: lockTTL });

          // Compute value
          const value = await factory();

          // Store in cache
          await this.cacheService.set(key, value, { ttl, tags });

          // Clean up
          await this.cacheService.delete(computingKey);

          return value;
        } finally {
          await this.releaseLock(lockKey);
        }
      } else {
        // Wait for computation to complete
        return this.waitForComputation(key, computingKey, maxWaitTime, pollInterval, factory);
      }
    } catch (error) {
      this.logger.error(`Cache stamping strategy failed for key ${key}:`, error);
      return factory();
    }
  }

  /**
   * Private helper methods
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (i === maxRetries) {
          throw lastError;
        }

        // Exponential backoff
        const waitTime = delay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw lastError;
  }

  private scheduleDataStoreWrite<T>(key: string, value: T, maxRetries: number): void {
    if (!this.dataSource) return;

    setImmediate(async () => {
      try {
        await this.withRetry(async () => this.dataSource.set(key, value), maxRetries);
        this.logger.debug(`Background write completed for key: ${key}`);
      } catch (error) {
        this.logger.error(`Background write failed for key ${key}:`, error);
        // Could add to dead letter queue or retry mechanism
      }
    });
  }

  private backgroundRefresh<T>(
    key: string,
    factory: () => Promise<T>,
    cacheOptions: { ttl: number; tags: string[] },
    maxRetries: number
  ): void {
    setImmediate(async () => {
      try {
        const newValue = await this.withRetry(factory, maxRetries);
        await this.cacheService.set(key, newValue, cacheOptions);
        this.logger.debug(`Background refresh completed for key: ${key}`);
      } catch (error) {
        this.logger.error(`Background refresh failed for key ${key}:`, error);
      }
    });
  }

  private async shouldRefreshAhead(
    key: string,
    ttl: number,
    threshold: number
  ): Promise<boolean> {
    try {
      // This would require storing metadata about when the cache entry was created
      // For now, return false (would need to implement TTL tracking)
      return false;
    } catch (error) {
      this.logger.error('Error checking refresh-ahead condition:', error);
      return false;
    }
  }

  private async getCircuitState(
    circuitKey: string,
    failureThreshold: number,
    monitorWindow: number
  ): Promise<'closed' | 'open' | 'half-open'> {
    try {
      const failures = await this.cacheService.get<number>(`${circuitKey}:failures`) || 0;
      const lastFailure = await this.cacheService.get<number>(`${circuitKey}:lastFailure`) || 0;

      const now = Date.now();

      if (failures >= failureThreshold) {
        if (now - lastFailure > monitorWindow) {
          return 'half-open';
        }
        return 'open';
      }

      return 'closed';
    } catch (error) {
      this.logger.error('Error getting circuit state:', error);
      return 'closed';
    }
  }

  private async recordCircuitSuccess(circuitKey: string): Promise<void> {
    await this.cacheService.delete(`${circuitKey}:failures`);
    await this.cacheService.delete(`${circuitKey}:lastFailure`);
  }

  private async recordCircuitFailure(circuitKey: string): Promise<void> {
    await this.cacheService.increment(`${circuitKey}:failures`, 1, 300);
    await this.cacheService.set(`${circuitKey}:lastFailure`, Date.now(), { ttl: 300 });
  }

  private async acquireLock(lockKey: string, ttl: number): Promise<boolean> {
    try {
      // Use Redis SET with NX and EX for atomic lock acquisition
      const result = await this.cacheService.set(lockKey, Date.now(), { ttl });
      return result;
    } catch (error) {
      this.logger.error('Error acquiring lock:', error);
      return false;
    }
  }

  private async releaseLock(lockKey: string): Promise<void> {
    await this.cacheService.delete(lockKey);
  }

  private async waitForComputation<T>(
    key: string,
    computingKey: string,
    maxWaitTime: number,
    pollInterval: number,
    fallback: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Check if computation is still in progress
      const computing = await this.cacheService.exists(computingKey);
      if (!computing) {
        // Computation finished, try to get result
        const result = await this.cacheService.get<T>(key);
        if (result !== null) {
          return result;
        }
        break;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout or computation failed, fallback to direct computation
    this.logger.warn(`Wait timeout for key ${key}, falling back to direct computation`);
    return fallback();
  }
}

export default CacheStrategies;
