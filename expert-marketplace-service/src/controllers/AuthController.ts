import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { Logger } from '../utils/logger';
import { asyncHandler } from '../middleware/asyncHandler';
import { 
  ValidationError, 
  AuthenticationError, 
  ConflictError 
} from '../utils/errors';
import { 
  ExpertRegistration, 
  LoginCredentials 
} from '../interfaces/auth.interface';

const logger = new Logger('AuthController');

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register new expert
   */
  registerExpert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const registrationData: ExpertRegistration = req.body;

    try {
      const result = await this.authService.registerExpert(registrationData);

      logger.info('Expert registration successful', {
        expertId: result.expert._id,
        email: result.expert.email
      });

      res.status(201).json({
        success: true,
        message: 'Expert registration successful. Please check your email for verification instructions.',
        data: {
          expert: {
            id: result.expert._id,
            firstName: result.expert.firstName,
            lastName: result.expert.lastName,
            email: result.expert.email,
            status: result.expert.status,
            verificationStatus: result.expert.verificationStatus
          },
          tokens: result.tokens
        }
      });
    } catch (error) {
      logger.error('Expert registration failed:', error);
      throw error;
    }
  });

  /**
   * Login expert
   */
  loginExpert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const credentials: LoginCredentials = req.body;
    const metadata = {
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    try {
      const result = await this.authService.loginExpert(credentials, metadata);

      if (result.requiresTwoFactor) {
        res.status(200).json({
          success: true,
          message: 'Two-factor authentication required',
          data: {
            requiresTwoFactor: true
          }
        });
        return;
      }

      logger.info('Expert login successful', {
        expertId: result.expert._id,
        email: result.expert.email
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          expert: {
            id: result.expert._id,
            firstName: result.expert.firstName,
            lastName: result.expert.lastName,
            email: result.expert.email,
            status: result.expert.status,
            verificationStatus: result.expert.verificationStatus,
            profilePhoto: result.expert.profilePhoto,
            rating: result.expert.rating
          },
          tokens: result.tokens
        }
      });
    } catch (error) {
      logger.error('Expert login failed:', error);
      throw error;
    }
  });

  /**
   * Refresh access token
   */
  refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    try {
      const tokens = await this.authService.refreshToken(refreshToken);

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: { tokens }
      });
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  });

  /**
   * Logout expert
   */
  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!accessToken || !refreshToken) {
      throw new ValidationError('Access token and refresh token required');
    }

    try {
      await this.authService.logout(accessToken, refreshToken);

      logger.info('Expert logout successful', {
        userId: req.user?.userId
      });

      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout failed:', error);
      // Don't throw error for logout - always return success
      res.status(200).json({
        success: true,
        message: 'Logout completed'
      });
    }
  });

  /**
   * Get current expert profile
   */
  getCurrentExpert = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    try {
      const { ExpertProfile } = await import('../models');
      const expert = await ExpertProfile.findById(req.user.expertId)
        .select('-documents.verified -__v');

      if (!expert) {
        throw new AuthenticationError('Expert profile not found');
      }

      res.status(200).json({
        success: true,
        data: { expert }
      });
    } catch (error) {
      logger.error('Get current expert failed:', error);
      throw error;
    }
  });

  /**
   * Setup two-factor authentication
   */
  setupTwoFactor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    try {
      const setup = await this.authService.setupTwoFactor(req.user.expertId);

      res.status(200).json({
        success: true,
        message: 'Two-factor authentication setup initiated',
        data: {
          qrCode: setup.qrCode,
          backupCodes: setup.backupCodes
        }
      });
    } catch (error) {
      logger.error('Two-factor setup failed:', error);
      throw error;
    }
  });

  /**
   * Enable two-factor authentication
   */
  enableTwoFactor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { verificationCode } = req.body;
    if (!verificationCode) {
      throw new ValidationError('Verification code required');
    }

    try {
      const result = await this.authService.enableTwoFactor(
        req.user.expertId,
        verificationCode
      );

      logger.info('Two-factor authentication enabled', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Two-factor authentication enabled successfully',
        data: {
          backupCodes: result.backupCodes
        }
      });
    } catch (error) {
      logger.error('Two-factor enable failed:', error);
      throw error;
    }
  });

  /**
   * Disable two-factor authentication
   */
  disableTwoFactor = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { password } = req.body;
    if (!password) {
      throw new ValidationError('Password required');
    }

    try {
      await this.authService.disableTwoFactor(req.user.expertId, password);

      logger.info('Two-factor authentication disabled', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });
    } catch (error) {
      logger.error('Two-factor disable failed:', error);
      throw error;
    }
  });

  /**
   * Change password
   */
  changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password required');
    }

    try {
      await this.authService.changePassword(
        req.user.expertId,
        currentPassword,
        newPassword
      );

      logger.info('Password changed successfully', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. Please login again with your new password.'
      });
    } catch (error) {
      logger.error('Password change failed:', error);
      throw error;
    }
  });

  /**
   * Get security settings
   */
  getSecuritySettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    try {
      const { ExpertProfile } = await import('../models');
      const expert = await ExpertProfile.findById(req.user.expertId)
        .select('securitySettings');

      if (!expert) {
        throw new AuthenticationError('Expert profile not found');
      }

      const securitySettings = expert.securitySettings || {
        twoFactorEnabled: false,
        trustedDevices: [],
        loginAlerts: true,
        sessionTimeout: 60
      };

      res.status(200).json({
        success: true,
        data: { securitySettings }
      });
    } catch (error) {
      logger.error('Get security settings failed:', error);
      throw error;
    }
  });

  /**
   * Update security settings
   */
  updateSecuritySettings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const { loginAlerts, sessionTimeout } = req.body;

    try {
      const { ExpertProfile } = await import('../models');
      const expert = await ExpertProfile.findByIdAndUpdate(
        req.user.expertId,
        {
          $set: {
            'securitySettings.loginAlerts': loginAlerts,
            'securitySettings.sessionTimeout': sessionTimeout
          }
        },
        { new: true }
      ).select('securitySettings');

      if (!expert) {
        throw new AuthenticationError('Expert profile not found');
      }

      logger.info('Security settings updated', {
        expertId: req.user.expertId
      });

      res.status(200).json({
        success: true,
        message: 'Security settings updated successfully',
        data: { securitySettings: expert.securitySettings }
      });
    } catch (error) {
      logger.error('Update security settings failed:', error);
      throw error;
    }
  });

  /**
   * Get login history
   */
  getLoginHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.expertId) {
      throw new AuthenticationError('Expert authentication required');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    try {
      // This would fetch from a login history collection
      // For now, return mock data
      const loginHistory = [
        {
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: true,
          location: { country: 'US', city: 'New York' }
        }
      ];

      res.status(200).json({
        success: true,
        data: {
          loginHistory,
          pagination: {
            page,
            limit,
            total: 1,
            pages: 1
          }
        }
      });
    } catch (error) {
      logger.error('Get login history failed:', error);
      throw error;
    }
  });

  /**
   * Verify email (placeholder)
   */
  verifyEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    if (!token) {
      throw new ValidationError('Verification token required');
    }

    try {
      // Email verification logic would go here
      // For now, just return success

      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification failed:', error);
      throw error;
    }
  });

  /**
   * Request password reset (placeholder)
   */
  requestPasswordReset = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email required');
    }

    try {
      // Password reset logic would go here
      // For now, just return success

      res.status(200).json({
        success: true,
        message: 'Password reset instructions sent to your email'
      });
    } catch (error) {
      logger.error('Password reset request failed:', error);
      throw error;
    }
  });

  /**
   * Reset password (placeholder)
   */
  resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new ValidationError('Reset token and new password required');
    }

    try {
      // Password reset logic would go here
      // For now, just return success

      res.status(200).json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      logger.error('Password reset failed:', error);
      throw error;
    }
  });
}