// Custom error classes for the application

export class BaseError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, isOperational = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, 400, true, code);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', code = 'AUTHENTICATION_ERROR') {
    super(message, 401, true, code);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string = 'Access denied', code = 'AUTHORIZATION_ERROR') {
    super(message, 403, true, code);
  }
}

export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, true, code);
  }
}

export class ConflictError extends BaseError {
  constructor(message: string = 'Resource conflict', code = 'CONFLICT_ERROR') {
    super(message, 409, true, code);
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string = 'Too many requests', code = 'RATE_LIMIT_ERROR') {
    super(message, 429, true, code);
  }
}

export class ServerError extends BaseError {
  constructor(message: string = 'Internal server error', code = 'SERVER_ERROR') {
    super(message, 500, false, code);
  }
}

export class BadRequestError extends BaseError {
  constructor(message: string = 'Bad request', code = 'BAD_REQUEST') {
    super(message, 400, true, code);
  }
}

export class UnprocessableEntityError extends BaseError {
  constructor(message: string = 'Unprocessable entity', code = 'UNPROCESSABLE_ENTITY') {
    super(message, 422, true, code);
  }
}

export class ServiceUnavailableError extends BaseError {
  constructor(message: string = 'Service unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, true, code);
  }
}

// Error handler utility
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
};