/**
 * Centralized Route Configuration
 * Manages all API routes for the application
 */

import { Express, Router } from 'express';
import { Logger } from '../core/logging/logger';

// Import route modules
import authRoutes from './auth/authRoutes';
import productRoutes from './marketplace/productRoutes';
import rfqRoutes from './marketplace/rfqRoutes';
import complianceRoutes from './compliance/complianceRoutes';
import orderRoutes from './marketplace/orderRoutes';
import sampleRoutes from './marketplace/sampleRoutes';
import supplierRoutes from './marketplace/supplierRoutes';
import importRoutes from './import';

const logger = new Logger('Routes');

export const configureRoutes = (app: Express): void => {
  const apiRouter = Router();

  // API version prefix
  const API_PREFIX = '/api/v1';

  // Mount routes
  const routes = [
    { path: '/auth', router: authRoutes, name: 'Authentication' },
    { path: '/products', router: productRoutes, name: 'Products' },
    { path: '/rfq', router: rfqRoutes, name: 'RFQ' },
    { path: '/rfqs', router: rfqRoutes, name: 'RFQs (alias)' }, // Alias
    { path: '/compliance', router: complianceRoutes, name: 'Compliance' },
    { path: '/orders', router: orderRoutes, name: 'Orders' },
    { path: '/samples', router: sampleRoutes, name: 'Sample Requests' },
    { path: '/suppliers', router: supplierRoutes, name: 'Suppliers' },
    { path: '/import', router: importRoutes, name: 'Import' },
  ];

  // Register each route
  routes.forEach(({ path, router, name }) => {
    try {
      apiRouter.use(path, router);
      logger.info(`Route registered: ${API_PREFIX}${path} (${name})`);
    } catch (error) {
      logger.error(`Failed to register route: ${path}`, error);
    }
  });

  // Mount API router
  app.use(API_PREFIX, apiRouter);

  // API documentation route
  app.get('/api', (_req, res) => {
    res.json({
      name: 'FoodXchange API',
      version: 'v1',
      status: 'operational',
      documentation: '/api/docs',
      endpoints: routes.map(r => ({
        path: `${API_PREFIX}${r.path}`,
        name: r.name,
      })),
      timestamp: new Date().toISOString(),
    });
  });

  logger.info(`All routes configured under ${API_PREFIX}`);
};