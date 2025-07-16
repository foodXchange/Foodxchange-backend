import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { securityHeaders } from './middleware/security.middleware';
import { Logger } from './utils/logger';

const logger = new Logger('App');

export const createApp = async (): Promise<Application> => {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: config.env === 'production' ? undefined : false,
  }));
  
  // Additional security headers
  app.use(securityHeaders);

  // CORS configuration
  app.use(cors({
    origin: config.env === 'production' 
      ? [config.services.frontendUrl, config.services.mainBackendUrl]
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression middleware
  app.use(compression());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'expert-marketplace',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness check endpoint
  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      // TODO: Add database and redis connectivity checks
      res.status(200).json({
        status: 'ready',
        service: 'expert-marketplace',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        service: 'expert-marketplace',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // API routes
  app.use('/api/v1/auth', (await import('./routes/auth.routes')).default);
  app.use('/api/v1/experts', (await import('./routes/expert.routes')).default);
  app.use('/api/v1/search', (await import('./routes/search.routes')).default);
  app.use('/api/v1/agents', (await import('./modules/agent/routes/agent.routes')).default);
  // app.use('/api/v1/collaborations', collaborationRoutes);
  // app.use('/api/v1/payments', paymentRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  logger.info('App initialized successfully');

  return app;
};