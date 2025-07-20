import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';

import { Logger } from '../core/logging/logger';
import { cacheService } from '../services/caching/CacheService';

interface CacheMiddlewareOptions {
  ttl?: number;
  tags?: string[];
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  vary?: string[];
  staleWhileRevalidate?: number;
  skipSuccessCode?: number[];
  skipMethods?: string[];
  varyByUser?: boolean;
  varyByCompany?: boolean;
  compress?: boolean;
}

interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  etag?: string;
}

interface CacheControl {
  maxAge?: number;
  sMaxAge?: number;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  private?: boolean;
  public?: boolean;
}

export class CacheMiddleware {
  private readonly logger: Logger;
  private readonly defaultTTL: number = 300; // 5 minutes

  constructor() {
    this.logger = new Logger('CacheMiddleware');
  }

  /**
   * HTTP Response caching middleware
   */
  httpCache(options: CacheMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const {
        ttl = this.defaultTTL,
        tags = [],
        keyGenerator = this.defaultKeyGenerator,
        condition = () => true,
        vary = [],
        staleWhileRevalidate = 0,
        skipSuccessCode = [],
        skipMethods = ['POST', 'PUT', 'DELETE', 'PATCH'],
        varyByUser = false,
        varyByCompany = false,
        compress = false
      } = options;

      // Skip caching for certain methods
      if (skipMethods.includes(req.method)) {
        return next();
      }

      // Check condition
      if (!condition(req, res)) {
        return next();
      }

      try {
        // Generate cache key
        const cacheKey = this.buildCacheKey(req, keyGenerator, {
          vary,
          varyByUser,
          varyByCompany
        });

        // Try to get from cache
        const cached = await cacheService.get<CachedResponse>(cacheKey);

        if (cached) {
          // Check if stale-while-revalidate should trigger background refresh
          const age = (Date.now() - cached.timestamp) / 1000;
          if (staleWhileRevalidate > 0 && age > ttl && age <= ttl + staleWhileRevalidate) {
            // Return stale data and refresh in background
            this.setResponseFromCache(res, cached);
            this.refreshCacheInBackground(req, cacheKey, ttl, tags, compress);
            return;
          }

          // Set cache headers
          this.setCacheHeaders(res, cached, age, ttl);
          this.setResponseFromCache(res, cached);
          return;
        }

        // Not in cache, proceed with request and cache response
        const originalSend = res.send;
        const originalJson = res.json;
        let responseBody: any;
        let responseSent = false;

        res.send = function(body: any) {
          if (!responseSent) {
            responseBody = body;
            responseSent = true;
            return originalSend.call(this, body);
          }
          return this;
        };

        res.json = function(obj: any) {
          if (!responseSent) {
            responseBody = obj;
            responseSent = true;
            return originalJson.call(this, obj);
          }
          return this;
        };

        // Continue with the request
        res.on('finish', async () => {
          try {
            // Only cache successful responses
            if (res.statusCode >= 200 &&
                res.statusCode < 300 &&
                !skipSuccessCode.includes(res.statusCode) &&
                responseBody !== undefined) {

              const cachedResponse: CachedResponse = {
                statusCode: res.statusCode,
                headers: this.extractCacheableHeaders(res),
                body: responseBody,
                timestamp: Date.now(),
                etag: this.generateETag(responseBody)
              };

              await cacheService.set(cacheKey, cachedResponse, {
                ttl,
                tags,
                compress
              });
            }
          } catch (error) {
            this.logger.error('Error caching response:', error);
          }
        });

        next();
      } catch (error) {
        this.logger.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * API Response caching for specific routes
   */
  apiCache(cacheKey: string, options: CacheMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const {
        ttl = this.defaultTTL,
        tags = [],
        condition = () => true
      } = options;

      if (!condition(req, res)) {
        return next();
      }

      try {
        const fullKey = this.buildApiCacheKey(req, cacheKey);
        const cached = await cacheService.get(fullKey);

        if (cached) {
          res.set('X-Cache', 'HIT');
          return res.json(cached);
        }

        // Override res.json to cache the response
        const originalJson = res.json;
        res.json = function(obj: any) {
          // Cache the response
          cacheService.set(fullKey, obj, { ttl, tags })
            .catch(error => console.error('Failed to cache API response:', error));

          res.set('X-Cache', 'MISS');
          return originalJson.call(this, obj);
        };

        next();
      } catch (error) {
        this.logger.error('API cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Fragment caching for partial views
   */
  fragmentCache(fragmentKey: string, options: CacheMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const {
        ttl = this.defaultTTL,
        tags = []
      } = options;

      try {
        const fullKey = `fragment:${fragmentKey}:${this.defaultKeyGenerator(req)}`;
        const cached = await cacheService.get<string>(fullKey);

        if (cached) {
          res.set('X-Fragment-Cache', 'HIT');
          return res.send(cached);
        }

        // Capture the rendered output
        const originalSend = res.send;
        res.send = function(body: any) {
          // Cache the fragment
          if (typeof body === 'string') {
            cacheService.set(fullKey, body, { ttl, tags })
              .catch(error => console.error('Failed to cache fragment:', error));
          }

          res.set('X-Fragment-Cache', 'MISS');
          return originalSend.call(this, body);
        };

        next();
      } catch (error) {
        this.logger.error('Fragment cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Cache invalidation middleware
   */
  invalidateCache(tagsOrPattern: string[] | string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Execute the main request first
      res.on('finish', async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (Array.isArray(tagsOrPattern)) {
              await cacheService.invalidateByTags(tagsOrPattern);
              this.logger.debug(`Invalidated cache tags: ${tagsOrPattern.join(', ')}`);
            } else {
              await cacheService.invalidateByPattern(tagsOrPattern);
              this.logger.debug(`Invalidated cache pattern: ${tagsOrPattern}`);
            }
          }
        } catch (error) {
          this.logger.error('Cache invalidation error:', error);
        }
      });

      next();
    };
  }

  /**
   * Conditional caching based on request/response conditions
   */
  conditionalCache(options: CacheMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const {
        condition = () => true
      } = options;

      // Add conditional logic
      const shouldCache = condition(req, res);

      if (shouldCache) {
        return this.httpCache(options)(req, res, next);
      }

      next();
    };
  }

  /**
   * Cache warming middleware for pre-loading data
   */
  warmCache(warmupConfig: Array<{
    pattern: string;
    factory: (req: Request) => Promise<any>;
    ttl?: number;
    tags?: string[];
  }>) {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Warm cache in background, don't block request
      setImmediate(async () => {
        for (const config of warmupConfig) {
          try {
            const key = this.interpolatePattern(config.pattern, req);
            const exists = await cacheService.exists(key);

            if (!exists) {
              const data = await config.factory(req);
              await cacheService.set(key, data, {
                ttl: config.ttl || this.defaultTTL,
                tags: config.tags || []
              });
            }
          } catch (error) {
            this.logger.error('Cache warming error:', error);
          }
        }
      });

      next();
    };
  }

  /**
   * Cache control headers middleware
   */
  cacheControl(control: CacheControl) {
    return (req: Request, res: Response, next: NextFunction) => {
      const directives: string[] = [];

      if (control.maxAge !== undefined) {
        directives.push(`max-age=${control.maxAge}`);
      }
      if (control.sMaxAge !== undefined) {
        directives.push(`s-maxage=${control.sMaxAge}`);
      }
      if (control.noCache) {
        directives.push('no-cache');
      }
      if (control.noStore) {
        directives.push('no-store');
      }
      if (control.mustRevalidate) {
        directives.push('must-revalidate');
      }
      if (control.private) {
        directives.push('private');
      }
      if (control.public) {
        directives.push('public');
      }

      if (directives.length > 0) {
        res.set('Cache-Control', directives.join(', '));
      }

      next();
    };
  }

  /**
   * Private helper methods
   */
  private defaultKeyGenerator(req: Request): string {
    const url = req.originalUrl || req.url;
    const {method} = req;
    const query = JSON.stringify(req.query);

    return `http:${method}:${url}:${crypto.createHash('md5').update(query).digest('hex')}`;
  }

  private buildCacheKey(
    req: Request,
    keyGenerator: (req: Request) => string,
    options: {
      vary: string[];
      varyByUser: boolean;
      varyByCompany: boolean;
    }
  ): string {
    let baseKey = keyGenerator(req);

    // Add vary headers
    if (options.vary.length > 0) {
      const varyValues = options.vary.map(header =>
        req.get(header) || ''
      ).join(':');
      baseKey += `:vary:${crypto.createHash('md5').update(varyValues).digest('hex')}`;
    }

    // Add user context
    if (options.varyByUser && (req as any).user?.id) {
      baseKey += `:user:${(req as any).user.id}`;
    }

    // Add company context
    if (options.varyByCompany && (req as any).user?.companyId) {
      baseKey += `:company:${(req as any).user.companyId}`;
    }

    return baseKey;
  }

  private buildApiCacheKey(req: Request, baseKey: string): string {
    const userId = (req as any).user?.id || 'anonymous';
    const companyId = (req as any).user?.companyId || 'none';
    const query = Object.keys(req.query).length > 0 ?
      `:${crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex')}` : '';

    return `api:${baseKey}:${userId}:${companyId}${query}`;
  }

  private setResponseFromCache(res: Response, cached: CachedResponse): void {
    // Set status code
    res.status(cached.statusCode);

    // Set headers
    Object.entries(cached.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    // Set cache-specific headers
    res.set('X-Cache', 'HIT');
    if (cached.etag) {
      res.set('ETag', cached.etag);
    }

    // Send response
    if (typeof cached.body === 'string') {
      res.send(cached.body);
    } else {
      res.json(cached.body);
    }
  }

  private setCacheHeaders(res: Response, cached: CachedResponse, age: number, maxAge: number): void {
    res.set('Age', Math.floor(age).toString());
    res.set('Cache-Control', `max-age=${maxAge}`);

    if (cached.etag) {
      res.set('ETag', cached.etag);
    }
  }

  private extractCacheableHeaders(res: Response): Record<string, string> {
    const cacheableHeaders = [
      'content-type',
      'content-encoding',
      'etag',
      'last-modified'
    ];

    const headers: Record<string, string> = {};
    cacheableHeaders.forEach(header => {
      const value = res.get(header);
      if (value) {
        headers[header] = value;
      }
    });

    return headers;
  }

  private generateETag(content: any): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    return `"${crypto.createHash('md5').update(str).digest('hex')}"`;
  }

  private async refreshCacheInBackground(
    req: Request,
    cacheKey: string,
    ttl: number,
    tags: string[],
    compress: boolean
  ): Promise<void> {
    // This would typically trigger a background job to refresh the cache
    // For now, we'll just log the intent
    this.logger.debug(`Background cache refresh scheduled for key: ${cacheKey}`);
  }

  private interpolatePattern(pattern: string, req: Request): string {
    return pattern
      .replace('{userId}', (req as any).user?.id || 'anonymous')
      .replace('{companyId}', (req as any).user?.companyId || 'none')
      .replace('{method}', req.method)
      .replace('{path}', req.path);
  }
}

export const cacheMiddleware = new CacheMiddleware();
