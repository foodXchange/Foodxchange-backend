import { Logger } from '../../core/logging/logger';

import { CacheService, CacheOptions } from './CacheService';

export interface CacheLayer {
  name: string;
  service: CacheService;
  priority: number;
  enabled: boolean;
}

export interface MultiLevelCacheOptions extends CacheOptions {
  layers?: string[]; // Which cache layers to use
  fallthrough?: boolean; // Continue to next layer on miss
  writethrough?: boolean; // Write to all layers
}

export interface CacheStrategy {
  name: string;
  description: string;
  get: (key: string, options?: any) => Promise<any>;
  set: (key: string, value: any, options?: any) => Promise<boolean>;
  delete: (key: string) => Promise<boolean>;
}

export class CacheManager {
  private readonly layers: Map<string, CacheLayer> = new Map();
  private readonly strategies: Map<string, CacheStrategy> = new Map();
  private readonly logger: Logger;
  private readonly metrics: {
    hits: Map<string, number>;
    misses: Map<string, number>;
    writes: Map<string, number>;
  };

  constructor() {
    this.logger = new Logger('CacheManager');
    this.metrics = {
      hits: new Map(),
      misses: new Map(),
      writes: new Map()
    };

    this.initializeDefaultStrategies();
  }

  /**
   * Add a cache layer
   */
  addLayer(name: string, service: CacheService, priority: number = 1): void {
    this.layers.set(name, {
      name,
      service,
      priority,
      enabled: true
    });

    this.logger.info(`Cache layer '${name}' added with priority ${priority}`);
  }

  /**
   * Remove a cache layer
   */
  removeLayer(name: string): boolean {
    const removed = this.layers.delete(name);
    if (removed) {
      this.logger.info(`Cache layer '${name}' removed`);
    }
    return removed;
  }

  /**
   * Enable/disable cache layer
   */
  setLayerEnabled(name: string, enabled: boolean): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.enabled = enabled;
      this.logger.info(`Cache layer '${name}' ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Get from multi-level cache
   */
  async get<T>(
    key: string,
    options: MultiLevelCacheOptions = {}
  ): Promise<T | null> {
    const { layers = Array.from(this.layers.keys()), fallthrough = true } = options;
    const sortedLayers = this.getSortedLayers(layers);

    for (const layer of sortedLayers) {
      if (!layer.enabled) continue;

      try {
        const value = await layer.service.get<T>(key);

        if (value !== null) {
          this.recordHit(layer.name);

          // Populate higher priority layers (cache promotion)
          const higherLayers = sortedLayers.filter(l => l.priority > layer.priority);
          if (higherLayers.length > 0) {
            this.promoteToHigherLayers(key, value, higherLayers, options);
          }

          return value;
        }
        this.recordMiss(layer.name);

        if (!fallthrough) {
          break;
        }

      } catch (error) {
        this.logger.error(`Error getting from cache layer '${layer.name}':`, error);
        this.recordMiss(layer.name);

        if (!fallthrough) {
          break;
        }
      }
    }

    return null;
  }

  /**
   * Set in multi-level cache
   */
  async set<T>(
    key: string,
    value: T,
    options: MultiLevelCacheOptions = {}
  ): Promise<boolean> {
    const {
      layers = Array.from(this.layers.keys()),
      writethrough = true
    } = options;

    const targetLayers = this.getSortedLayers(layers);
    let success = false;

    if (writethrough) {
      // Write to all specified layers
      const promises = targetLayers
        .filter(layer => layer.enabled)
        .map(async layer => {
          try {
            const result = await layer.service.set(key, value, options);
            this.recordWrite(layer.name);
            return result;
          } catch (error) {
            this.logger.error(`Error setting in cache layer '${layer.name}':`, error);
            return false;
          }
        });

      const results = await Promise.all(promises);
      success = results.some(result => result);
    } else {
      // Write to highest priority layer only
      const highestLayer = targetLayers.find(layer => layer.enabled);
      if (highestLayer) {
        try {
          success = await highestLayer.service.set(key, value, options);
          this.recordWrite(highestLayer.name);
        } catch (error) {
          this.logger.error(`Error setting in cache layer '${highestLayer.name}':`, error);
        }
      }
    }

    return success;
  }

  /**
   * Delete from multi-level cache
   */
  async delete(key: string, layers?: string[]): Promise<boolean> {
    const targetLayers = layers ?
      this.getSortedLayers(layers) :
      Array.from(this.layers.values()).filter(l => l.enabled);

    const promises = targetLayers.map(async layer => {
      try {
        return await layer.service.delete(key);
      } catch (error) {
        this.logger.error(`Error deleting from cache layer '${layer.name}':`, error);
        return false;
      }
    });

    const results = await Promise.all(promises);
    return results.some(result => result);
  }

  /**
   * Cache-aside pattern with fallback to data source
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: MultiLevelCacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
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
   * Invalidate cache by tags across all layers
   */
  async invalidateByTags(tags: string[], layers?: string[]): Promise<number> {
    const targetLayers = layers ?
      this.getSortedLayers(layers) :
      Array.from(this.layers.values()).filter(l => l.enabled);

    let totalDeleted = 0;

    for (const layer of targetLayers) {
      try {
        const deleted = await layer.service.invalidateByTags(tags);
        totalDeleted += deleted;
      } catch (error) {
        this.logger.error(`Error invalidating tags in layer '${layer.name}':`, error);
      }
    }

    return totalDeleted;
  }

  /**
   * Invalidate cache by pattern across all layers
   */
  async invalidateByPattern(pattern: string, layers?: string[]): Promise<number> {
    const targetLayers = layers ?
      this.getSortedLayers(layers) :
      Array.from(this.layers.values()).filter(l => l.enabled);

    let totalDeleted = 0;

    for (const layer of targetLayers) {
      try {
        const deleted = await layer.service.invalidateByPattern(pattern);
        totalDeleted += deleted;
      } catch (error) {
        this.logger.error(`Error invalidating pattern in layer '${layer.name}':`, error);
      }
    }

    return totalDeleted;
  }

  /**
   * Register a custom cache strategy
   */
  registerStrategy(strategy: CacheStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.logger.info(`Cache strategy '${strategy.name}' registered`);
  }

  /**
   * Execute a custom cache strategy
   */
  async executeStrategy<T>(
    strategyName: string,
    operation: 'get' | 'set' | 'delete',
    key: string,
    valueOrOptions?: T | any
  ): Promise<any> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Cache strategy '${strategyName}' not found`);
    }

    switch (operation) {
      case 'get':
        return strategy.get(key, valueOrOptions);
      case 'set':
        return strategy.set(key, valueOrOptions, arguments[4]);
      case 'delete':
        return strategy.delete(key);
      default:
        throw new Error(`Unknown cache operation: ${operation}`);
    }
  }

  /**
   * Get cache metrics for all layers
   */
  getMetrics(): Record<string, any> {
    const layerMetrics: Record<string, any> = {};

    for (const [name, layer] of this.layers) {
      layerMetrics[name] = {
        enabled: layer.enabled,
        priority: layer.priority,
        hits: this.metrics.hits.get(name) || 0,
        misses: this.metrics.misses.get(name) || 0,
        writes: this.metrics.writes.get(name) || 0,
        hitRate: this.calculateHitRate(name)
      };
    }

    return {
      layers: layerMetrics,
      totalLayers: this.layers.size,
      enabledLayers: Array.from(this.layers.values()).filter(l => l.enabled).length,
      strategies: Array.from(this.strategies.keys())
    };
  }

  /**
   * Warm cache across multiple layers
   */
  async warmCache(
    warmupData: Array<{
      key: string;
      factory: () => Promise<any>;
      options?: MultiLevelCacheOptions;
    }>
  ): Promise<void> {
    this.logger.info(`Warming multi-level cache with ${warmupData.length} entries...`);

    const promises = warmupData.map(async ({ key, factory, options }) => {
      try {
        const exists = await this.exists(key, options?.layers);
        if (!exists) {
          const value = await factory();
          await this.set(key, value, options);
        }
      } catch (error) {
        this.logger.error(`Failed to warm cache for key ${key}:`, error);
      }
    });

    await Promise.all(promises);
    this.logger.info('Multi-level cache warmup completed');
  }

  /**
   * Check if key exists in any layer
   */
  async exists(key: string, layers?: string[]): Promise<boolean> {
    const targetLayers = layers ?
      this.getSortedLayers(layers) :
      Array.from(this.layers.values()).filter(l => l.enabled);

    for (const layer of targetLayers) {
      try {
        const exists = await layer.service.exists(key);
        if (exists) {
          return true;
        }
      } catch (error) {
        this.logger.error(`Error checking existence in layer '${layer.name}':`, error);
      }
    }

    return false;
  }

  /**
   * Get health status of all cache layers
   */
  async getHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {
      overall: 'healthy',
      layers: {}
    };

    let healthyCount = 0;
    let totalCount = 0;

    for (const [name, layer] of this.layers) {
      if (!layer.enabled) {
        health.layers[name] = { status: 'disabled' };
        continue;
      }

      totalCount++;

      try {
        const layerHealth = await layer.service.getHealth();
        health.layers[name] = layerHealth;

        if (layerHealth.status === 'healthy') {
          healthyCount++;
        }
      } catch (error) {
        health.layers[name] = {
          status: 'unhealthy',
          error: error.message
        };
      }
    }

    // Determine overall health
    if (totalCount === 0) {
      health.overall = 'unhealthy';
    } else if (healthyCount === totalCount) {
      health.overall = 'healthy';
    } else if (healthyCount > 0) {
      health.overall = 'degraded';
    } else {
      health.overall = 'unhealthy';
    }

    health.summary = {
      totalLayers: this.layers.size,
      enabledLayers: totalCount,
      healthyLayers: healthyCount
    };

    return health;
  }

  /**
   * Private helper methods
   */
  private getSortedLayers(layerNames: string[]): CacheLayer[] {
    return layerNames
      .map(name => this.layers.get(name))
      .filter((layer): layer is CacheLayer => layer !== undefined)
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  private async promoteToHigherLayers<T>(
    key: string,
    value: T,
    higherLayers: CacheLayer[],
    options: CacheOptions
  ): Promise<void> {
    // Don't await - fire and forget cache promotion
    Promise.all(
      higherLayers.map(async layer =>
        layer.service.set(key, value, options).catch(error =>
          this.logger.warn(`Failed to promote to layer '${layer.name}':`, error)
        )
      )
    );
  }

  private recordHit(layerName: string): void {
    const current = this.metrics.hits.get(layerName) || 0;
    this.metrics.hits.set(layerName, current + 1);
  }

  private recordMiss(layerName: string): void {
    const current = this.metrics.misses.get(layerName) || 0;
    this.metrics.misses.set(layerName, current + 1);
  }

  private recordWrite(layerName: string): void {
    const current = this.metrics.writes.get(layerName) || 0;
    this.metrics.writes.set(layerName, current + 1);
  }

  private calculateHitRate(layerName: string): number {
    const hits = this.metrics.hits.get(layerName) || 0;
    const misses = this.metrics.misses.get(layerName) || 0;
    const total = hits + misses;

    return total > 0 ? (hits / total) * 100 : 0;
  }

  private initializeDefaultStrategies(): void {
    // Write-Through Strategy
    this.registerStrategy({
      name: 'write-through',
      description: 'Write to cache and data store simultaneously',
      get: async (key: string) => this.get(key),
      set: async (key: string, value: any, options: any) => {
        // Implementation would coordinate with data store
        return this.set(key, value, { ...options, writethrough: true });
      },
      delete: async (key: string) => this.delete(key)
    });

    // Write-Behind (Write-Back) Strategy
    this.registerStrategy({
      name: 'write-behind',
      description: 'Write to cache immediately, data store asynchronously',
      get: async (key: string) => this.get(key),
      set: async (key: string, value: any, options: any) => {
        const result = await this.set(key, value, options);
        // Schedule async write to data store
        this.scheduleAsyncWrite(key, value, options);
        return result;
      },
      delete: async (key: string) => this.delete(key)
    });

    // Cache-Aside Strategy
    this.registerStrategy({
      name: 'cache-aside',
      description: 'Application manages cache and data store separately',
      get: async (key: string, factory?: () => Promise<any>) => {
        const cached = await this.get(key);
        if (cached !== null || !factory) {
          return cached;
        }

        const value = await factory();
        await this.set(key, value);
        return value;
      },
      set: async (key: string, value: any, options: any) => this.set(key, value, options),
      delete: async (key: string) => this.delete(key)
    });
  }

  private scheduleAsyncWrite(key: string, value: any, options: any): void {
    // This would typically use a queue system like Bull or Agenda
    setImmediate(() => {
      // Placeholder for async data store write
      this.logger.debug(`Async write scheduled for key: ${key}`);
    });
  }
}

export const cacheManager = new CacheManager();
