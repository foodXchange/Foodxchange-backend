/**
 * Enterprise-grade Logging System
 * Supports multiple transports, structured logging, and correlation IDs
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.resolve(config.logging.dir);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, label, ...metadata }) => {
    let msg = `${timestamp} [${label || 'APP'}] ${level}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// JSON format for production
const jsonFormat = winston.format.combine(
  logFormat,
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (config.env !== 'production' || process.env.LOG_TO_CONSOLE === 'true') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        logFormat,
        consoleFormat
      ),
    })
  );
}

// File transports with rotation
transports.push(
  // Error logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: jsonFormat,
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
  }),
  
  // Combined logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: jsonFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Logger wrapper class for additional functionality
export class Logger {
  private context: string;
  private metadata: Record<string, any>;

  constructor(context: string, metadata?: Record<string, any>) {
    this.context = context;
    this.metadata = metadata || {};
  }

  // Create child logger with additional context
  child(context: string, metadata?: Record<string, any>): Logger {
    return new Logger(
      `${this.context}:${context}`,
      { ...this.metadata, ...metadata }
    );
  }

  // Add correlation ID to all logs
  withCorrelationId(correlationId: string): Logger {
    return new Logger(this.context, { ...this.metadata, correlationId });
  }

  // Add user context
  withUser(userId: string, userEmail?: string): Logger {
    return new Logger(this.context, {
      ...this.metadata,
      userId,
      userEmail,
    });
  }

  // Log methods
  error(message: string, error?: Error | any, metadata?: Record<string, any>): void {
    logger.error(message, {
      label: this.context,
      ...this.metadata,
      ...metadata,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    });
  }

  warn(message: string, metadata?: Record<string, any>): void {
    logger.warn(message, {
      label: this.context,
      ...this.metadata,
      ...metadata,
    });
  }

  info(message: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      label: this.context,
      ...this.metadata,
      ...metadata,
    });
  }

  debug(message: string, metadata?: Record<string, any>): void {
    logger.debug(message, {
      label: this.context,
      ...this.metadata,
      ...metadata,
    });
  }

  // Performance logging
  startTimer(): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info('Operation completed', { duration });
    };
  }

  // HTTP request logging
  logHttpRequest(req: any, res: any, responseTime: number): void {
    const metadata = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.id,
    };

    if (res.statusCode >= 500) {
      this.error('HTTP request failed', undefined, metadata);
    } else if (res.statusCode >= 400) {
      this.warn('HTTP request client error', metadata);
    } else {
      this.info('HTTP request completed', metadata);
    }
  }

  // Database query logging
  logQuery(operation: string, collection: string, duration: number, metadata?: Record<string, any>): void {
    this.debug('Database query', {
      operation,
      collection,
      duration,
      ...metadata,
    });
  }

  // External service call logging
  logExternalCall(service: string, operation: string, duration: number, success: boolean, metadata?: Record<string, any>): void {
    const level = success ? 'info' : 'error';
    logger[level]('External service call', {
      label: this.context,
      service,
      operation,
      duration,
      success,
      ...this.metadata,
      ...metadata,
    });
  }
}

// Create default logger
export const createLogger = (context: string, metadata?: Record<string, any>): Logger => {
  return new Logger(context, metadata);
};

// Express middleware for request logging
export const requestLogger = (req: any, res: any, next: any): void => {
  const startTime = Date.now();
  const logger = createLogger('HTTP').withCorrelationId(req.id || 'unknown');

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response
  const originalSend = res.send;
  res.send = function (data: any) {
    res.send = originalSend;
    const responseTime = Date.now() - startTime;
    logger.logHttpRequest(req, res, responseTime);
    return res.send(data);
  };

  next();
};

// Global error logging
export const logUnhandledErrors = (): void => {
  const logger = createLogger('SYSTEM');

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', error);
    // Give the logger time to write before exiting
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection', reason, { promise: promise.toString() });
  });

  process.on('warning', (warning: Error) => {
    logger.warn('Process Warning', { warning: warning.toString() });
  });
};

// Export default logger instance
export default createLogger('APP');