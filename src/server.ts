/**
 * Enterprise-grade Server Configuration
 * FoodXchange B2B Commerce Platform
 */

import 'reflect-metadata'; // Required for dependency injection
import express, { Express } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';

// Core imports
import { config, isProduction, isDevelopment } from './core/config';
import corsConfig from '../config/cors.config';
import { Logger, requestLogger, logUnhandledErrors } from './core/logging/logger';
import { errorHandler, asyncHandler } from './core/errors';
import { Container, bootstrap, ServiceTokens } from './core/di/Container';

// Infrastructure imports
import { DatabaseService } from './infrastructure/database/DatabaseService';
import { CacheService } from './infrastructure/cache/CacheService';
import { MetricsService } from './infrastructure/monitoring/MetricsService';
import { AzureAIService } from './infrastructure/azure/ai/AzureAIService';

// Middleware imports
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';
import { correlationIdMiddleware } from './middleware/correlationId';

// Route imports
import { configureRoutes } from './routes';

// WebSocket services
import agentWebSocketService from './services/websocket/agentWebSocketService';

// Initialize logger
const logger = new Logger('Server');

export class Server {
  private app: Express;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;
  private isInitialized = false;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: corsConfig as any,
    });
    this.port = config.port;
  }

  // Initialize all services
  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    // Bootstrap dependency injection container
    await bootstrap([
      // Core services
      { provide: ServiceTokens.Config, useValue: config },
      { provide: ServiceTokens.Logger, useFactory: () => new Logger('App') },
      
      // Infrastructure services
      { provide: ServiceTokens.Database, useFactory: () => DatabaseService.getInstance() },
      { provide: ServiceTokens.Cache, useFactory: () => CacheService.getInstance() },
      { provide: ServiceTokens.Metrics, useFactory: () => MetricsService.getInstance() },
      { provide: ServiceTokens.AzureAI, useFactory: () => AzureAIService.getInstance() },
    ]);

    // Initialize database
    const database = await Container.getInstance().resolve<DatabaseService>(ServiceTokens.Database);
    await database.connect();
    await database.ensureIndexes();

    // Initialize Azure AI if configured
    const azureAI = await Container.getInstance().resolve<AzureAIService>(ServiceTokens.AzureAI);
    await azureAI.initialize();

    logger.info('All services initialized successfully');
  }

  // Configure Express middleware
  private configureMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: isProduction() ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }));

    // CORS
    this.app.use(cors(corsConfig));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.security.rateLimiting.windowMs,
      max: config.security.rateLimiting.max,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // MongoDB injection prevention
    this.app.use(mongoSanitize());

    // Logging
    if (isDevelopment()) {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Custom middleware
    this.app.use(correlationIdMiddleware);
    this.app.use(requestLogger);

    // Trust proxy
    this.app.set('trust proxy', 1);

    logger.info('Middleware configured');
  }

  // Configure routes
  private configureRoutes(): void {
    // Health check endpoint
    this.app.get('/health', asyncHandler(async (req, res) => {
      const [database, cache, azureAI] = await Promise.all([
        Container.getInstance().resolve<DatabaseService>(ServiceTokens.Database).then(db => db.healthCheck()),
        Container.getInstance().resolve<CacheService>(ServiceTokens.Cache).then(c => c.healthCheck()),
        Container.getInstance().resolve<AzureAIService>(ServiceTokens.AzureAI).then(ai => ai.healthCheck()),
      ]);

      const healthy = database.healthy && cache.healthy;
      const status = healthy ? 200 : 503;

      res.status(status).json({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database,
          cache,
          azureAI,
        },
        version: process.env.npm_package_version || '1.0.0',
        environment: config.env,
      });
    }));

    // Metrics endpoint
    this.app.get('/metrics', asyncHandler(async (req, res) => {
      const metrics = await Container.getInstance().resolve<MetricsService>(ServiceTokens.Metrics);
      res.set('Content-Type', 'text/plain');
      res.send(metrics.exportPrometheus());
    }));

    // API routes
    configureRoutes(this.app);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    });

    // Error handler (must be last)
    this.app.use(errorHandler);

    logger.info('Routes configured');
  }

  // Configure WebSocket
  private configureWebSocket(): void {
    this.io.use(async (socket, next) => {
      try {
        // Authenticate WebSocket connection
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify token and attach user to socket
        // TODO: Implement token verification
        socket.data.userId = 'user-id'; // Replace with actual user ID
        
        next();
      } catch (error) {
        next(error);
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      logger.info('WebSocket client connected', { socketId: socket.id, userId });

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle events
      socket.on('subscribe', (channel: string) => {
        socket.join(channel);
        logger.debug('Client subscribed to channel', { socketId: socket.id, channel });
      });

      socket.on('unsubscribe', (channel: string) => {
        socket.leave(channel);
        logger.debug('Client unsubscribed from channel', { socketId: socket.id, channel });
      });

      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', { socketId: socket.id, userId });
      });
    });

    // Attach io instance to app for use in controllers
    this.app.set('io', this.io);
    
    // Initialize agent WebSocket service
    agentWebSocketService.initialize(this.io);

    logger.info('WebSocket configured');
  }

  // Graceful shutdown
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      this.httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      // Close WebSocket connections
      this.io.close(() => {
        logger.info('WebSocket server closed');
      });

      try {
        // Disconnect from database
        const database = await Container.getInstance().resolve<DatabaseService>(ServiceTokens.Database);
        await database.disconnect();

        // Stop metrics collection
        const metrics = await Container.getInstance().resolve<MetricsService>(ServiceTokens.Metrics);
        metrics.stop();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  // Start the server
  public async start(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('Server already initialized');
        return;
      }

      logger.info('Starting FoodXchange server...');

      // Setup error handling
      logUnhandledErrors();

      // Initialize services
      await this.initializeServices();

      // Configure server
      this.configureMiddleware();
      this.configureRoutes();
      this.configureWebSocket();
      this.setupGracefulShutdown();

      // Start listening
      this.httpServer.listen(this.port, () => {
        logger.info('='.repeat(60));
        logger.info('🚀 FoodXchange Server Started Successfully!');
        logger.info('='.repeat(60));
        logger.info(`📍 Server URL: http://localhost:${this.port}`);
        logger.info(`🏥 Health Check: http://localhost:${this.port}/health`);
        logger.info(`📊 Metrics: http://localhost:${this.port}/metrics`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info(`📘 TypeScript: Active`);
        logger.info(`🔐 Security: Enhanced`);
        logger.info(`🚀 Performance: Optimized`);
        logger.info('='.repeat(60));
      });

      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }
}

// Create and start server if this is the main module
if (require.main === module) {
  const server = new Server();
  server.start().catch((error) => {
    logger.error('Fatal error starting server', error);
    process.exit(1);
  });
}

export default Server;