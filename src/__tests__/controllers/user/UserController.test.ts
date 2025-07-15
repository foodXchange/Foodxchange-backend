import { Request, Response } from 'express';
import { UserController } from '../../../controllers/user/UserController';
import { User } from '../../../models/User';
import { Company } from '../../../models/Company';
import { NotFoundError, AuthenticationError } from '../../../core/errors';
import bcrypt from 'bcryptjs';

// Mock dependencies
jest.mock('../../../models/User');
jest.mock('../../../models/Company');
jest.mock('../../../services/analytics/AnalyticsService');
jest.mock('../../../core/logging/logger');
jest.mock('bcryptjs');

describe('UserController', () => {
  let userController: UserController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    userController = new UserController();
    mockRequest = {
      user: { id: 'user123' },
      validatedData: {},
      ip: '127.0.0.1'
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

  describe('getProfile', () => {
    it('should return user profile successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        role: 'buyer',
        avatar: 'https://example.com/avatar.jpg',
        bio: 'Test bio',
        isEmailVerified: true,
        companyVerified: true,
        onboardingStep: 'completed',
        profileCompletionPercentage: 100,
        preferences: {
          notifications: { email: true, sms: false, push: true },
          language: 'en',
          timezone: 'UTC'
        },
        company: {
          _id: 'company123',
          name: 'Test Company',
          size: '50-200',
          industry: 'Food Import',
          businessType: 'restaurant',
          website: 'https://example.com',
          verificationStatus: 'verified'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (User.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.getProfile(mockRequest as Request, mockResponse as Response);

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(mockResponse.success).toHaveBeenCalledWith({
        user: expect.objectContaining({
          id: 'user123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'buyer'
        })
      });
    });

    it('should throw NotFoundError if user not found', async () => {
      (User.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await expect(
        userController.getProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      mockRequest.validatedData = {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1987654321',
        bio: 'Updated bio'
      };
    });

    it('should update profile successfully', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1987654321',
        bio: 'Updated bio',
        profileCompletionPercentage: 80,
        onboardingStep: 'profile-completion'
      };

      (User.findById as jest.Mock).mockResolvedValue({ _id: 'user123' });
      (User.findByIdAndUpdate as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.updateProfile(mockRequest as Request, mockResponse as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+1987654321',
          bio: 'Updated bio'
        },
        { new: true, runValidators: true }
      );
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Profile updated successfully',
        user: expect.objectContaining({
          id: 'user123',
          firstName: 'Jane',
          lastName: 'Smith'
        })
      });
    });

    it('should throw NotFoundError if user not found', async () => {
      (User.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        userController.updateProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getProfileCompletion', () => {
    it('should return profile completion data', async () => {
      const mockUser = {
        _id: 'user123',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        bio: 'Test bio',
        avatar: null,
        isEmailVerified: true,
        company: {
          _id: 'company123',
          size: '50-200',
          industry: 'Food Import',
          businessType: 'restaurant'
        },
        companyVerified: false,
        profileCompletionPercentage: 75,
        onboardingStep: 'profile-completion',
        getNextOnboardingStep: jest.fn().mockReturnValue('profile-completion')
      };

      (User.findById as jest.Mock).mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockUser)
      });

      await userController.getProfileCompletion(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.success).toHaveBeenCalledWith({
        completionPercentage: 75,
        missingFields: expect.arrayContaining(['Profile Picture', 'Company Verification']),
        nextStep: 'profile-completion',
        onboardingStep: 'profile-completion',
        recommendations: expect.any(Array)
      });
    });
  });

  describe('updateCompany', () => {
    beforeEach(() => {
      mockRequest.validatedData = {
        companyName: 'Updated Company',
        companySize: '50-200',
        industry: 'Food Import',
        businessType: 'restaurant',
        website: 'https://updated.com',
        description: 'Updated description'
      };
    });

    it('should update existing company successfully', async () => {
      const mockUser = {
        _id: 'user123',
        company: 'company123'
      };

      const mockCompany = {
        _id: 'company123',
        name: 'Updated Company',
        size: '50-200',
        industry: 'Food Import',
        businessType: 'restaurant',
        website: 'https://updated.com',
        description: 'Updated description',
        verificationStatus: 'pending'
      };

      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      (Company.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockCompany);

      await userController.updateCompany(mockRequest as Request, mockResponse as Response);

      expect(Company.findByIdAndUpdate).toHaveBeenCalledWith(
        'company123',
        expect.objectContaining({
          name: 'Updated Company',
          size: '50-200',
          industry: 'Food Import'
        }),
        { new: true, runValidators: true }
      );
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Company details updated successfully',
        company: expect.objectContaining({
          id: 'company123',
          name: 'Updated Company'
        })
      });
    });

    it('should create new company if user has none', async () => {
      const mockUser = {
        _id: 'user123',
        company: null
      };

      const mockCompany = {
        _id: 'company123',
        name: 'Updated Company',
        size: '50-200',
        industry: 'Food Import',
        businessType: 'restaurant',
        verificationStatus: 'pending',
        save: jest.fn().mockResolvedValue(true)
      };

      (User.findById as jest.Mock).mockResolvedValue(mockUser);
      (Company as any).mockImplementation(() => mockCompany);
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await userController.updateCompany(mockRequest as Request, mockResponse as Response);

      expect(mockCompany.save).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        company: 'company123',
        onboardingStep: 'profile-completion'
      });
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      mockRequest.validatedData = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };
    });

    it('should change password successfully', async () => {
      const mockUser = {
        _id: 'user123',
        password: 'hashedOldPassword'
      };

      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedNewPassword');
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

      await userController.changePassword(mockRequest as Request, mockResponse as Response);

      expect(bcrypt.compare).toHaveBeenCalledWith('oldpassword', 'hashedOldPassword');
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 12);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        password: 'hashedNewPassword',
        failedLoginAttempts: 0
      });
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Password changed successfully'
      });
    });

    it('should throw AuthenticationError for incorrect current password', async () => {
      const mockUser = {
        _id: 'user123',
        password: 'hashedOldPassword'
      };

      (User.findById as jest.Mock).mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        userController.changePassword(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('uploadDocument', () => {
    beforeEach(() => {
      mockRequest.body = {
        type: 'business_license'
      };
    });

    it('should upload document successfully', async () => {
      const mockUser = {
        _id: 'user123',
        verificationDocuments: [],
        save: jest.fn().mockResolvedValue(true)
      };

      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await userController.uploadDocument(mockRequest as Request, mockResponse as Response);

      expect(mockUser.verificationDocuments).toHaveLength(1);
      expect(mockUser.verificationDocuments[0]).toEqual({
        type: 'business_license',
        url: expect.stringContaining('business_license'),
        uploadedAt: expect.any(Date),
        verified: false
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Document uploaded successfully',
        document: expect.objectContaining({
          type: 'business_license',
          verified: false
        })
      });
    });
  });

  describe('getDocuments', () => {
    it('should return user documents', async () => {
      const mockUser = {
        _id: 'user123',
        verificationDocuments: [
          {
            type: 'business_license',
            url: 'https://example.com/doc1.pdf',
            uploadedAt: new Date(),
            verified: true
          },
          {
            type: 'tax_certificate',
            url: 'https://example.com/doc2.pdf',
            uploadedAt: new Date(),
            verified: false
          }
        ]
      };

      (User.findById as jest.Mock).mockResolvedValue(mockUser);

      await userController.getDocuments(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.success).toHaveBeenCalledWith({
        documents: expect.arrayContaining([
          expect.objectContaining({
            type: 'business_license',
            verified: true
          }),
          expect.objectContaining({
            type: 'tax_certificate',
            verified: false
          })
        ])
      });
    });
  });

  describe('updatePreferences', () => {
    beforeEach(() => {
      mockRequest.body = {
        notifications: {
          email: false,
          sms: true,
          push: false
        },
        language: 'es',
        timezone: 'America/New_York'
      };
    });

    it('should update preferences successfully', async () => {
      const mockUser = {
        _id: 'user123',
        preferences: {
          notifications: { email: false, sms: true, push: false },
          language: 'es',
          timezone: 'America/New_York'
        }
      };

      (User.findById as jest.Mock).mockResolvedValue({ _id: 'user123' });
      (User.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockUser);

      await userController.updatePreferences(mockRequest as Request, mockResponse as Response);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        {
          'preferences.notifications': {
            email: false,
            sms: true,
            push: false
          },
          'preferences.language': 'es',
          'preferences.timezone': 'America/New_York'
        },
        { new: true, runValidators: true }
      );
      expect(mockResponse.success).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: expect.objectContaining({
          language: 'es',
          timezone: 'America/New_York'
        })
      });
    });
  });
});