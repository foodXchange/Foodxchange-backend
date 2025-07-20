/**
 * Centralized Route Configuration
 * Manages all API routes for the application
 */

import { Express, Router } from 'express';

import aiRoutes from '../api/routes/ai';
import recommendationRoutes from '../api/routes/recommendations';
import { Logger } from '../core/logging/logger';

// Import route modules
import agentRoutes from './agentRoutes';
import aiRecommendationRoutes from './ai/recommendationRoutes';
import analyticsRoutes from './analytics/analyticsRoutes';
import authRoutes from './auth/authRoutes';
import complianceRoutes from './compliance/complianceRoutes';
import exportRoutes from './export/exportRoutes';
import importRoutes from './import';
import orderRoutes from './marketplace/orderRoutes';
import productRoutes from './marketplace/productRoutes';
import rfqRoutes from './marketplace/rfqRoutes';
import sampleRoutes from './marketplace/sampleRoutes';
import supplierRoutes from './marketplace/supplierRoutes';
import mobileRoutes from './mobile/mobileRoutes';
import performanceRoutes from './performance';
import signalRRoutes from './signalr';
import trackingRoutes from './tracking';
import webhookRoutes from './webhookRoutes';

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
    { path: '/tracking', router: trackingRoutes, name: 'Tracking' },
    { path: '/recommendations', router: recommendationRoutes, name: 'AI Recommendations' },
    { path: '/ai-services', router: aiRoutes, name: 'AI Services' },
    { path: '/agents', router: agentRoutes, name: 'Agent Management' },
    { path: '/webhooks', router: webhookRoutes, name: 'Webhook Endpoints' },
    { path: '/signalr', router: signalRRoutes, name: 'SignalR Real-time' },
    { path: '/analytics', router: analyticsRoutes, name: 'Analytics & Reporting' },
    { path: '/mobile', router: mobileRoutes, name: 'Mobile API' },
    { path: '/ai', router: aiRecommendationRoutes, name: 'AI Recommendations & Search' },
    { path: '/export', router: exportRoutes, name: 'Data Export/Import' },
    { path: '/performance', router: performanceRoutes, name: 'Performance Monitoring' }
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
        name: r.name
      })),
      timestamp: new Date().toISOString()
    });
  });

  logger.info(`All routes configured under ${API_PREFIX}`);
};
