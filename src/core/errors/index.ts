/**
 * Enterprise-grade Error Handling System
 * Provides typed errors, error codes, and consistent error responses
 */

import { Logger } from '../logging/logger';

const logger = new Logger('ErrorHandler');

// Error codes enum
export enum ErrorCode {
  // Authentication errors (1000-1099)
  INVALID_CREDENTIALS = 'AUTH_001',
  TOKEN_EXPIRED = 'AUTH_002',
  TOKEN_INVALID = 'AUTH_003',
  UNAUTHORIZED = 'AUTH_004',
  FORBIDDEN = 'AUTH_005',
  ACCOUNT_LOCKED = 'AUTH_006',
  ACCOUNT_NOT_VERIFIED = 'AUTH_007',
  
  // Validation errors (1100-1199)
  VALIDATION_FAILED = 'VAL_001',
  INVALID_INPUT = 'VAL_002',
  REQUIRED_FIELD_MISSING = 'VAL_003',
  INVALID_FORMAT = 'VAL_004',
  VALUE_OUT_OF_RANGE = 'VAL_005',
  
  // Business logic errors (1200-1299)
  RESOURCE_NOT_FOUND = 'BUS_001',
  DUPLICATE_RESOURCE = 'BUS_002',
  OPERATION_NOT_ALLOWED = 'BUS_003',
  INSUFFICIENT_INVENTORY = 'BUS_004',
  QUOTE_EXPIRED = 'BUS_005',
  ORDER_CANNOT_BE_MODIFIED = 'BUS_006',
  COMPLIANCE_VIOLATION = 'BUS_007',
  
  // External service errors (1300-1399)
  EXTERNAL_SERVICE_ERROR = 'EXT_001',
  AZURE_SERVICE_ERROR = 'EXT_002',
  EMAIL_SERVICE_ERROR = 'EXT_003',
  PAYMENT_SERVICE_ERROR = 'EXT_004',
  STORAGE_SERVICE_ERROR = 'EXT_005',
  
  // System errors (1400-1499)
  INTERNAL_SERVER_ERROR = 'SYS_001',
  DATABASE_ERROR = 'SYS_002',
  FILE_OPERATION_ERROR = 'SYS_003',
  CONFIGURATION_ERROR = 'SYS_004',
  RATE_LIMIT_EXCEEDED = 'SYS_005',
}

// Base error class
export abstract class BaseError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    isOperational = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

// Specific error classes
export class AuthenticationError extends BaseError {
  constructor(
    message = 'Authentication failed',
    code = ErrorCode.UNAUTHORIZED,
    context?: Record<string, any>
  ) {
    super(message, code, 401, true, context);
  }
}

export class AuthorizationError extends BaseError {
  constructor(
    message = 'Access forbidden',
    code = ErrorCode.FORBIDDEN,
    context?: Record<string, any>
  ) {
    super(message, code, 403, true, context);
  }
}

export class ValidationError extends BaseError {
  public readonly validationErrors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;

  constructor(
    message = 'Validation failed',
    validationErrors?: Array<{ field: string; message: string; value?: any }>,
    code = ErrorCode.VALIDATION_FAILED,
    context?: Record<string, any>
  ) {
    super(message, code, 400, true, context);
    this.validationErrors = validationErrors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

export class NotFoundError extends BaseError {
  constructor(
    resource: string,
    identifier?: string | number,
    context?: Record<string, any>
  ) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, ErrorCode.RESOURCE_NOT_FOUND, 404, true, context);
  }
}

export class ConflictError extends BaseError {
  constructor(
    message = 'Resource conflict',
    code = ErrorCode.DUPLICATE_RESOURCE,
    context?: Record<string, any>
  ) {
    super(message, code, 409, true, context);
  }
}

export class BusinessLogicError extends BaseError {
  constructor(
    message: string,
    code: ErrorCode,
    context?: Record<string, any>
  ) {
    super(message, code, 422, true, context);
  }
}

export class ExternalServiceError extends BaseError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    service: string,
    message: string,
    originalError?: Error,
    code = ErrorCode.EXTERNAL_SERVICE_ERROR,
    context?: Record<string, any>
  ) {
    super(
      `External service error (${service}): ${message}`,
      code,
      503,
      true,
      context
    );
    this.service = service;
    this.originalError = originalError;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      service: this.service,
      originalError: this.originalError?.message,
    };
  }
}

export class RateLimitError extends BaseError {
  public readonly retryAfter?: number;

  constructor(
    message = 'Rate limit exceeded',
    retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, true, context);
    this.retryAfter = retryAfter;
  }
}

export class SystemError extends BaseError {
  constructor(
    message = 'Internal server error',
    code = ErrorCode.INTERNAL_SERVER_ERROR,
    context?: Record<string, any>
  ) {
    super(message, code, 500, false, context);
  }
}

// Error handler middleware
export const errorHandler = (
  error: Error | BaseError,
  req: any,
  res: any,
  next: any
): void => {
  // Log the error
  const errorLogger = logger.withCorrelationId(req.id || 'unknown');
  
  if (error instanceof BaseError) {
    if (!error.isOperational) {
      errorLogger.error('Non-operational error occurred', error, {
        url: req.url,
        method: req.method,
        ip: req.ip,
      });
    } else {
      errorLogger.warn('Operational error occurred', {
        error: error.toJSON(),
        url: req.url,
        method: req.method,
      });
    }
  } else {
    // Unknown error
    errorLogger.error('Unknown error occurred', error, {
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
  }

  // Send error response
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof BaseError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error instanceof ValidationError && {
          validationErrors: error.validationErrors,
        }),
        ...(error instanceof RateLimitError && {
          retryAfter: error.retryAfter,
        }),
        ...(process.env.NODE_ENV === 'development' && {
          stack: error.stack,
          context: error.context,
        }),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Generic error response for unknown errors
    res.status(500).json({
      success: false,
      error: {
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        ...(process.env.NODE_ENV === 'development' && {
          details: error.message,
          stack: error.stack,
        }),
      },
      requestId: req.id,
      timestamp: new Date().toISOString(),
    });
  }
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Error factory functions
export const createValidationError = (
  errors: Array<{ field: string; message: string; value?: any }>
): ValidationError => {
  const message = `Validation failed: ${errors.map(e => e.field).join(', ')}`;
  return new ValidationError(message, errors);
};

export const createNotFoundError = (
  resource: string,
  identifier?: string | number
): NotFoundError => {
  return new NotFoundError(resource, identifier);
};

export const createAuthError = (
  message: string,
  code = ErrorCode.UNAUTHORIZED
): AuthenticationError => {
  return new AuthenticationError(message, code);
};