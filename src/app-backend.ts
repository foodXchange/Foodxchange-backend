/**
 * FoodXchange Backend Application Entry Point
 * Optimized for production deployment
 */

import { Logger } from './core/logging/logger';
import { server } from './server-optimized';

const logger = new Logger('App');

/**
 * Application bootstrapper
 */
async function bootstrap(): Promise<void> {
  try {
    logger.info('Bootstrapping FoodXchange application...');

    // Start the optimized server
    await server.start();

    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to bootstrap application:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the application
bootstrap();

export default server;
