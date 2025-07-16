import { createApp } from './app';
import { config } from './config';
import { Logger } from './utils/logger';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { connectDatabase } from './database/connection';
import { RealTimeStatusService } from './services/RealTimeStatusService';
import { advancedCacheService } from './services/AdvancedCacheService';
import { notificationService } from './services/NotificationService';

const logger = new Logger('Server');

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    const app = await createApp();
    const httpServer = createServer(app);

    // Initialize Socket.io
    const io = new SocketServer(httpServer, {
      cors: {
        origin: config.env === 'production' 
          ? [config.services.frontendUrl]
          : true,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Initialize real-time services
    const realTimeService = new RealTimeStatusService(io);
    
    // Warm up cache
    await advancedCacheService.warmCache();
    
    // Initialize notification service with real-time support
    // const enhancedNotificationService = notificationService;

    // Graceful shutdown
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      // Close HTTP server
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      // Close Socket.io connections
      io.close(() => {
        logger.info('Socket.io server closed');
      });

      // Close database connections
      try {
        const mongoose = await import('mongoose');
        await mongoose.connection.close();
        logger.info('Database connection closed');
      } catch (error) {
        logger.error('Error closing database connection:', error);
      }

      // Close Redis connections
      try {
        await advancedCacheService.disconnect();
        logger.info('Advanced cache service disconnected');
      } catch (error) {
        logger.error('Error closing cache connections:', error);
      }

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, { reason });
      process.exit(1);
    });

    // Start server
    httpServer.listen(config.port, config.host, () => {
      logger.info(`Expert Marketplace service running on http://${config.host}:${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`WebSocket server is ready`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();