import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import mongoose from 'mongoose';

import {
  ValidationError,
  NotFoundError,
  AuthenticationError
} from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { AnalyticsService } from '../../services/analytics/AnalyticsService';

export class UserController {
  private readonly logger: Logger;
  private readonly analyticsService: AnalyticsService;

  constructor() {
    this.logger = new Logger('UserController');
    this.analyticsService = new AnalyticsService();
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const user = await User.findById(userId).populate('company');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.success({
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
          bio: user.bio,
          isEmailVerified: user.isEmailVerified,
          companyVerified: user.companyVerified,
          onboardingStep: user.onboardingStep,
          profileCompletionPercentage: user.profileCompletionPercentage,
          preferences: user.preferences,
          company: user.company ? {
            id: (user.company as any)._id?.toString(),
            name: (user.company as any).name,
            size: (user.company as any).size,
            industry: (user.company as any).industry,
            businessType: (user.company as any).type,
            website: (user.company as any).contact?.website,
            verificationStatus: (user.company as any).subscriptionStatus
          } : null,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });

    } catch (error) {
      this.logger.error('Get profile error:', error);
      throw error;
    }
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { firstName, lastName, phone, bio, avatar, website } = req.validatedData;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Update user fields
      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (phone) updateData.phone = phone;
      if (bio) updateData.bio = bio;
      if (avatar) updateData.avatar = avatar;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).populate('company');

      // Track profile update
      await this.analyticsService.trackEvent({
        eventType: 'profile_updated',
        category: 'user',
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          updatedFields: Object.keys(updateData)
        },
        ipAddress: req.ip
      });

      res.success({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser._id.toString(),
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          bio: updatedUser.bio,
          avatar: updatedUser.avatar,
          profileCompletionPercentage: updatedUser.profileCompletionPercentage,
          onboardingStep: updatedUser.onboardingStep
        }
      });

    } catch (error) {
      this.logger.error('Update profile error:', error);
      throw error;
    }
  }

  async getProfileCompletion(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const user = await User.findById(userId).populate('company');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Calculate missing fields for profile completion
      const missingFields: string[] = [];
      const requiredFields = [
        { field: 'firstName', label: 'First Name' },
        { field: 'lastName', label: 'Last Name' },
        { field: 'phone', label: 'Phone Number' },
        { field: 'bio', label: 'Bio' },
        { field: 'avatar', label: 'Profile Picture' },
        { field: 'isEmailVerified', label: 'Email Verification' },
        { field: 'company', label: 'Company Information' },
        { field: 'companyVerified', label: 'Company Verification' }
      ];

      requiredFields.forEach(({ field, label }) => {
        if (!user[field as keyof typeof user]) {
          missingFields.push(label);
        }
      });

      // Additional company-specific missing fields
      if (user.company) {
        const company = user.company as any;
        const companyRequiredFields = [
          { field: 'size', label: 'Company Size' },
          { field: 'industry', label: 'Industry' },
          { field: 'businessType', label: 'Business Type' }
        ];

        companyRequiredFields.forEach(({ field, label }) => {
          if (!company[field]) {
            missingFields.push(label);
          }
        });
      }

      // Get next onboarding step
      const nextStep = user.getNextOnboardingStep();

      res.success({
        completionPercentage: user.profileCompletionPercentage,
        missingFields,
        nextStep,
        onboardingStep: user.onboardingStep,
        recommendations: this.getProfileRecommendations(user, missingFields)
      });

    } catch (error) {
      this.logger.error('Get profile completion error:', error);
      throw error;
    }
  }

  async updateCompany(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const {
        companyName,
        companySize,
        industry,
        businessType,
        website,
        description,
        address
      } = req.validatedData;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      let company;

      if (user.company) {
        // Update existing company
        company = await Company.findByIdAndUpdate(
          user.company,
          {
            name: companyName,
            size: companySize,
            industry,
            businessType,
            website,
            description,
            address
          },
          { new: true, runValidators: true }
        );
      } else {
        // Create new company
        company = new Company({
          name: companyName,
          size: companySize,
          industry,
          businessType,
          website,
          description,
          address,
          verificationStatus: 'pending',
          createdBy: userId
        });
        await company.save();

        // Link company to user
        await User.findByIdAndUpdate(userId, {
          company: company._id,
          onboardingStep: 'profile-completion'
        });
      }

      // Track company update
      await this.analyticsService.trackEvent({
        eventType: 'company_updated',
        category: 'user',
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          companyId: company._id.toString(),
          companyName,
          companySize,
          industry,
          businessType
        },
        ipAddress: req.ip
      });

      res.success({
        message: 'Company details updated successfully',
        company: {
          id: company._id.toString(),
          name: company.name,
          size: company.size,
          industry: company.industry,
          businessType: company.businessType,
          website: company.website,
          description: company.description,
          address: company.address,
          verificationStatus: company.verificationStatus
        }
      });

    } catch (error) {
      this.logger.error('Update company error:', error);
      throw error;
    }
  }

  async getCompany(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const user = await User.findById(userId).populate('company');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.company) {
        throw new NotFoundError('Company not found');
      }

      const company = user.company as any;

      res.success({
        company: {
          id: company._id.toString(),
          name: company.name,
          size: company.size,
          industry: company.industry,
          businessType: company.businessType,
          website: company.website,
          description: company.description,
          address: company.address,
          verificationStatus: company.verificationStatus,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt
        }
      });

    } catch (error) {
      this.logger.error('Get company error:', error);
      throw error;
    }
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.validatedData;

      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password
      await User.findByIdAndUpdate(userId, {
        password: hashedNewPassword,
        failedLoginAttempts: 0 // Reset failed attempts
      });

      // Track password change
      await this.analyticsService.trackEvent({
        eventType: 'password_changed',
        category: 'user',
        userId: new mongoose.Types.ObjectId(userId),
        data: {},
        ipAddress: req.ip
      });

      res.success({ message: 'Password changed successfully' });

    } catch (error) {
      this.logger.error('Change password error:', error);
      throw error;
    }
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { type } = req.body;

      // Note: File upload logic would be implemented here
      // For now, we'll simulate with a placeholder URL
      const documentUrl = `https://storage.foodxchange.com/documents/${userId}/${type}-${Date.now()}.pdf`;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Add document to user's verification documents
      user.verificationDocuments.push({
        type,
        url: documentUrl,
        uploadedAt: new Date(),
        verified: false
      });

      await user.save();

      // Track document upload
      await this.analyticsService.trackEvent({
        eventType: 'document_uploaded',
        category: 'user',
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          documentType: type
        },
        ipAddress: req.ip
      });

      res.status(201).success({
        message: 'Document uploaded successfully',
        document: {
          type,
          url: documentUrl,
          uploadedAt: new Date(),
          verified: false
        }
      });

    } catch (error) {
      this.logger.error('Upload document error:', error);
      throw error;
    }
  }

  async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.success({
        documents: user.verificationDocuments
      });

    } catch (error) {
      this.logger.error('Get documents error:', error);
      throw error;
    }
  }

  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { notifications, language, timezone } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Update preferences
      const updateData: any = {};
      if (notifications) updateData['preferences.notifications'] = notifications;
      if (language) updateData['preferences.language'] = language;
      if (timezone) updateData['preferences.timezone'] = timezone;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      );

      // Track preferences update
      await this.analyticsService.trackEvent({
        eventType: 'preferences_updated',
        category: 'user',
        userId: new mongoose.Types.ObjectId(userId),
        data: {
          updatedPreferences: Object.keys(req.body)
        },
        ipAddress: req.ip
      });

      res.success({
        message: 'Preferences updated successfully',
        preferences: updatedUser.preferences
      });

    } catch (error) {
      this.logger.error('Update preferences error:', error);
      throw error;
    }
  }

  private getProfileRecommendations(user: any, missingFields: string[]): string[] {
    const recommendations: string[] = [];

    if (missingFields.includes('Email Verification')) {
      recommendations.push('Verify your email address to unlock full platform features');
    }

    if (missingFields.includes('Company Information')) {
      recommendations.push('Add your company details to build trust with partners');
    }

    if (missingFields.includes('Profile Picture')) {
      recommendations.push('Upload a professional photo to personalize your profile');
    }

    if (missingFields.includes('Phone Number')) {
      recommendations.push('Add your phone number for better communication');
    }

    if (missingFields.includes('Bio')) {
      recommendations.push('Write a brief bio to introduce yourself to the community');
    }

    return recommendations;
  }
}
