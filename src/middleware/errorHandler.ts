import { Request, Response, NextFunction } from 'express';

import {
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError
} from '../core/errors';
import { Logger } from '../core/logging/logger';
import { MetricsService } from '../core/monitoring/metrics';

const logger = new Logger('ErrorHandler');
const metricsService = new MetricsService();

// Error response format as per requirements
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    path: string;
    statusCode: number;
  };
}

// HTTP status code mapping
const getStatusCode = (error: Error): number => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof AuthorizationError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  if (error instanceof RateLimitError) return 429;
  if (error instanceof DatabaseError) return 500;
  if (error instanceof ExternalServiceError) return 502;
  if (error instanceof ApiError) return error.statusCode || 500;

  // Handle specific error types
  if (error.name === 'ValidationError') return 400;
  if (error.name === 'CastError') return 400;
  if (error.name === 'MongoError' && (error as any).code === 11000) return 409;
  if (error.name === 'JsonWebTokenError') return 401;
  if (error.name === 'TokenExpiredError') return 401;
  if (error.name === 'MulterError') return 400;

  return 500;
};

// Error code mapping
const getErrorCode = (error: Error): string => {
  if (error instanceof ValidationError) return 'VALIDATION_ERROR';
  if (error instanceof AuthenticationError) return 'AUTHENTICATION_ERROR';
  if (error instanceof AuthorizationError) return 'AUTHORIZATION_ERROR';
  if (error instanceof NotFoundError) return 'NOT_FOUND';
  if (error instanceof ConflictError) return 'CONFLICT';
  if (error instanceof RateLimitError) return 'RATE_LIMIT_EXCEEDED';
  if (error instanceof DatabaseError) return 'DATABASE_ERROR';
  if (error instanceof ExternalServiceError) return 'EXTERNAL_SERVICE_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') return 'VALIDATION_ERROR';
  if (error.name === 'CastError') return 'INVALID_INPUT';
  if (error.name === 'MongoError' && (error as any).code === 11000) return 'DUPLICATE_ENTRY';
  if (error.name === 'JsonWebTokenError') return 'INVALID_TOKEN';
  if (error.name === 'TokenExpiredError') return 'TOKEN_EXPIRED';
  if (error.name === 'MulterError') return 'FILE_UPLOAD_ERROR';

  return 'INTERNAL_SERVER_ERROR';
};

// Format validation errors
const formatValidationError = (error: any): any => {
  if (error instanceof ValidationError && (error as any).details) {
    return {
      fields: (error as any).details.map((detail: any) => ({
        field: detail.field,
        message: detail.message,
        value: detail.value
      }))
    };
  }

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError' && error.errors) {
    return {
      fields: Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message,
        value: error.errors[field].value
      }))
    };
  }

  // Handle Mongoose cast errors
  if (error.name === 'CastError') {
    return {
      field: error.path,
      message: `Invalid ${error.kind} for field ${error.path}`,
      value: error.value
    };
  }

  // Handle MongoDB duplicate key errors
  if (error.name === 'MongoError' && error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return {
      field,
      message: `${field} already exists`,
      value: error.keyValue[field]
    };
  }

  return undefined;
};

// Check if error should be exposed to client
const shouldExposeError = (error: Error): boolean => {
  // Always expose our custom API errors
  if (error instanceof ApiError) return true;

  // Expose validation errors
  if (error.name === 'ValidationError') return true;
  if (error.name === 'CastError') return true;
  if (error.name === 'MongoError' && (error as any).code === 11000) return true;
  if (error.name === 'JsonWebTokenError') return true;
  if (error.name === 'TokenExpiredError') return true;
  if (error.name === 'MulterError') return true;

  return false;
};

// Get safe error message for client
const getSafeErrorMessage = (error: Error): string => {
  if (shouldExposeError(error)) {
    return error.message;
  }

  // Generic message for unexpected errors
  return 'An unexpected error occurred. Please try again later.';
};

// Log error with appropriate level
const logError = (error: Error, req: Request): void => {
  const statusCode = getStatusCode(error);
  const errorCode = getErrorCode(error);

  const errorContext = {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    errorCode,
    statusCode,
    stack: error.stack
  };

  // Log based on severity
  if (statusCode >= 500) {
    logger.error('Server error:', error.message, errorContext);
  } else if (statusCode >= 400) {
    logger.warn('Client error:', error.message, errorContext);
  } else {
    logger.info('Request error:', error.message, errorContext);
  }

  // Track metrics
  metricsService.incrementCounter('api_errors_total', {
    method: req.method,
    path: req.route?.path || req.path,
    status_code: statusCode.toString(),
    error_code: errorCode
  });
};

// Main error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log the error
  logError(error, req);

  const statusCode = getStatusCode(error);
  const errorCode = getErrorCode(error);
  const message = getSafeErrorMessage(error);
  const details = formatValidationError(error);

  // Create standardized error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode,
      ...(details && { details })
    }
  };

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
      path: req.path,
      statusCode: 404
    }
  };

  // Log 404 errors
  logger.warn('404 Not Found:', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Track 404 metrics
  metricsService.incrementCounter('api_errors_total', {
    method: req.method,
    path: req.path,
    status_code: '404',
    error_code: 'NOT_FOUND'
  });

  res.status(404).json(errorResponse);
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Graceful shutdown handler
export const gracefulShutdown = (server: any): void => {
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
};
