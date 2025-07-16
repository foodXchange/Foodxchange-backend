import winston from 'winston';
import path from 'path';
import { config } from '../config';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }),
];

if (config.env !== 'test') {
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logging.filePath, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: config.logging.maxFiles,
    }),
    new winston.transports.File({
      filename: path.join(config.logging.filePath, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: config.logging.maxFiles,
    }),
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, { context: this.context, ...meta });
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    logger.error(message, { 
      context: this.context, 
      error: error instanceof Error ? error.stack : error,
      ...meta,
    });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, { context: this.context, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    logger.debug(message, { context: this.context, ...meta });
  }
}