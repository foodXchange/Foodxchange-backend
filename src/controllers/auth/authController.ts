import * as crypto from 'crypto';

import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  NotFoundError
} from '../../core/errors/index';
import { Logger } from '../../core/logging/logger';
import { Agent } from '../../models/Agent';
import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { AnalyticsService } from '../../services/analytics/AnalyticsService';
import { TwoFactorAuthService } from '../../services/auth/TwoFactorAuthService';
import { multiLevelCache } from '../../services/cache/MultiLevelCacheService';
import { EmailService } from '../../services/email/EmailService';


export class AuthController {
  private readonly logger: Logger;
  private readonly analyticsService: AnalyticsService;
  private readonly emailService: EmailService;
  private readonly twoFactorAuthService: TwoFactorAuthService;

  constructor() {
    this.logger = new Logger('AuthController');
    this.analyticsService = new AnalyticsService();
    this.emailService = new EmailService();
    this.twoFactorAuthService = new TwoFactorAuthService();
  }

  /**
   * Register new user
   */
  async register(req: Request, res: Response): Promise<void> {
    const {
      email,
      password,
      firstName,
      lastName,
      name, // For backward compatibility
      role,
      company: companyName,
      companyType,
      businessType,
      phone,
      country,
      companyDescription,
      acceptTerms,
      profile
    } = req.body;

    try {
      // Validate required fields
      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        await this.analyticsService.trackEvent({
          tenantId: req.tenantId || 'default',
          eventType: 'signup_failure',
          category: 'user',
          data: { email, reason: 'email_exists' },
          ipAddress: req.ip
        });

        throw new ConflictError('User already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create or find company if provided
      let companyId = null;
      if (companyName) {
        let company = await Company.findOne({ name: companyName });
        if (!company) {
          company = new Company({
            name: companyName,
            type: companyType || businessType || role,
            email,
            country: country || '',
            description: companyDescription || '',
            verificationStatus: 'pending'
          });
          await company.save();
        }
        companyId = company._id;
      }

      // Create user
      const user = new User({
        email,
        password: hashedPassword,
        firstName: firstName || profile?.firstName || name?.split(' ')[0] || '',
        lastName: lastName || profile?.lastName || name?.split(' ').slice(1).join(' ') || '',
        // name field will be accessed via virtual fullName property
        role: role || 'buyer',
        company: companyId,
        phone: phone || profile?.phone || '',
        companyVerified: false,
        onboardingStep: 'email-verification',
        isEmailVerified: false,
        accountStatus: 'active',
        acceptedTermsAt: acceptTerms ? new Date() : undefined,
        failedLoginAttempts: 0,
        loginCount: 0
        // isActive field removed - using accountStatus instead,
        // profile fields are stored directly on user, not in a profile object
      });

      await user.save();

      // Update company with creator info if created
      if (companyId) {
        await Company.findByIdAndUpdate(companyId, {
          createdBy: user._id
        });
      }

      // Create agent profile if role is agent
      if (role === 'agent') {
        const agent = new Agent({
          userId: user._id as mongoose.Types.ObjectId,
          personalInfo: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone || ''
          },
          status: 'pending',
          onboarding: {
            step: 'personal_info',
            startedAt: new Date()
          }
        });
        await agent.save();
      }

      // Generate email verification token
      const verificationToken = this.generateEmailVerificationToken(user);

      // Send verification email
      await this.emailService.sendVerificationEmail(email, verificationToken);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokenPair(user._id.toString());

      // Track successful signup
      await this.analyticsService.trackEvent({
        tenantId: companyId?.toString() || 'default',
        eventType: 'signup_success',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email, role: user.role, companyName },
        ipAddress: req.ip
      });

      res.status(201).json({
        success: true,
        message: 'User created successfully. Please check your email for verification.',
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.fullName,
            role: user.role,
            company: companyId,
            onboardingStep: user.onboardingStep,
            isEmailVerified: user.isEmailVerified
          },
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      this.logger.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(req: Request, res: Response): Promise<void> {
    const { email, password, rememberMe = false } = req.body;

    try {
      // Validate input
      if (!email || !password) {
        throw new ValidationError('Please provide email and password');
      }

      // Find user and populate company
      const user = await User.findOne({ email }).select('+password').populate('company');
      if (!user) {
        await this.analyticsService.trackEvent({
          tenantId: req.tenantId || 'default',
          eventType: 'login_failure',
          category: 'user',
          data: { email, reason: 'user_not_found' },
          ipAddress: req.ip
        });

        throw new AuthenticationError('Invalid credentials');
      }

      // Check if account is active
      if (user.accountStatus !== 'active' && user.accountStatus !== undefined) {
        throw new AuthenticationError('Account is deactivated. Please contact support.');
      }

      // Check if account is locked
      if (user.isAccountLocked?.() || user.accountStatus === 'locked') {
        const lockDuration = user.accountLockedAt ?
          new Date(user.accountLockedAt.getTime() + 30 * 60 * 1000) : null;

        if (lockDuration && lockDuration > new Date()) {
          await this.analyticsService.trackEvent({
            tenantId: req.tenantId || user.company?.toString() || 'default',
            eventType: 'login_failure',
            category: 'user',
            data: { email, reason: 'account_locked' },
            ipAddress: req.ip
          });

          throw new AuthenticationError('Account is locked due to multiple failed login attempts. Please try again later or contact support.');
        } else {
          // Unlock account if lock duration has passed
          await this.resetFailedLoginAttempts(user);
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        await this.incrementFailedLoginAttempts(user);

        await this.analyticsService.trackEvent({
          tenantId: req.tenantId || user.company?.toString() || 'default',
          eventType: 'login_failure',
          category: 'user',
          data: { email, reason: 'invalid_password' },
          ipAddress: req.ip
        });

        throw new AuthenticationError('Invalid credentials');
      }

      // Check if 2FA is enabled
      const is2FAEnabled = await this.twoFactorAuthService.is2FAEnabled(user._id.toString());
      if (is2FAEnabled) {
        // Generate 2FA challenge
        const challengeId = await this.twoFactorAuthService.sendEmailChallenge(
          user._id.toString(),
          user.email
        );

        res.json({
          success: true,
          data: {
            requiresTwoFactor: true,
            challengeId,
            message: 'Please check your email for the verification code'
          }
        });
        return;
      }

      // Reset failed login attempts on successful login
      await this.resetFailedLoginAttempts(user);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokenPair(user._id.toString(), rememberMe);

      // Update user login information
      // lastLogin field removed - using lastLoginAt instead
      user.lastLoginAt = new Date();
      await user.save();

      // Track successful login
      await this.analyticsService.trackEvent({
        tenantId: req.tenantId || user.company?.toString() || 'default',
        eventType: 'login_success',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email, role: user.role },
        ipAddress: req.ip
      });

      // Prepare response data
      const userData = {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.fullName,
        role: user.role,
        company: user.company,
        companyVerified: user.companyVerified,
        onboardingStep: user.onboardingStep,
        isEmailVerified: user.isEmailVerified,
        profileCompletionPercentage: user.profileCompletionPercentage
      };

      res.json({
        success: true,
        data: {
          user: userData,
          accessToken,
          refreshToken,
          expiresIn: rememberMe ? '30d' : '7d'
        }
      });

    } catch (error) {
      this.logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code
   */
  async verifyTwoFactor(req: Request, res: Response): Promise<void> {
    const { challengeId, code, userId } = req.body;

    try {
      const isValid = await this.twoFactorAuthService.verifyChallengeCode(challengeId, code);

      if (!isValid) {
        throw new AuthenticationError('Invalid verification code');
      }

      // Get user
      const user = await User.findById(userId).populate('company');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokenPair(user._id.toString());

      // Update login info
      await User.findByIdAndUpdate(user._id, {
        // lastLogin field removed - using lastLoginAt instead
        lastLoginAt: new Date()
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.fullName,
            role: user.role,
            company: user.company
          },
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      this.logger.error('2FA verification error:', error);
      throw error;
    }
  }

  /**
   * Enable 2FA
   */
  async enableTwoFactor(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;

      const secret = await this.twoFactorAuthService.generateTOTPSecret(userId);

      res.json({
        success: true,
        data: {
          secret: secret.secret,
          qrCode: secret.qrCode,
          backupCodes: secret.backupCodes
        }
      });

    } catch (error) {
      this.logger.error('Enable 2FA error:', error);
      throw error;
    }
  }

  /**
   * Confirm 2FA setup
   */
  async confirmTwoFactor(req: Request | any, res: Response): Promise<void> {
    const { token } = req.body;
    const userId = req.userId || req.user?._id;

    try {
      const success = await this.twoFactorAuthService.verifyAndEnable2FA(userId, token);

      if (!success) {
        throw new ValidationError('Invalid verification code');
      }

      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      });

    } catch (error) {
      this.logger.error('Confirm 2FA error:', error);
      throw error;
    }
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;

      await this.twoFactorAuthService.disable2FA(userId);

      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });

    } catch (error) {
      this.logger.error('Disable 2FA error:', error);
      throw error;
    }
  }

  /**
   * Get current user profile
   */
  async getMe(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;

      const user = await User.findById(userId)
        .populate('company')
        .select('-password');

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({
        success: true,
        data: user
      });

    } catch (error) {
      this.logger.error('Get profile error:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;
      const { name, firstName, lastName, phone, preferences } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Update allowed fields
      // Note: name is handled by firstName and lastName
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (phone) user.phone = phone;
      if (preferences) user.preferences = { ...user.preferences, ...preferences };

      // Profile fields are stored directly on user

      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: user._id,
          name: user.fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          phone: user.phone,
          preferences: user.preferences
        }
      });

    } catch (error) {
      this.logger.error('Update profile error:', error);
      throw error;
    }
  }

  /**
   * Update password
   */
  async updatePassword(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;
      const { currentPassword, newPassword } = req.body;

      // Get user with password
      const user = await User.findById(userId).select('+password');
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Check current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        throw new AuthenticationError('Current password is incorrect');
      }

      // Update password
      user.password = await bcrypt.hash(newPassword, 12);
      await user.save();

      res.json({
        success: true,
        message: 'Password updated successfully'
      });

    } catch (error) {
      this.logger.error('Update password error:', error);
      throw error;
    }
  }

  /**
   * Forgot password
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        // Don't reveal if user exists or not
        res.json({
          success: true,
          message: 'If the email exists, a password reset link has been sent.'
        });
        return;
      }

      // Generate reset token
      const resetToken = uuidv4();
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Save reset token
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetTokenExpiry;
      await user.save();

      // Send reset email
      await this.emailService.sendPasswordResetEmail(email, resetToken);

      // Track password reset request
      await this.analyticsService.trackEvent({
        tenantId: req.tenantId || user.company?.toString() || 'default',
        eventType: 'password_reset_requested',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.',
        // Remove in production
        resetToken
      });

    } catch (error) {
      this.logger.error('Forgot password error:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, newPassword } = req.body;

    try {
      // Find user with valid reset token
      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        throw new ValidationError('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset tokens
      user.password = hashedPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.failedLoginAttempts = 0;
      await user.save();

      // Track password reset success
      await this.analyticsService.trackEvent({
        tenantId: req.tenantId || user.company?.toString() || 'default',
        eventType: 'password_reset_success',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      this.logger.error('Reset password error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    try {
      if (!refreshToken) {
        throw new AuthenticationError('Refresh token is required');
      }

      // Verify refresh token
      const decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || 'refresh-secret'
      ) as any;

      // Find user with matching refresh token
      const user = await User.findOne({
        _id: decoded.userId,
        refreshToken
      });

      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new token pair
      const tokens = await this.generateTokenPair(user._id.toString());

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });

    } catch (error) {
      this.logger.error('Refresh token error:', error);
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Logout user
   */
  async logout(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id || req.user?.id;

      if (userId) {
        // Clear refresh token
        await User.findByIdAndUpdate(userId, {
          refreshToken: null
        });

        // Track logout
        await this.analyticsService.trackEvent({
          tenantId: req.tenantId || 'default',
          eventType: 'logout',
          category: 'user',
          userId: mongoose.Types.ObjectId.createFromHexString(userId),
          ipAddress: req.ip
        });
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      this.logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(req: Request | any, res: Response): Promise<void> {
    try {
      const userId = req.userId || req.user?._id;

      // Clear refresh token and increment login count to invalidate all tokens
      await User.findByIdAndUpdate(userId, {
        refreshToken: undefined,
        $inc: { loginCount: 1 }
      });

      this.logger.info('User logged out from all devices', { userId });

      res.json({
        success: true,
        message: 'Logged out from all devices successfully'
      });

    } catch (error) {
      this.logger.error('Logout all error:', error);
      throw error;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    try {
      // Verify email token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      ) as any;

      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new ValidationError('Invalid verification token');
      }

      if (user.isEmailVerified) {
        res.json({
          success: true,
          message: 'Email already verified'
        });
        return;
      }

      // Mark email as verified and update onboarding step
      user.isEmailVerified = true;
      user.onboardingStep = 'company-details';
      user.emailVerifiedAt = new Date();
      await user.save();

      // Track email verification
      await this.analyticsService.trackEvent({
        tenantId: req.tenantId || user.company?.toString() || 'default',
        eventType: 'email_verified',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        message: 'Email verified successfully'
      });

    } catch (error) {
      this.logger.error('Email verification error:', error);
      throw new ValidationError('Invalid or expired verification token');
    }
  }

  /**
   * Social login - Google
   */
  async googleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { redirect_uri } = req.query;

      if (!process.env.GOOGLE_CLIENT_ID) {
        throw new ValidationError('Google SSO not configured');
      }

      const state = uuidv4();
      const scope = 'openid profile email';

      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' +
        `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&` +
        'response_type=code&' +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;

      res.redirect(authUrl);

    } catch (error) {
      this.logger.error('Google login error:', error);
      throw error;
    }
  }

  /**
   * Google OAuth callback
   */
  async googleCallback(req: Request, res: Response): Promise<void> {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        throw new ValidationError('Missing authorization code or state');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      });

      const { access_token } = tokenResponse.data;

      // Get user info from Google
      const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      const googleUser = userResponse.data;

      // Find or create user
      const user = await this.findOrCreateSocialUser({
        email: googleUser.email,
        firstName: googleUser.given_name,
        lastName: googleUser.family_name,
        avatar: googleUser.picture,
        provider: 'google',
        providerId: googleUser.id
      });

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokenPair(user._id.toString());

      // Track social login
      await this.analyticsService.trackEvent({
        tenantId: req.tenantId || user.company?.toString() || 'default',
        eventType: 'social_login_success',
        category: 'user',
        userId: user._id as mongoose.Types.ObjectId,
        data: { email: user.email, provider: 'google' },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
          },
          accessToken,
          refreshToken
        }
      });

    } catch (error) {
      this.logger.error('Google callback error:', error);
      throw error;
    }
  }

  // Private helper methods

  private async generateTokenPair(userId: string, rememberMe: boolean = false) {
    const accessToken = this.generateAccessToken(userId);
    const refreshToken = this.generateRefreshToken(userId);

    // Store refresh token in database
    await User.findByIdAndUpdate(userId, {
      refreshToken,
      $inc: { loginCount: 1 },
      lastLoginAt: new Date()
    });

    return { accessToken, refreshToken };
  }

  private generateAccessToken(userId: string): string {
    const expiresIn = process.env.JWT_EXPIRE || '15m';
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET || 'secret',
      { expiresIn } as jwt.SignOptions
    );
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign(
      {
        userId,
        type: 'refresh',
        random: crypto.randomBytes(16).toString('hex')
      },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' } as jwt.SignOptions
    );
  }

  private generateEmailVerificationToken(user: any): string {
    return jwt.sign(
      {
        userId: user._id.toString(),
        type: 'email_verification'
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' } as jwt.SignOptions
    );
  }

  private async incrementFailedLoginAttempts(user: any): Promise<void> {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10);

    const updateData: any = {
      failedLoginAttempts: attempts,
      lastFailedLoginAt: new Date()
    };

    // Lock account if max attempts reached
    if (attempts >= maxAttempts) {
      updateData.accountStatus = 'locked';
      updateData.accountLockedAt = new Date();

      this.logger.warn('Account locked due to failed login attempts', {
        userId: user._id.toString(),
        email: user.email,
        failedAttempts: attempts
      });
    }

    await User.findByIdAndUpdate(user._id, updateData);
  }

  private async resetFailedLoginAttempts(user: any): Promise<void> {
    await User.findByIdAndUpdate(user._id, {
      failedLoginAttempts: 0,
      lastFailedLoginAt: undefined,
      accountStatus: 'active',
      accountLockedAt: undefined
    });
  }

  private async findOrCreateSocialUser(socialData: {
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    provider: string;
    providerId: string;
  }): Promise<any> {
    // Try to find existing user by email
    let user = await User.findOne({ email: socialData.email });

    if (user) {
      // Update user with social info if needed
      if (!user.avatar && socialData.avatar) {
        user.avatar = socialData.avatar;
      }

      // Mark email as verified for social users
      if (!user.isEmailVerified) {
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();
        user.onboardingStep = 'company-details';
      }

      await user.save();
    } else {
      // Create new user
      user = new User({
        email: socialData.email,
        firstName: socialData.firstName,
        lastName: socialData.lastName,
        // name will be accessed via virtual fullName property
        avatar: socialData.avatar,
        password: await bcrypt.hash(uuidv4(), 12), // Random password for social users
        role: 'buyer', // Default role
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        onboardingStep: 'company-details',
        accountStatus: 'active',
        failedLoginAttempts: 0,
        loginCount: 0
        // isActive field removed - using accountStatus instead
      });

      await user.save();
    }

    return user;
  }
}

// Export singleton instance
export const authController = new AuthController();
