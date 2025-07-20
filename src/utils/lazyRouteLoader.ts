import { Express, Router } from 'express';

import { Logger } from '../core/logging/logger';

interface RouteConfig {
  path: string;
  modulePath: string;
  priority: 'critical' | 'normal' | 'lazy';
  description?: string;
}

export class LazyRouteLoader {
  private readonly app: Express;
  private readonly logger: Logger;
  private readonly loadedRoutes: Set<string> = new Set();
  private routeConfigs: RouteConfig[] = [];

  constructor(app: Express) {
    this.app = app;
    this.logger = new Logger('LazyRouteLoader');
  }

  /**
   * Register routes with their loading priority
   */
  registerRoutes(configs: RouteConfig[]): void {
    this.routeConfigs = configs;
  }

  /**
   * Load critical routes immediately
   */
  async loadCriticalRoutes(): Promise<void> {
    const criticalRoutes = this.routeConfigs.filter(config => config.priority === 'critical');

    for (const config of criticalRoutes) {
      await this.loadRoute(config);
    }
  }

  /**
   * Load normal priority routes
   */
  async loadNormalRoutes(): Promise<void> {
    const normalRoutes = this.routeConfigs.filter(config => config.priority === 'normal');

    // Load normal routes in parallel
    const loadPromises = normalRoutes.map(async config => this.loadRoute(config));
    await Promise.allSettled(loadPromises);
  }

  /**
   * Setup lazy loading for low-priority routes
   */
  setupLazyRoutes(): void {
    const lazyRoutes = this.routeConfigs.filter(config => config.priority === 'lazy');

    for (const config of lazyRoutes) {
      this.setupLazyRoute(config);
    }
  }

  /**
   * Load a single route
   */
  private async loadRoute(config: RouteConfig): Promise<void> {
    if (this.loadedRoutes.has(config.path)) {
      return;
    }

    try {
      const startTime = Date.now();
      // Fix import path to use absolute path from src directory
      const importPath = config.modulePath.startsWith('.') 
        ? `../${config.modulePath.substring(2)}` 
        : config.modulePath;
      
      const routeModule = await import(importPath);
      const router = routeModule.default || routeModule;

      this.app.use(config.path, router);
      this.loadedRoutes.add(config.path);

      const loadTime = Date.now() - startTime;
      this.logger.info(`✅ Route loaded: ${config.path}`, {
        modulePath: config.modulePath,
        loadTime: `${loadTime}ms`,
        priority: config.priority
      });
    } catch (error) {
      this.logger.error(`❌ Failed to load route: ${config.path}`, {
        modulePath: config.modulePath,
        error: error instanceof Error ? error.message : String(error)
      });

      // Create fallback route for failed loads
      this.createFallbackRoute(config);
    }
  }

  /**
   * Setup lazy loading for a route (loads on first request)
   */
  private setupLazyRoute(config: RouteConfig): void {
    this.app.use(config.path, async (req, res, next) => {
      if (!this.loadedRoutes.has(config.path)) {
        try {
          await this.loadRoute(config);

          // Re-route the request to the newly loaded route
          const importPath = config.modulePath.startsWith('.') 
            ? `../${config.modulePath.substring(2)}` 
            : config.modulePath;
          const routeModule = await import(importPath);
          const router = routeModule.default || routeModule;
          router(req, res, next);
        } catch (error) {
          this.logger.error(`Failed to lazy load route: ${config.path}`, error);
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'Route failed to load',
            path: config.path
          });
        }
      } else {
        next();
      }
    });
  }

  /**
   * Create a fallback route for failed loads
   */
  private createFallbackRoute(config: RouteConfig): void {
    this.app.use(config.path, (req, res) => {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: `${config.description || config.path} service is currently unavailable`,
        path: config.path,
        retryAfter: 30
      });
    });
  }

  /**
   * Get loading statistics
   */
  getStats(): { total: number; loaded: number; pending: number } {
    return {
      total: this.routeConfigs.length,
      loaded: this.loadedRoutes.size,
      pending: this.routeConfigs.length - this.loadedRoutes.size
    };
  }
}
