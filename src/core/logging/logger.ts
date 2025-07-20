import path from 'path';

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.context || 'App'}] [${info.level}]: ${info.message}${info.stack ? `\n${  info.stack}` : ''}`
  )
);

// Create daily rotate file transport
const fileRotateTransport = new DailyRotateFile({
  filename: path.join('logs', '%DATE%-combined.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format
});

// Create error file transport
const errorFileTransport = new DailyRotateFile({
  filename: path.join('logs', '%DATE%-error.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format
});

// Create console transport
const consoleTransport = new winston.transports.Console({
  format: consoleFormat
});

// Create the winston logger
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports: [
    fileRotateTransport,
    errorFileTransport,
    // Only log to console in development
    ...(process.env.NODE_ENV !== 'production' ? [consoleTransport] : [])
  ]
});

// Create custom logger class
export class Logger {
  private readonly context: string;
  private readonly metadata: Record<string, any>;

  constructor(context: string = 'App', metadata: Record<string, any> = {}) {
    this.context = context;
    this.metadata = metadata;
  }

  private log(level: string, message: string, meta?: any) {
    const logData = {
      context: this.context,
      ...this.metadata,
      ...(meta || {})
    };

    if (meta instanceof Error) {
      logData.error = {
        message: meta.message,
        stack: meta.stack,
        name: meta.name
      };
    }

    winstonLogger.log(level, message, { metadata: logData });
  }

  error(message: string, error?: Error | any) {
    this.log('error', message, error);
  }

  warn(message: string, meta?: any) {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: any) {
    this.log('info', message, meta);
  }

  http(message: string, meta?: any) {
    this.log('http', message, meta);
  }

  debug(message: string, meta?: any) {
    this.log('debug', message, meta);
  }

  // Create child logger with additional context
  child(context: string, metadata?: Record<string, any>): Logger {
    return new Logger(
      `${this.context}.${context}`,
      { ...this.metadata, ...(metadata || {}) }
    );
  }

  // Log performance metrics
  performance(operation: string, duration: number, meta?: any) {
    this.info(`Performance: ${operation} completed in ${duration}ms`, {
      operation,
      duration,
      ...meta
    });
  }

  // Log API requests
  request(req: any, res: any, duration: number) {
    const { method, url, ip, headers } = req;
    const { statusCode } = res;

    this.http(`${method} ${url} ${statusCode} - ${duration}ms`, {
      method,
      url,
      statusCode,
      duration,
      ip: ip || req.connection?.remoteAddress,
      userAgent: headers['user-agent'],
      userId: req.user?.id
    });
  }
}

// Export singleton logger instance
export const logger = new Logger();

// Export the winston logger for special cases
export const winstonInstance = winstonLogger;
