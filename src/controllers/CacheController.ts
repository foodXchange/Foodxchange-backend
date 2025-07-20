import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { cacheManager } from '../services/caching/CacheManager';
import { cacheService } from '../services/caching/CacheService';

type CacheRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    company?: string;
    companyId?: string;
  };
};

export class CacheController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('CacheController');
  }

  /**
   * Get cache statistics
   */
  async getStats(req: CacheRequest, res: Response): Promise<void> {
    try {
      // Check if user has admin role
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const [cacheStats, managerMetrics] = await Promise.all([
        cacheService.getStats(),
        cacheManager.getMetrics()
      ]);

      res.json({
        success: true,
        data: {
          cache: cacheStats,
          manager: managerMetrics,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: 'Failed to retrieve cache statistics'
        }
      });
    }
  }

  /**
   * Get cache health status
   */
  async getHealth(req: CacheRequest, res: Response): Promise<void> {
    try {
      const [cacheHealth, managerHealth] = await Promise.all([
        cacheService.getHealth(),
        cacheManager.getHealth()
      ]);

      const overallStatus = this.determineOverallHealth([
        cacheHealth.status,
        managerHealth.overall
      ]);

      res.json({
        success: true,
        data: {
          status: overallStatus,
          cache: cacheHealth,
          manager: managerHealth,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get cache health:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to check cache health'
        }
      });
    }
  }

  /**
   * Manually invalidate cache by key
   */
  async invalidateKey(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const { key } = req.params;
      if (!key) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_KEY',
            message: 'Cache key is required'
          }
        });
        return;
      }

      const deleted = await cacheManager.delete(key);

      res.json({
        success: true,
        data: {
          key,
          deleted,
          message: deleted ? 'Key invalidated successfully' : 'Key not found'
        }
      });
    } catch (error) {
      this.logger.error('Failed to invalidate cache key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INVALIDATION_ERROR',
          message: 'Failed to invalidate cache key'
        }
      });
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const { tags } = req.body;
      if (!Array.isArray(tags) || tags.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TAGS',
            message: 'Tags array is required and must not be empty'
          }
        });
        return;
      }

      const deletedCount = await cacheManager.invalidateByTags(tags);

      res.json({
        success: true,
        data: {
          tags,
          deletedCount,
          message: `Invalidated ${deletedCount} cache entries`
        }
      });
    } catch (error) {
      this.logger.error('Failed to invalidate cache by tags:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TAG_INVALIDATION_ERROR',
          message: 'Failed to invalidate cache by tags'
        }
      });
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const { pattern } = req.body;
      if (!pattern || typeof pattern !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PATTERN',
            message: 'Pattern string is required'
          }
        });
        return;
      }

      const deletedCount = await cacheManager.invalidateByPattern(pattern);

      res.json({
        success: true,
        data: {
          pattern,
          deletedCount,
          message: `Invalidated ${deletedCount} cache entries matching pattern`
        }
      });
    } catch (error) {
      this.logger.error('Failed to invalidate cache by pattern:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PATTERN_INVALIDATION_ERROR',
          message: 'Failed to invalidate cache by pattern'
        }
      });
    }
  }

  /**
   * Clear entire cache
   */
  async clearCache(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      // Additional confirmation required for clearing entire cache
      const { confirm } = req.body;
      if (confirm !== 'CLEAR_ALL_CACHE') {
        res.status(400).json({
          success: false,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'Please confirm cache clearing by setting confirm to "CLEAR_ALL_CACHE"'
          }
        });
        return;
      }

      const cleared = await cacheService.clear();

      if (cleared) {
        this.logger.warn(`Cache cleared by admin user: ${req.user.id}`);
      }

      res.json({
        success: true,
        data: {
          cleared,
          message: cleared ? 'Cache cleared successfully' : 'Failed to clear cache',
          clearedBy: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CLEAR_ERROR',
          message: 'Failed to clear cache'
        }
      });
    }
  }

  /**
   * Warm cache with specific data
   */
  async warmCache(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const { patterns } = req.body;
      if (!Array.isArray(patterns)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PATTERNS',
            message: 'Patterns array is required'
          }
        });
        return;
      }

      // Execute cache warming in background
      this.executeCacheWarming(patterns, req.user.id);

      res.json({
        success: true,
        data: {
          message: 'Cache warming initiated',
          patterns: patterns.length,
          initiatedBy: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to initiate cache warming:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WARM_ERROR',
          message: 'Failed to initiate cache warming'
        }
      });
    }
  }

  /**
   * Get cache configuration
   */
  async getConfig(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const config = {
        defaultTTL: 3600,
        patterns: Array.from(cacheService.getPattern('user') ? [cacheService.getPattern('user')] : []),
        layers: cacheManager.getMetrics().layers,
        strategies: cacheManager.getMetrics().strategies
      };

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      this.logger.error('Failed to get cache config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Failed to retrieve cache configuration'
        }
      });
    }
  }

  /**
   * Check if specific key exists in cache
   */
  async checkKey(req: CacheRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required'
          }
        });
        return;
      }

      const { key } = req.params;
      if (!key) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_KEY',
            message: 'Cache key is required'
          }
        });
        return;
      }

      const exists = await cacheService.exists(key);

      res.json({
        success: true,
        data: {
          key,
          exists,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to check cache key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'KEY_CHECK_ERROR',
          message: 'Failed to check cache key'
        }
      });
    }
  }

  /**
   * Private helper methods
   */
  private determineOverallHealth(statuses: string[]): string {
    const healthyCount = statuses.filter(s => s === 'healthy').length;
    const totalCount = statuses.length;

    if (healthyCount === totalCount) {
      return 'healthy';
    } else if (healthyCount > 0) {
      return 'degraded';
    }
    return 'unhealthy';

  }

  private async executeCacheWarming(patterns: any[], userId: string): Promise<void> {
    try {
      this.logger.info(`Cache warming initiated by user ${userId} with ${patterns.length} patterns`);

      // This would typically involve loading common data patterns
      const warmupData = patterns.map(pattern => ({
        key: pattern.key || `warm:${Date.now()}:${Math.random()}`,
        factory: async () => {
          // Placeholder factory - would load actual data
          return { warmed: true, pattern: pattern.name, timestamp: new Date() };
        },
        options: {
          ttl: pattern.ttl || 3600,
          tags: pattern.tags || ['warmed']
        }
      }));

      await cacheManager.warmCache(warmupData);

      this.logger.info('Cache warming completed successfully');
    } catch (error) {
      this.logger.error('Cache warming failed:', error);
    }
  }
}

export const cacheController = new CacheController();
