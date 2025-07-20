import { createServer } from 'http';

import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { Server as SocketIOServer } from 'socket.io';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Load environment variables
dotenv.config();

// Import middleware
import { initializeI18n, createI18nMiddleware } from './config/i18n';
import { correlationIdMiddleware as correlationId } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import i18nMiddleware from './middleware/i18n';
import { performanceMiddleware as performanceMonitor } from './middleware/performance';
import { requestLogger } from './middleware/requestLogger';
import { responseFormatterMiddleware as responseFormatter } from './middleware/responseFormatter';
import databaseHealthRoutes from './routes/database-health';
import healthCheckRoutes from './routes/healthCheck';
import { streamingInitializationService } from './services/streaming/StreamingInitializationService';
import { LazyRouteLoader } from './utils/lazyRouteLoader';
import { startupCache } from './utils/startupCache';

// Import only critical routes immediately

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Performance tracking
const startupTimestamp = Date.now();
const performanceMetrics = {
  serverStart: startupTimestamp,
  dbConnected: null as number | null,
  i18nInitialized: null as number | null,
  streamingInitialized: null as number | null,
  serverReady: null as number | null
};

// Create HTTP server and Socket.IO instance
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Optimized MongoDB Connection with connection pooling and timeouts
const connectDB = async (): Promise<void> => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';

    const mongooseOptions = {
      // Connection pool optimization
      maxPoolSize: 10, // Maximum number of connections
      minPoolSize: 2,  // Minimum number of connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity

      // Timeout optimization
      serverSelectionTimeoutMS: 5000, // How long mongoose will try to connect
      socketTimeoutMS: 45000, // How long a send or receive on a socket can take
      connectTimeoutMS: 10000, // How long a connection can take to be opened

      // Additional optimizations
      bufferCommands: false, // Disable mongoose buffering

      // Heartbeat settings
      heartbeatFrequencyMS: 2000
    };

    await mongoose.connect(MONGODB_URI, mongooseOptions);
    performanceMetrics.dbConnected = Date.now();
    console.log(`✅ MongoDB connected successfully with optimized settings (${performanceMetrics.dbConnected - startupTimestamp}ms)`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    if (NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Lazy-loaded Swagger configuration
let swaggerSpec: any = null;
const getSwaggerSpec = () => {
  if (!swaggerSpec) {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'FoodXchange API',
          version: '1.0.0',
          description: 'Multi-sided B2B food commerce platform API',
          contact: {
            name: 'FoodXchange Team',
            email: 'support@foodxchange.com'
          }
        },
        servers: [
          {
            url: `http://localhost:${PORT}`,
            description: 'Development server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      },
      apis: ['./src/routes/*.ts', './src/controllers/*.ts']
    };
    swaggerSpec = swaggerJsdoc(swaggerOptions);
  }
  return swaggerSpec;
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Optimized global middleware stack
app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: NODE_ENV === 'production' ? undefined : false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Only use compression in production or when explicitly enabled
if (NODE_ENV === 'production' || process.env.ENABLE_COMPRESSION === 'true') {
  app.use(compression({
    level: 6, // Balance between compression ratio and speed
    threshold: 1024 // Only compress responses larger than 1KB
  }));
}

app.use(cookieParser());
app.use(express.json({
  limit: '10mb',
  type: ['application/json', 'application/*+json']
}));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 1000
}));

// Conditional logging based on environment
if (NODE_ENV !== 'test') {
  app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Parallel initialization of non-critical services
const initializeOptionalServices = async (): Promise<void> => {
  const initPromises: Promise<void>[] = [];

  // Initialize i18n (non-blocking)
  initPromises.push(
    initializeI18n()
      .then(() => {
        performanceMetrics.i18nInitialized = Date.now();
        console.log(`✅ i18n initialized (${performanceMetrics.i18nInitialized - startupTimestamp}ms)`);
      })
      .catch(error => {
        console.error('Failed to initialize i18n:', error);
      })
  );

  // Initialize streaming infrastructure (if enabled)
  if (process.env.ENABLE_KAFKA_STREAMING !== 'false') {
    initPromises.push(
      streamingInitializationService.initialize()
        .then(() => {
          performanceMetrics.streamingInitialized = Date.now();
          console.log(`✅ Streaming initialized (${performanceMetrics.streamingInitialized - startupTimestamp}ms)`);
        })
        .catch(error => {
          console.warn('⚠️  Failed to initialize streaming infrastructure:', error);
          console.warn('💡 Application will continue without event streaming capabilities');
        })
    );
  }

  // Run all initializations in parallel
  await Promise.allSettled(initPromises);
};

// Start optional services initialization in background
initializeOptionalServices();

// Custom middleware
app.use(correlationId);
app.use(responseFormatter);
app.use(requestLogger);
app.use(performanceMonitor);

// i18n middleware
app.use(createI18nMiddleware());
app.use(i18nMiddleware.languageDetection());
app.use(i18nMiddleware.translation());
app.use(i18nMiddleware.responseLocalization());
app.use(i18nMiddleware.rtlDetection());

// Apply rate limiting to API routes
app.use('/api', limiter);

// API documentation (lazy-loaded)
app.use('/api-docs', swaggerUi.serve, (req, res, next) => {
  const spec = getSwaggerSpec();
  swaggerUi.setup(spec)(req, res, next);
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Performance metrics endpoint
app.get('/health/performance', (req, res) => {
  const now = Date.now();
  res.json({
    startup: {
      totalTime: performanceMetrics.serverReady ? performanceMetrics.serverReady - startupTimestamp : null,
      databaseConnection: performanceMetrics.dbConnected ? performanceMetrics.dbConnected - startupTimestamp : null,
      i18nInitialization: performanceMetrics.i18nInitialized ? performanceMetrics.i18nInitialized - startupTimestamp : null,
      streamingSetup: performanceMetrics.streamingInitialized ? performanceMetrics.streamingInitialized - startupTimestamp : null,
      serverReady: performanceMetrics.serverReady ? performanceMetrics.serverReady - startupTimestamp : null
    },
    runtime: {
      uptime: process.uptime() * 1000, // Convert to milliseconds
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    routes: routeLoader ? routeLoader.getStats() : { total: 0, loaded: 0, pending: 0 },
    cache: startupCache ? startupCache.getStats() : { totalEntries: 0, totalSize: 0 },
    timestamp: new Date().toISOString()
  });
});

// API info route
app.get('/api', (req, res) => {
  res.json({
    name: 'FoodXchange API',
    version: '1.0.0',
    description: 'Multi-sided B2B food commerce platform API',
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      rfqs: '/api/rfqs',
      orders: '/api/orders',
      compliance: '/api/compliance',
      analytics: '/api/analytics',
      apiKeys: '/api/api-keys',
      tenant: '/api/tenant',
      search: '/api/search',
      i18n: '/api/i18n',
      demandForecast: '/api/forecast',
      streaming: '/api/streaming',
      abTesting: '/api/ab-testing',
      rateLimiting: '/api/rate-limiting'
    },
    timestamp: new Date().toISOString()
  });
});

// Initialize lazy route loader
const routeLoader = new LazyRouteLoader(app);

// Configure route loading priorities
routeLoader.registerRoutes([
  // Critical routes - load immediately
  { path: '/health', modulePath: './routes/healthCheck', priority: 'critical', description: 'Health check' },
  { path: '/api/database', modulePath: './routes/database-health', priority: 'critical', description: 'Database health' },
  { path: '/api/auth', modulePath: './routes/auth', priority: 'critical', description: 'Authentication' },

  // Normal priority - load after server start
  { path: '/api/products', modulePath: './routes/products', priority: 'normal', description: 'Product management' },
  { path: '/api/rfqs', modulePath: './routes/rfqs', priority: 'normal', description: 'RFQ management' },
  { path: '/api/orders', modulePath: './routes/orders', priority: 'normal', description: 'Order management' },
  { path: '/api/compliance', modulePath: './routes/compliance/complianceRoutes', priority: 'normal', description: 'Compliance' },
  { path: '/api/tenant', modulePath: './routes/tenant', priority: 'normal', description: 'Tenant management' },

  // Lazy loading - load on first request
  { path: '/api/analytics', modulePath: './routes/analytics/analyticsRoutes', priority: 'lazy', description: 'Analytics' },
  { path: '/api/api-keys', modulePath: './routes/apiKeys', priority: 'lazy', description: 'API key management' },
  { path: '/api/search', modulePath: './routes/search', priority: 'lazy', description: 'Search' },
  { path: '/api/i18n', modulePath: './routes/i18n', priority: 'lazy', description: 'Internationalization' },
  { path: '/api/forecast', modulePath: './routes/demandForecast', priority: 'lazy', description: 'Demand forecasting' },
  { path: '/api/streaming', modulePath: './routes/streaming', priority: 'lazy', description: 'Event streaming' },
  { path: '/api/ab-testing', modulePath: './routes/abTesting', priority: 'lazy', description: 'A/B testing' },
  { path: '/api/rate-limiting', modulePath: './routes/rateLimiting', priority: 'lazy', description: 'Rate limiting' }
]);

// Mount critical routes immediately
app.use('/health', healthCheckRoutes);
app.use('/api/database', databaseHealthRoutes);

// Load critical routes
routeLoader.loadCriticalRoutes().catch(error => {
  console.error('Failed to load critical routes:', error);
});

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

// Global error handler
app.use(errorHandler);

// Initialize database and start server
const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      performanceMetrics.serverReady = Date.now();
      const totalStartupTime = performanceMetrics.serverReady - startupTimestamp;

      console.log(`
🚀 FoodXchange Backend Server Started!
📍 Port: ${PORT}
🌍 Environment: ${NODE_ENV}
💻 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/health
📚 API Documentation: http://localhost:${PORT}/api-docs
⚡ Socket.IO: Enabled
🔒 Security: Helmet, CORS, Rate Limiting
📊 Monitoring: Morgan, Performance Tracking

⏱️  Startup Performance:
  📈 Total startup time: ${totalStartupTime}ms
  🗄️  Database connection: ${performanceMetrics.dbConnected ? performanceMetrics.dbConnected - startupTimestamp : 'pending'}ms
  🌐 i18n initialization: ${performanceMetrics.i18nInitialized ? performanceMetrics.i18nInitialized - startupTimestamp : 'pending'}ms
  📡 Streaming setup: ${performanceMetrics.streamingInitialized ? performanceMetrics.streamingInitialized - startupTimestamp : 'disabled/pending'}ms
      `);

      // Load normal priority routes after server is ready
      setTimeout(() => {
        routeLoader.loadNormalRoutes().then(() => {
          const routeStats = routeLoader.getStats();
          console.log(`🚀 Normal priority routes loaded (${routeStats.loaded}/${routeStats.total})`);
        }).catch(error => {
          console.error('Failed to load normal priority routes:', error);
        });
      }, 100); // Small delay to ensure server is fully ready
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  console.log(`${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');

    // Shutdown streaming infrastructure
    if (streamingInitializationService.isStreamingInitialized()) {
      streamingInitializationService.shutdown().then(() => {
        console.log('Streaming infrastructure closed');
        mongoose.connection.close(false, () => {
          console.log('MongoDB connection closed');
          process.exit(0);
        });
      }).catch((error) => {
        console.error('Error shutting down streaming:', error);
        mongoose.connection.close(false, () => {
          console.log('MongoDB connection closed');
          process.exit(1);
        });
      });
    } else {
      mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;
