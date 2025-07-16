import winston from 'winston';
import 'winston-daily-rotate-file';
import { config } from '../config';

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'cyan',
  trace: 'magenta'
};

winston.addColors(colors);

// Create custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const contextStr = context ? `[${context}]` : '';
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} ${level} ${contextStr}: ${message} ${metaStr}`;
  })
);

class ProductionLogger {
  private logger: winston.Logger;
  private requestId?: string;

  constructor() {
    this.logger = winston.createLogger({
      level: config.logging.level,
      levels,
      format: logFormat,
      defaultMeta: { service: 'expert-marketplace' },
      transports: this.createTransports(),
      exitOnError: false
    });

    // Handle uncaught exceptions and unhandled rejections
    this.logger.exceptions.handle(
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    );

    this.logger.rejections.handle(
      new winston.transports.File({ filename: 'logs/rejections.log' })
    );
  }

  private createTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport for development
    if (config.env !== 'production') {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: 'debug'
        })
      );
    }

    // File transports for production
    if (config.env === 'production') {
      // Error logs
      transports.push(
        new winston.transports.DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d',
          zippedArchive: true
        })
      );

      // Combined logs
      transports.push(
        new winston.transports.DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          zippedArchive: true
        })
      );

      // Audit logs for security events
      transports.push(
        new winston.transports.DailyRotateFile({
          filename: 'logs/audit-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '90d',
          zippedArchive: true,
          level: 'info'
        })
      );
    }

    return transports;
  }

  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  private addRequestId(meta: any): any {
    if (this.requestId) {
      return { ...meta, requestId: this.requestId };
    }
    return meta;
  }

  error(message: string, meta: any = {}, context?: string): void {
    this.logger.error(message, this.addRequestId({ ...meta, context }));
  }

  warn(message: string, meta: any = {}, context?: string): void {
    this.logger.warn(message, this.addRequestId({ ...meta, context }));
  }

  info(message: string, meta: any = {}, context?: string): void {
    this.logger.info(message, this.addRequestId({ ...meta, context }));
  }

  debug(message: string, meta: any = {}, context?: string): void {
    this.logger.debug(message, this.addRequestId({ ...meta, context }));
  }

  trace(message: string, meta: any = {}, context?: string): void {
    this.logger.log('trace', message, this.addRequestId({ ...meta, context }));
  }

  // Security audit logging
  audit(event: string, meta: any = {}, context?: string): void {
    this.logger.info(`AUDIT: ${event}`, this.addRequestId({ 
      ...meta, 
      context, 
      auditEvent: true,
      timestamp: new Date().toISOString()
    }));
  }

  // Performance logging
  performance(operation: string, duration: number, meta: any = {}, context?: string): void {
    this.logger.info(`PERFORMANCE: ${operation}`, this.addRequestId({
      ...meta,
      context,
      performance: true,
      duration,
      timestamp: new Date().toISOString()
    }));
  }

  // Business logic logging
  business(event: string, meta: any = {}, context?: string): void {
    this.logger.info(`BUSINESS: ${event}`, this.addRequestId({
      ...meta,
      context,
      businessEvent: true,
      timestamp: new Date().toISOString()
    }));
  }

  // Create child logger with context
  child(context: string): ProductionLogger {
    const childLogger = new ProductionLogger();
    childLogger.logger = this.logger.child({ context });
    return childLogger;
  }
}

export const productionLogger = new ProductionLogger();
export { ProductionLogger };