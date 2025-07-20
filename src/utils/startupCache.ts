import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

import { Logger } from '../core/logging/logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  checksum: string;
  version: string;
}

export class StartupCache {
  private readonly logger: Logger;
  private readonly cacheDir: string;
  private readonly appVersion: string;

  constructor(cacheDir: string = '.cache/startup') {
    this.logger = new Logger('StartupCache');
    this.cacheDir = path.resolve(cacheDir);
    this.appVersion = process.env.npm_package_version || '1.0.0';

    // Ensure cache directory exists
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get cached data if valid, otherwise execute the factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: {
      ttl?: number; // Time to live in milliseconds
      checksum?: string; // Optional checksum for cache invalidation
      forceRefresh?: boolean;
    } = {}
  ): Promise<T> {
    const { ttl = 24 * 60 * 60 * 1000, checksum, forceRefresh = false } = options;
    const cacheFile = path.join(this.cacheDir, `${this.sanitizeKey(key)}.json`);

    try {
      // Check if we should force refresh
      if (forceRefresh) {
        this.logger.debug(`Force refresh requested for cache key: ${key}`);
        return await this.setCache(cacheFile, key, factory, checksum);
      }

      // Try to load from cache
      if (existsSync(cacheFile)) {
        const cached = this.loadCache<T>(cacheFile);

        if (cached && this.isCacheValid(cached, ttl, checksum)) {
          this.logger.debug(`Cache hit for key: ${key}`);
          return cached.data;
        }

        this.logger.debug(`Cache invalid for key: ${key}`);
      }

      // Cache miss or invalid - generate new data
      return await this.setCache(cacheFile, key, factory, checksum);
    } catch (error) {
      this.logger.error(`Cache error for key ${key}:`, error);
      // Fallback to factory function on any cache error
      return await factory();
    }
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    const cacheFile = path.join(this.cacheDir, `${this.sanitizeKey(key)}.json`);
    try {
      if (existsSync(cacheFile)) {
        require('fs').unlinkSync(cacheFile);
        this.logger.debug(`Cache invalidated for key: ${key}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    try {
      const files = require('fs').readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          require('fs').unlinkSync(path.join(this.cacheDir, file));
        }
      }
      this.logger.info('All cache entries cleared');
    } catch (error) {
      this.logger.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalEntries: number; totalSize: number } {
    try {
      const files = require('fs').readdirSync(this.cacheDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      let totalSize = 0;
      for (const file of jsonFiles) {
        const stats = require('fs').statSync(path.join(this.cacheDir, file));
        totalSize += stats.size;
      }

      return {
        totalEntries: jsonFiles.length,
        totalSize
      };
    } catch {
      return { totalEntries: 0, totalSize: 0 };
    }
  }

  private async setCache<T>(
    cacheFile: string,
    key: string,
    factory: () => Promise<T>,
    checksum?: string
  ): Promise<T> {
    this.logger.debug(`Generating cache for key: ${key}`);
    const startTime = Date.now();

    const data = await factory();
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      checksum: checksum || this.generateDataChecksum(data),
      version: this.appVersion
    };

    try {
      writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
      const duration = Date.now() - startTime;
      this.logger.debug(`Cache generated for key ${key} in ${duration}ms`);
    } catch (error) {
      this.logger.warn(`Failed to save cache for key ${key}:`, error);
    }

    return data;
  }

  private loadCache<T>(cacheFile: string): CacheEntry<T> | null {
    try {
      const content = readFileSync(cacheFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private isCacheValid<T>(cached: CacheEntry<T>, ttl: number, checksum?: string): boolean {
    // Check version compatibility
    if (cached.version !== this.appVersion) {
      return false;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > ttl) {
      return false;
    }

    // Check checksum if provided
    if (checksum && cached.checksum !== checksum) {
      return false;
    }

    return true;
  }

  private generateDataChecksum(data: any): string {
    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .slice(0, 16);
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

// Export singleton instance
export const startupCache = new StartupCache();
