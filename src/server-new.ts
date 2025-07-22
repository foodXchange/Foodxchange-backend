/**
 * FoodXchange Backend Server with Advanced Architecture Integration
 */

import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Load environment variables first
dotenv.config();

// Import the new architecture
import { ArchitectureIntegrator, createDefaultConfig } from './core/integration/ArchitectureIntegrator';
import { LazyRouteLoader } from './utils/lazyRouteLoader';
import { initializeI18n, createI18nMiddleware } from './config/i18n';
import { correlationIdMiddleware } from './middleware/correlationId';
import { responseFormatterMiddleware } from './middleware/responseFormatter';
import { requestLogger } from './middleware/requestLogger';
import i18nMiddleware from './middleware/i18n';
import healthCheckRoutes from './routes/healthCheck';
import databaseHealthRoutes from './routes/database-health';

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create HTTP server and Socket.IO instance
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Performance tracking
const startupTimestamp = Date.now();
let architectureIntegrator: ArchitectureIntegrator;

async function startServer(): Promise<void> {
  try {
    console.log('🚀 Initializing FoodXchange Backend with Advanced Architecture...');

    // Initialize advanced architecture
    const config = createDefaultConfig();
    
    // Override with environment-specific config
    if (process.env.REDIS_HOST) {
      config.redis = {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      };
    }

    if (process.env.MONGODB_URI) {
      config.database.primary.uri = process.env.MONGODB_URI;
    }

    if (process.env.JAEGER_ENDPOINT) {
      config.tracing.jaegerEndpoint = process.env.JAEGER_ENDPOINT;
    }

    // Initialize architecture
    architectureIntegrator = new ArchitectureIntegrator(config);
    const services = await architectureIntegrator.initialize();

    console.log('✅ Advanced architecture initialized successfully');

    // Basic Express setup
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Apply middleware stack from architecture
    const middlewares = architectureIntegrator.createMiddlewareStack();
    app.use(middlewares);

    // Custom middleware
    app.use(correlationIdMiddleware);
    app.use(responseFormatterMiddleware);
    app.use(requestLogger);

    // Initialize i18n
    try {
      await initializeI18n();
      app.use(createI18nMiddleware());
      app.use(i18nMiddleware.languageDetection());
      app.use(i18nMiddleware.translation());
      app.use(i18nMiddleware.responseLocalization());
      app.use(i18nMiddleware.rtlDetection());
      console.log('✅ i18n initialized');
    } catch (error) {
      console.warn('⚠️  Failed to initialize i18n:', error);
    }

    // Health check endpoints
    app.get('/health', async (req, res) => {
      const health = await architectureIntegrator.getHealthStatus();
      res.json({
        ...health,
        environment: NODE_ENV,
        version: '2.0.0',
        uptime: process.uptime()
      });
    });

    app.use('/health', healthCheckRoutes);
    app.use('/api/database', databaseHealthRoutes);

    // API info route
    app.get('/api', (req, res) => {
      res.json({
        name: 'FoodXchange API',
        version: '2.0.0',
        description: 'Multi-sided B2B food commerce platform API with Advanced Architecture',
        documentation: '/api-docs',
        architecture: 'Enterprise-grade with caching, circuit breakers, tracing, and security',
        endpoints: {
          auth: '/api/auth',
          products: '/api/products',
          rfqs: '/api/rfqs',
          orders: '/api/orders',
          compliance: '/api/compliance',
          analytics: '/api/analytics',
          tenant: '/api/tenant',
          search: '/api/search',
          upload: '/api/upload'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Initialize lazy route loader
    const routeLoader = new LazyRouteLoader(app);

    // Configure route loading priorities
    routeLoader.registerRoutes([
      // Critical routes - load immediately
      { path: '/api/auth', modulePath: './routes/auth', priority: 'critical', description: 'Authentication' },
      
      // Normal priority - load after server start
      { path: '/api/products', modulePath: './routes/products', priority: 'normal', description: 'Product management' },
      { path: '/api/rfqs', modulePath: './routes/rfqs', priority: 'normal', description: 'RFQ management' },
      { path: '/api/orders', modulePath: './routes/orders', priority: 'normal', description: 'Order management' },
      { path: '/api/compliance', modulePath: './routes/compliance/complianceRoutes', priority: 'normal', description: 'Compliance' },
      { path: '/api/tenant', modulePath: './routes/tenant', priority: 'normal', description: 'Tenant management' },
      { path: '/api/upload', modulePath: './routes/upload-simple', priority: 'normal', description: 'CSV bulk upload' },
      
      // Lazy loading - load on first request
      { path: '/api/analytics', modulePath: './routes/analytics/analyticsRoutes', priority: 'lazy', description: 'Analytics' },
      { path: '/api/api-keys', modulePath: './routes/apiKeys', priority: 'lazy', description: 'API key management' },
      { path: '/api/search', modulePath: './routes/search', priority: 'lazy', description: 'Search' },
      { path: '/api/i18n', modulePath: './routes/i18n', priority: 'lazy', description: 'Internationalization' }
    ]);

    // Load critical routes
    await routeLoader.loadCriticalRoutes();
    console.log('✅ Critical routes loaded');

    // Setup lazy routes
    routeLoader.setupLazyRoutes();

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Start server
    server.listen(PORT, () => {
      const totalStartupTime = Date.now() - startupTimestamp;
      
      console.log(`
🚀 FoodXchange Backend Server Started with Advanced Architecture!
📍 Port: ${PORT}
🌍 Environment: ${NODE_ENV}
💻 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health
⚡ Socket.IO: Enabled
🛡️  Security: Advanced threat detection, rate limiting, encryption
📊 Monitoring: Distributed tracing, metrics, circuit breakers
🚀 Performance: Multi-level caching, compression, optimization
🔧 Architecture: Enterprise-grade microservices-ready

⏱️  Startup Performance: ${totalStartupTime}ms
      `);

      // Load normal priority routes after server is ready
      setTimeout(() => {
        routeLoader.loadNormalRoutes().then(() => {
          const routeStats = routeLoader.getStats();
          console.log(`🚀 Normal priority routes loaded (${routeStats.loaded}/${routeStats.total})`);
        }).catch(error => {
          console.error('Failed to load normal priority routes:', error);
        });
      }, 100);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} signal received: closing HTTP server`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    if (architectureIntegrator) {
      try {
        await architectureIntegrator.shutdown();
        console.log('✅ Architecture shutdown completed');
      } catch (error) {
        console.error('❌ Error during architecture shutdown:', error);
      }
    }
    
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  if (architectureIntegrator) {
    try {
      await architectureIntegrator.shutdown();
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (architectureIntegrator) {
    try {
      await architectureIntegrator.shutdown();
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }
  }
  process.exit(1);
});

// Start the server
startServer();

export default app;