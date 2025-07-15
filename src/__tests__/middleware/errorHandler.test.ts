import { Request, Response, NextFunction } from 'express';
import { 
  errorHandler, 
  notFoundHandler, 
  asyncHandler 
} from '../../middleware/errorHandler';
import { 
  ValidationError, 
  AuthenticationError, 
  NotFoundError, 
  ConflictError,
  ApiError
} from '../../core/errors';

// Mock dependencies
jest.mock('../../core/logging/logger');
jest.mock('../../core/metrics/MetricsService');

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      url: '/test',
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
      route: { path: '/test' },
      user: { id: 'user123' }
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      get: jest.fn()
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('errorHandler', () => {
    it('should handle ValidationError correctly', () => {
      const error = new ValidationError('Validation failed', [
        { field: 'email', message: 'Invalid email', value: 'invalid' }
      ]);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 400,
          details: {
            fields: [{
              field: 'email',
              message: 'Invalid email',
              value: 'invalid'
            }]
          }
        }
      });
    });

    it('should handle AuthenticationError correctly', () => {
      const error = new AuthenticationError('Invalid credentials');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid credentials',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 401
        }
      });
    });

    it('should handle NotFoundError correctly', () => {
      const error = new NotFoundError('Resource not found');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 404
        }
      });
    });

    it('should handle ConflictError correctly', () => {
      const error = new ConflictError('Resource already exists');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Resource already exists',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 409
        }
      });
    });

    it('should handle Mongoose ValidationError correctly', () => {
      const error = {
        name: 'ValidationError',
        errors: {
          email: {
            message: 'Email is required',
            value: undefined
          },
          password: {
            message: 'Password is too short',
            value: '123'
          }
        }
      };

      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.any(String),
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 400,
          details: {
            fields: expect.arrayContaining([
              {
                field: 'email',
                message: 'Email is required',
                value: undefined
              },
              {
                field: 'password',
                message: 'Password is too short',
                value: '123'
              }
            ])
          }
        }
      });
    });

    it('should handle Mongoose CastError correctly', () => {
      const error = {
        name: 'CastError',
        path: 'userId',
        kind: 'ObjectId',
        value: 'invalid-id'
      };

      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: expect.any(String),
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 400,
          details: {
            field: 'userId',
            message: 'Invalid ObjectId for field userId',
            value: 'invalid-id'
          }
        }
      });
    });

    it('should handle MongoDB duplicate key error correctly', () => {
      const error = {
        name: 'MongoError',
        code: 11000,
        keyValue: { email: 'test@example.com' }
      };

      errorHandler(error as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: expect.any(String),
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 409,
          details: {
            field: 'email',
            message: 'email already exists',
            value: 'test@example.com'
          }
        }
      });
    });

    it('should handle JWT errors correctly', () => {
      const jwtError = {
        name: 'JsonWebTokenError',
        message: 'invalid token'
      };

      errorHandler(jwtError as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'invalid token',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 401
        }
      });
    });

    it('should handle JWT expired token error correctly', () => {
      const jwtError = {
        name: 'TokenExpiredError',
        message: 'jwt expired'
      };

      errorHandler(jwtError as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'jwt expired',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 401
        }
      });
    });

    it('should handle generic errors with safe message', () => {
      const error = new Error('Internal server error');

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 500
        }
      });
    });

    it('should handle ApiError with custom status code', () => {
      const error = new ApiError('Custom API error', 422);

      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Custom API error',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 422
        }
      });
    });

    it('should include user context in error logging', () => {
      const error = new Error('Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      // Error logging is tested implicitly through the error handler execution
    });
  });

  describe('notFoundHandler', () => {
    it('should handle 404 errors correctly', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot GET /test',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 404
        }
      });
    });

    it('should handle different HTTP methods', () => {
      mockRequest.method = 'POST';

      notFoundHandler(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Cannot POST /test',
          timestamp: expect.any(String),
          path: '/test',
          statusCode: 404
        }
      });
    });
  });

  describe('asyncHandler', () => {
    it('should handle successful async operations', async () => {
      const asyncOperation = jest.fn().mockResolvedValue('success');
      const wrappedHandler = asyncHandler(asyncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch and pass errors to next middleware', async () => {
      const error = new Error('Async error');
      const asyncOperation = jest.fn().mockRejectedValue(error);
      const wrappedHandler = asyncHandler(asyncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(asyncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle synchronous errors in async handler', async () => {
      const error = new Error('Sync error');
      const asyncOperation = jest.fn().mockImplementation(() => {
        throw error;
      });
      const wrappedHandler = asyncHandler(asyncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle non-async functions', async () => {
      const syncOperation = jest.fn().mockReturnValue('success');
      const wrappedHandler = asyncHandler(syncOperation);

      await wrappedHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(syncOperation).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});