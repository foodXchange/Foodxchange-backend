import { Request, Response, NextFunction } from 'express';
import { validate, enhancedValidate, rateLimiters, commonSchemas } from '../../middleware/validation';
import { ValidationError } from '../../core/errors';
import { z } from 'zod';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
      headers: {}
    };
    mockResponse = {};
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate function', () => {
    it('should validate request body successfully', async () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email()
      });

      mockRequest.body = {
        name: 'John Doe',
        email: 'john@example.com'
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body).toEqual({
        name: 'John Doe',
        email: 'john@example.com'
      });
    });

    it('should call next with ValidationError for invalid data', async () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email()
      });

      mockRequest.body = {
        name: '',
        email: 'invalid-email'
      };

      const middleware = validate({ body: schema });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = mockNext.mock.calls[0][0] as ValidationError;
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: expect.stringContaining('least 1')
          }),
          expect.objectContaining({
            field: 'email',
            message: 'Invalid email'
          })
        ])
      );
    });

    it('should validate query parameters', async () => {
      const schema = z.object({
        page: z.coerce.number().positive(),
        limit: z.coerce.number().positive().max(100)
      });

      mockRequest.query = {
        page: '2',
        limit: '50'
      };

      const middleware = validate({ query: schema });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.query).toEqual({
        page: 2,
        limit: 50
      });
    });

    it('should validate URL parameters', async () => {
      const schema = z.object({
        id: z.string().regex(/^[0-9a-fA-F]{24}$/)
      });

      mockRequest.params = {
        id: '507f1f77bcf86cd799439011'
      };

      const middleware = validate({ params: schema });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.params).toEqual({
        id: '507f1f77bcf86cd799439011'
      });
    });
  });

  describe('commonSchemas', () => {
    describe('email schema', () => {
      it('should validate correct email', () => {
        const result = commonSchemas.email.safeParse('test@example.com');
        expect(result.success).toBe(true);
        expect(result.data).toBe('test@example.com');
      });

      it('should reject invalid email', () => {
        const result = commonSchemas.email.safeParse('invalid-email');
        expect(result.success).toBe(false);
      });

      it('should convert email to lowercase', () => {
        const result = commonSchemas.email.safeParse('TEST@EXAMPLE.COM');
        expect(result.success).toBe(true);
        expect(result.data).toBe('test@example.com');
      });

      it('should reject temporary email domains', () => {
        const result = commonSchemas.email.safeParse('test@tempmail.com');
        expect(result.success).toBe(false);
      });
    });

    describe('password schema', () => {
      it('should validate strong password', () => {
        const result = commonSchemas.password.safeParse('StrongPass123!');
        expect(result.success).toBe(true);
      });

      it('should reject weak passwords', () => {
        const weakPasswords = [
          'short',
          'nouppercase123!',
          'NOLOWERCASE123!',
          'NoNumbers!',
          'NoSpecialChars123',
          'password123'
        ];

        weakPasswords.forEach(password => {
          const result = commonSchemas.password.safeParse(password);
          expect(result.success).toBe(false);
        });
      });

      it('should reject common passwords', () => {
        const commonPasswords = ['password', '123456', 'qwerty', 'abc123'];
        
        commonPasswords.forEach(password => {
          const result = commonSchemas.password.safeParse(password);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('phone schema', () => {
      it('should validate correct phone numbers', () => {
        const validPhones = ['+1234567890', '+441234567890', '1234567890'];
        
        validPhones.forEach(phone => {
          const result = commonSchemas.phone.safeParse(phone);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid phone numbers', () => {
        const invalidPhones = ['123', '+0123456789', 'abc123', ''];
        
        invalidPhones.forEach(phone => {
          const result = commonSchemas.phone.safeParse(phone);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('companyName schema', () => {
      it('should validate correct company names', () => {
        const validNames = ['Acme Corp', 'Tech Solutions LLC', 'Food & Beverage Co.'];
        
        validNames.forEach(name => {
          const result = commonSchemas.companyName.safeParse(name);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid company names', () => {
        const invalidNames = ['A', 'A'.repeat(101), 'Invalid<>Name'];
        
        invalidNames.forEach(name => {
          const result = commonSchemas.companyName.safeParse(name);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('companySize schema', () => {
      it('should validate correct company sizes', () => {
        const validSizes = ['1-10', '11-50', '50-200', '200+'];
        
        validSizes.forEach(size => {
          const result = commonSchemas.companySize.safeParse(size);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid company sizes', () => {
        const invalidSizes = ['1-5', '500+', 'small', ''];
        
        invalidSizes.forEach(size => {
          const result = commonSchemas.companySize.safeParse(size);
          expect(result.success).toBe(false);
        });
      });
    });

    describe('businessType schema', () => {
      it('should validate correct business types', () => {
        const validTypes = ['restaurant', 'distributor', 'manufacturer', 'retailer', 'other'];
        
        validTypes.forEach(type => {
          const result = commonSchemas.businessType.safeParse(type);
          expect(result.success).toBe(true);
        });
      });

      it('should reject invalid business types', () => {
        const invalidTypes = ['cafe', 'wholesale', 'unknown'];
        
        invalidTypes.forEach(type => {
          const result = commonSchemas.businessType.safeParse(type);
          expect(result.success).toBe(false);
        });
      });
    });
  });

  describe('enhancedValidate', () => {
    describe('userLogin', () => {
      it('should validate correct login data', async () => {
        mockRequest.body = {
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true
        };

        await enhancedValidate.userLogin(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequest.body).toEqual({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true
        });
      });

      it('should set default rememberMe to false', async () => {
        mockRequest.body = {
          email: 'test@example.com',
          password: 'password123'
        };

        await enhancedValidate.userLogin(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequest.body.rememberMe).toBe(false);
      });

      it('should reject invalid login data', async () => {
        mockRequest.body = {
          email: 'invalid-email',
          password: ''
        };

        await enhancedValidate.userLogin(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });

    describe('userRegister', () => {
      it('should validate correct registration data', async () => {
        mockRequest.body = {
          email: 'newuser@example.com',
          password: 'StrongPass123!',
          firstName: 'John',
          lastName: 'Doe',
          role: 'buyer',
          company: 'Test Company',
          businessType: 'restaurant',
          phone: '+1234567890',
          acceptTerms: true
        };

        // Mock User.findOne to return null (user doesn't exist)
        jest.doMock('../../models/User', () => ({
          User: {
            findOne: jest.fn().mockResolvedValue(null)
          }
        }));

        await enhancedValidate.userRegister(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });

      it('should reject registration without accepting terms', async () => {
        mockRequest.body = {
          email: 'newuser@example.com',
          password: 'StrongPass123!',
          firstName: 'John',
          lastName: 'Doe',
          role: 'buyer',
          company: 'Test Company',
          businessType: 'restaurant',
          acceptTerms: false
        };

        await enhancedValidate.userRegister(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });

      it('should reject invalid names with special characters', async () => {
        mockRequest.body = {
          email: 'newuser@example.com',
          password: 'StrongPass123!',
          firstName: 'John123',
          lastName: 'Doe$',
          role: 'buyer',
          company: 'Test Company',
          businessType: 'restaurant',
          acceptTerms: true
        };

        await enhancedValidate.userRegister(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });

    describe('userChangePassword', () => {
      it('should validate correct password change data', async () => {
        mockRequest.body = {
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!'
        };

        await enhancedValidate.userChangePassword(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });

      it('should reject mismatched password confirmation', async () => {
        mockRequest.body = {
          currentPassword: 'OldPass123!',
          newPassword: 'NewPass123!',
          confirmPassword: 'DifferentPass123!'
        };

        await enhancedValidate.userChangePassword(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });

      it('should reject same current and new password', async () => {
        mockRequest.body = {
          currentPassword: 'SamePass123!',
          newPassword: 'SamePass123!',
          confirmPassword: 'SamePass123!'
        };

        await enhancedValidate.userChangePassword(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });

    describe('companyUpdate', () => {
      it('should validate correct company update data', async () => {
        mockRequest.body = {
          companyName: 'Updated Company LLC',
          companySize: '50-200',
          industry: 'Food Manufacturing',
          businessType: 'manufacturer',
          website: 'https://example.com',
          description: 'A leading food manufacturer',
          address: {
            street: '123 Main St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'US'
          }
        };

        await enhancedValidate.companyUpdate(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });

      it('should reject invalid website URL', async () => {
        mockRequest.body = {
          companyName: 'Updated Company LLC',
          companySize: '50-200',
          industry: 'Food Manufacturing',
          businessType: 'manufacturer',
          website: 'not-a-url'
        };

        await enhancedValidate.companyUpdate(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });

      it('should reject description that is too long', async () => {
        mockRequest.body = {
          companyName: 'Updated Company LLC',
          companySize: '50-200',
          industry: 'Food Manufacturing',
          businessType: 'manufacturer',
          description: 'A'.repeat(1001) // Too long
        };

        await enhancedValidate.companyUpdate(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      });
    });
  });

  describe('rateLimiters', () => {
    it('should have auth rate limiter configured', () => {
      expect(rateLimiters.auth).toBeDefined();
      expect(typeof rateLimiters.auth).toBe('function');
    });

    it('should have general rate limiter configured', () => {
      expect(rateLimiters.general).toBeDefined();
      expect(typeof rateLimiters.general).toBe('function');
    });

    it('should have password reset rate limiter configured', () => {
      expect(rateLimiters.passwordReset).toBeDefined();
      expect(typeof rateLimiters.passwordReset).toBe('function');
    });
  });
});