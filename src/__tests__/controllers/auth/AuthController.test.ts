import { Request, Response } from 'express';
import { AuthController } from '../../../controllers/auth/AuthController';
import { User } from '../../../models/User';
import { Company } from '../../../models/Company';
import { 
  AuthenticationError, 
  ConflictError, 
  ValidationError 
} from '../../../core/errors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../models/User');
jest.mock('../../../models/Company');
jest.mock('../../../services/analytics/AnalyticsService');
jest.mock('../../../services/email/EmailService');
jest.mock('../../../core/logging/logger');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    authController = new AuthController();
    mockRequest = {
      validatedData: {},
      ip: '127.0.0.1',
      user: undefined
    };
    mockResponse = {
      success: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    beforeEach(() => {
      mockRequest.validatedData = {
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      };
    });

    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
        firstName: 'John',
        lastName: 'Doe',
        role: 'buyer',
        accountStatus: 'active',
        companyVerified: true,
        onboardingStep: 'completed',
        isEmailVerified: true,
        company: {
          _id: 'company123',
          name: 'Test Company',
          verificationStatus: 'verified'
        }
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('mock-token');
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUser);

      await authController.login(mockRequest as Request, mockResponse as Response);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(mockResponse.success).toHaveBeenCalledWith({
        accessToken: 'mock-token',
        refreshToken: 'mock-token',
        user: expect.objectContaining({
          id: 'user123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'buyer'
        }),
        expiresIn: '24h'
      });
    });

    it('should throw AuthenticationError for non-existent user', async () => {
      (User.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        authController.login(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
      
      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('should throw AuthenticationError for locked account', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        accountStatus: 'locked'
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        authController.login(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for invalid password', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        password: 'hashedPassword',
        accountStatus: 'active'
      };

      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        authController.login(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('signup', () => {
    beforeEach(() => {
      mockRequest.validatedData = {
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'buyer',
        company: 'New Company',
        businessType: 'restaurant',
        acceptTerms: true
      };
    });

    it('should register new user successfully', async () => {
      const mockCompany = {
        _id: 'company123',
        name: 'New Company',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockUser = {
        _id: 'user123',
        email: 'newuser@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'buyer',
        onboardingStep: 'email-verification',
        isEmailVerified: false,
        save: jest.fn().mockResolvedValue(true)
      };

      (User.findOne as jest.Mock).mockResolvedValue(null); // User doesn't exist
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      (Company.findOne as jest.Mock).mockResolvedValue(null); // Company doesn't exist
      (Company as any).mockImplementation(() => mockCompany);
      (User as any).mockImplementation(() => mockUser);
      (Company.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockCompany);
      (jwt.sign as jest.Mock).mockReturnValue('verification-token');

      await authController.signup(mockRequest as Request, mockResponse as Response);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'newuser@example.com' });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'User registered successfully. Please check your email for verification.',
        user: expect.objectContaining({
          id: 'user123',
          email: 'newuser@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          role: 'buyer'
        })
      });
    });

    it('should throw ConflictError for existing user', async () => {
      const existingUser = {
        _id: 'user123',
        email: 'newuser@example.com'
      };

      (User.findOne as jest.Mock).mockResolvedValue(existingUser);

      await expect(
        authController.signup(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('refreshToken', () => {
    beforeEach(() => {
      mockRequest.body = {
        refreshToken: 'valid-refresh-token'
      };
    });

    it('should refresh token successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        role: 'buyer',
        refreshToken: 'valid-refresh-token'
      };

      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user123' });
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (jwt.sign as jest.Mock).mockReturnValue('new-access-token');

      await authController.refreshToken(mockRequest as Request, mockResponse as Response);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        process.env.JWT_REFRESH_SECRET || 'refresh-secret'
      );
      expect(User.findOne).toHaveBeenCalledWith({
        _id: 'user123',
        refreshToken: 'valid-refresh-token'
      });
      expect(mockResponse.success).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        expiresIn: '24h'
      });
    });

    it('should throw AuthenticationError for missing refresh token', async () => {
      mockRequest.body = {};

      await expect(
        authController.refreshToken(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for invalid refresh token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        authController.refreshToken(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockRequest.user = { id: 'user123' };

      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await authController.logout(mockRequest as Request, mockResponse as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        refreshToken: null
      });
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });

    it('should handle logout without user', async () => {
      mockRequest.user = undefined;

      await authController.logout(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Logout successful'
      });
    });
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      mockRequest.body = {
        token: 'valid-verification-token'
      };
    });

    it('should verify email successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isEmailVerified: false
      };

      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user123' });
      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await authController.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(jwt.verify).toHaveBeenCalledWith(
        'valid-verification-token',
        process.env.JWT_SECRET || 'secret'
      );
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        isEmailVerified: true,
        onboardingStep: 'company-details',
        emailVerifiedAt: expect.any(Date)
      });
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Email verified successfully'
      });
    });

    it('should handle already verified email', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        isEmailVerified: true
      };

      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user123' });
      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await authController.verifyEmail(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Email already verified'
      });
    });

    it('should throw ValidationError for invalid token', async () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        authController.verifyEmail(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });
});