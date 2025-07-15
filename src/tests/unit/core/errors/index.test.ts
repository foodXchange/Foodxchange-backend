import {
  BaseError,
  ApiError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ErrorCode,
  createValidationError,
  createNotFoundError,
  createAuthError,
} from '../../../../core/errors';

describe('Error System', () => {
  describe('BaseError', () => {
    it('should create base error with correct properties', () => {
      const error = new ApiError(
        'Test error',
        400,
        ErrorCode.VALIDATION_FAILED,
        { userId: '123' }
      );

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ userId: '123' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to JSON correctly', () => {
      const error = new ApiError('Test error', 500, ErrorCode.INTERNAL_SERVER_ERROR);
      const json = error.toJSON();

      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('statusCode');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('stack');
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with defaults', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Token expired');

      expect(error.message).toBe('Token expired');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with validation details', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password too short' },
      ];

      const error = new ValidationError('Validation failed', validationErrors);

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should serialize validation errors correctly', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid email format' },
      ];

      const error = new ValidationError('Validation failed', validationErrors);
      const json = error.toJSON();

      expect(json.validationErrors).toEqual(validationErrors);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error for resource', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
    });

    it('should create not found error with identifier', () => {
      const error = new NotFoundError('User', '123');

      expect(error.message).toBe('User with identifier \\'123\\' not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('Error Factory Functions', () => {
    it('should create validation error using factory', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Password required' },
      ];

      const error = createValidationError(errors);

      expect(error.message).toBe('Validation failed: email, password');
      expect(error.validationErrors).toEqual(errors);
    });

    it('should create not found error using factory', () => {
      const error = createNotFoundError('Product', 'ABC123');

      expect(error.message).toBe('Product with identifier \\'ABC123\\' not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create auth error using factory', () => {
      const error = createAuthError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
    });
  });
});