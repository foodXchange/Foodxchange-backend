/**
 * FoodXchange Backend Server - Optimized & Production-Ready
 * Enterprise-grade server with comprehensive optimizations
 */

import 'reflect-metadata';
import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Core optimizations
import { configManager } from './core/config/ConfigManager';
import { Logger } from './core/logging/logger';
import { container } from './core/container/Container';
import { databaseManager } from './config/database';
import { cacheManager } from './services/cache/CacheManager';
import { jobProcessor } from './services/queue/JobProcessor';
import { healthCheckService, setupGracefulShutdown } from './services/health/HealthCheckService';

// Enhanced middleware
import { httpOptimizationMiddleware } from './middleware/httpOptimization';
import { securitySanitizationMiddleware } from './middleware/security/inputSanitizer';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// API routes
import apiRoutes from './routes/api/v1';

// Initialize logger
const logger = new Logger('Server');

export class OptimizedServer {
  private app: Express;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;
  private host: string;
  private isInitialized = false;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.port = configManager.get('PORT');
    this.host = configManager.get('HOST');
    
    // Initialize Socket.IO with CORS
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: configManager.get('CORS_ORIGIN'),
        credentials: configManager.get('CORS_CREDENTIALS'),
        methods: ['GET', 'POST']
      }
    });
  }

  /**
   * Initialize all services with dependency injection
   */
  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    try {
      // Register core services in container
      container
        .singleton('configManager', () => configManager)
        .singleton('logger', () => logger)
        .singleton('databaseManager', () => databaseManager)
        .singleton('cacheManager', () => cacheManager)
        .singleton('jobProcessor', () => jobProcessor)
        .singleton('healthCheckService', () => healthCheckService);

      // Initialize database with optimization
      await databaseManager.connect();
      logger.info('Database connected and optimized');

      // Initialize cache manager
      logger.info('Cache manager initialized');

      // Start job processor
      jobProcessor.start();
      logger.info('Job processor started');

      // Start health monitoring
      healthCheckService.startPeriodicHealthChecks();
      logger.info('Health monitoring started');

      // Validate container
      const validation = container.validate();
      if (!validation.isValid) {
        throw new Error(`Container validation failed: ${validation.errors.join(', ')}`);
      }

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Configure comprehensive middleware stack
   */
  private configureMiddleware(): void {
    logger.info('Configuring middleware stack...');

    // Security headers
    if (configManager.get('HELMET_ENABLED')) {
      this.app.use(helmet({
        contentSecurityPolicy: configManager.isProduction() ? undefined : false,
        crossOriginEmbedderPolicy: false,
        hsts: configManager.isProduction()
      }));
    }

    // CORS configuration
    this.app.use(cors({
      origin: configManager.get('CORS_ORIGIN'),
      credentials: configManager.get('CORS_CREDENTIALS'),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Request-ID'],
      maxAge: 86400 // 24 hours
    }));

    // Rate limiting
    if (configManager.get('FEATURE_RATE_LIMITING')) {
      const limiter = rateLimit({
        windowMs: configManager.get('API_RATE_LIMIT_WINDOW'),
        max: configManager.get('API_RATE_LIMIT_MAX'),
        message: {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
            timestamp: new Date().toISOString()
          }
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
          // Skip rate limiting for health checks
          return req.path === '/health' || req.path === '/metrics';
        }
      });
      this.app.use(limiter);
    }

    // HTTP optimization middleware
    this.app.use(httpOptimizationMiddleware);

    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: configManager.get('API_MAX_REQUEST_SIZE'),
      type: ['application/json', 'application/vnd.api+json']
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: configManager.get('API_MAX_REQUEST_SIZE')
    }));

    // Security and input sanitization
    this.app.use(securitySanitizationMiddleware);

    // Logging
    if (configManager.isDevelopment()) {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined', {
        skip: (req, res) => res.statusCode < 400
      }));
    }

    // Trust proxy for load balancers
    this.app.set('trust proxy', 1);

    logger.info('Middleware stack configured');
  }

  /**
   * Configure API routes with monitoring
   */
  private configureRoutes(): void {
    logger.info('Configuring routes...');

    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const healthStatus = await healthCheckService.runHealthCheck();
        const statusCode = healthStatus.status === 'healthy' ? 200 : 
                          healthStatus.status === 'degraded' ? 200 : 503;
        
        res.status(statusCode).json({
          success: true,
          data: healthStatus,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          success: false,
          error: {
            code: 'HEALTH_CHECK_FAILED',
            message: 'Health check failed',
            timestamp: new Date().toISOString()
          }
        });
      }
    });

    // Liveness probe (for Kubernetes)
    this.app.get('/health/live', (req: Request, res: Response) => {
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Readiness probe (for Kubernetes)
    this.app.get('/health/ready', async (req: Request, res: Response) => {
      try {
        const isReady = databaseManager.isConnectionActive() && 
                       databaseManager.isSystemInitialized();
        
        if (isReady) {
          res.json({
            status: 'ready',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // API information endpoint
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'FoodXchange API',
        version: '1.0.0',
        description: 'Enterprise-grade B2B marketplace backend',
        environment: configManager.get('NODE_ENV'),
        features: configManager.getConfigSummary().features,
        endpoints: {
          health: '/health',
          api: '/api/v1',
          metrics: '/api/v1/monitoring/metrics',
          documentation: '/api/v1/docs'
        },
        optimizations: [
          'Multi-level caching',
          'Database optimization',
          'Input sanitization',
          'Request compression',
          'Performance monitoring',
          'Background job processing',
          'Graceful shutdown'
        ]
      });
    });

    // API v1 routes
    this.app.use('/api/v1', apiRoutes);

    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);

    logger.info('Routes configured successfully');
  }

  /**
   * Configure WebSocket with optimization
   */
  private configureWebSocket(): void {
    logger.info('Configuring WebSocket...');

    // WebSocket authentication middleware
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify JWT token
        const jwt = require('jsonwebtoken');
        const jwtSecret = configManager.get('JWT_SECRET') || process.env.JWT_SECRET || 'secret';
        
        try {
          const decoded = jwt.verify(token, jwtSecret) as any;
          socket.data.userId = decoded.userId || decoded.id;
          socket.data.userRole = decoded.role;
          socket.data.tenantId = decoded.tenantId;
          next();
        } catch (jwtError) {
          // Allow anonymous connections for public data
          socket.data.userId = 'anonymous';
          socket.data.userRole = 'guest';
          next();
        }
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    // WebSocket connection handling
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      logger.info('WebSocket client connected', { 
        socketId: socket.id, 
        userId,
        remoteAddress: socket.handshake.address
      });

      // Join user-specific room
      if (userId !== 'anonymous') {
        socket.join(`user:${userId}`);
      }

      // Handle room subscriptions
      socket.on('join_room', (room: string) => {
        socket.join(room);
        logger.debug('Client joined room', { socketId: socket.id, room });
      });

      socket.on('leave_room', (room: string) => {
        socket.leave(room);
        logger.debug('Client left room', { socketId: socket.id, room });
      });

      // Handle real-time events
      socket.on('agent_update', (data) => {
        // Broadcast to all clients in the same room
        socket.broadcast.emit('agent_update', data);
      });

      socket.on('notification', (data) => {
        // Send notification to specific user
        if (data.userId) {
          this.io.to(`user:${data.userId}`).emit('notification', data);
        }
      });

      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', { 
          socketId: socket.id, 
          userId, 
          reason 
        });
      });

      socket.on('error', (error) => {
        logger.error('WebSocket error', error, { socketId: socket.id, userId });
      });
    });

    // Attach io instance to app for controllers
    this.app.set('io', this.io);

    logger.info('WebSocket configured successfully');
  }

  /**
   * Start the optimized server
   */
  public async start(): Promise<void> {
    try {
      if (this.isInitialized) {
        logger.warn('Server already initialized');
        return;
      }

      logger.info('Starting FoodXchange optimized server...');

      // Initialize services
      await this.initializeServices();

      // Configure server components
      this.configureMiddleware();
      this.configureRoutes();
      this.configureWebSocket();

      // Setup graceful shutdown
      setupGracefulShutdown(this.httpServer);

      // Start listening
      this.httpServer.listen(this.port, this.host, () => {
        logger.info('='.repeat(80));
        logger.info('🚀 FoodXchange Backend Server Started Successfully!');
        logger.info('='.repeat(80));
        logger.info(`📍 Server URL: http://${this.host}:${this.port}`);
        logger.info(`🏥 Health Check: http://${this.host}:${this.port}/health`);
        logger.info(`📊 Monitoring: http://${this.host}:${this.port}/api/v1/monitoring`);
        logger.info(`🔌 WebSocket: ws://${this.host}:${this.port}`);
        logger.info(`🌍 Environment: ${configManager.get('NODE_ENV')}`);
        logger.info(`📘 TypeScript: Active & Optimized`);
        logger.info(`🔐 Security: Enhanced with Input Sanitization`);
        logger.info(`🚀 Performance: Multi-level Caching & Optimization`);
        logger.info(`🗄️ Database: Optimized with Indexing & Monitoring`);
        logger.info(`⚡ Features: Background Jobs, Health Checks, Graceful Shutdown`);
        logger.info('='.repeat(80));
        logger.info('✅ All optimizations active:');
        logger.info('   • HTTP Compression & Optimization');
        logger.info('   • Multi-level Caching (Redis + Memory)');
        logger.info('   • Database Performance Monitoring');
        logger.info('   • Advanced Input Sanitization');
        logger.info('   • Background Job Processing');
        logger.info('   • Comprehensive Health Checks');
        logger.info('   • Dependency Injection Container');
        logger.info('   • Graceful Shutdown Handling');
        logger.info('='.repeat(80));
      });

      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server gracefully
   */
  public async stop(): Promise<void> {
    logger.info('Stopping server...');
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    if (this.io) {
      this.io.close();
    }
    
    await healthCheckService.gracefulShutdown();
    logger.info('Server stopped successfully');
  }

  /**
   * Get server instance information
   */
  public getInfo(): {
    port: number;
    host: string;
    isInitialized: boolean;
    environment: string;
    features: Record<string, boolean>;
  } {
    return {
      port: this.port,
      host: this.host,
      isInitialized: this.isInitialized,
      environment: configManager.get('NODE_ENV'),
      features: configManager.getConfigSummary().features
    };
  }
}

// Create and export server instance
export const server = new OptimizedServer();

// Auto-start server if this is the main module
if (require.main === module) {
  server.start().catch((error) => {
    logger.error('Fatal error starting server:', error);
    process.exit(1);
  });
}

export default server;