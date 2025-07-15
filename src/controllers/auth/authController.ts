import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { 
  ValidationError, 
  AuthenticationError, 
  ConflictError, 
  NotFoundError 
} from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { AnalyticsService } from '../../services/analytics/AnalyticsService';
import { EmailService } from '../../services/email/EmailService';
import { multiLevelCache } from '../../services/cache/MultiLevelCacheService';
import { v4 as uuidv4 } from 'uuid';

export class AuthController {
  private logger: Logger;
  private analyticsService: AnalyticsService;
  private emailService: EmailService;

  constructor() {
    this.logger = new Logger('AuthController');
    this.analyticsService = new AnalyticsService();
    this.emailService = new EmailService();
  }

  async login(req: Request, res: Response): Promise<void> {
    const { email, password, rememberMe = false } = req.validatedData;

    try {
      // Check if user exists
      const user = await User.findOne({ email }).populate('company');
      if (!user) {
        // Track failed login attempt
        await this.analyticsService.track('login_failure', { 
          email, 
          reason: 'user_not_found',
          ip: req.ip 
        });
        
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if account is locked
      if (user.accountStatus === 'locked') {
        await this.analyticsService.track('login_failure', { 
          email, 
          reason: 'account_locked',
          ip: req.ip 
        });
        
        throw new AuthenticationError('Account is locked. Please contact support.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.incrementFailedLoginAttempts(user);
        
        await this.analyticsService.track('login_failure', { 
          email, 
          reason: 'invalid_password',
          ip: req.ip 
        });
        
        throw new AuthenticationError('Invalid credentials');
      }

      // Reset failed login attempts on successful login
      await this.resetFailedLoginAttempts(user);

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Update user login information
      await User.findByIdAndUpdate(user._id, {
        $set: {
          lastLoginAt: new Date(),
          refreshToken,
        },
        $inc: { loginCount: 1 }
      });

      // Track successful login
      await this.analyticsService.track('login_success', { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        ip: req.ip 
      });

      // Prepare response data
      const userData = {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyVerified: user.companyVerified,
        onboardingStep: user.onboardingStep,
        isEmailVerified: user.isEmailVerified,
        company: user.company ? {
          id: user.company._id?.toString(),
          name: user.company.name,
          verificationStatus: user.company.verificationStatus
        } : null
      };

      res.success({
        accessToken,
        refreshToken,
        user: userData,
        expiresIn: rememberMe ? '7d' : '24h'
      });

    } catch (error) {
      this.logger.error('Login error:', error);
      throw error;
    }
  }

  async signup(req: Request, res: Response): Promise<void> {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      role, 
      company: companyName, 
      businessType,
      phone,
      acceptTerms 
    } = req.validatedData;

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        await this.analyticsService.track('signup_failure', { 
          email, 
          reason: 'email_exists',
          ip: req.ip 
        });
        
        throw new ConflictError('Email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create company if it doesn't exist
      let company = await Company.findOne({ name: companyName });
      if (!company) {
        company = new Company({
          name: companyName,
          businessType,
          verificationStatus: 'pending',
          createdBy: null // Will be set after user is created
        });
        await company.save();
      }

      // Create user
      const user = new User({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role,
        phone,
        company: company._id,
        companyVerified: false,
        onboardingStep: 'email-verification',
        isEmailVerified: false,
        accountStatus: 'active',
        acceptedTermsAt: new Date(),
        failedLoginAttempts: 0,
        loginCount: 0
      });

      await user.save();

      // Update company with creator info
      await Company.findByIdAndUpdate(company._id, {
        createdBy: user._id
      });

      // Generate email verification token
      const verificationToken = this.generateEmailVerificationToken(user);
      
      // Send verification email
      await this.emailService.sendVerificationEmail(email, verificationToken);

      // Track successful signup
      await this.analyticsService.track('signup_success', { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        companyName,
        businessType,
        ip: req.ip 
      });

      res.status(201).success({
        message: 'User registered successfully. Please check your email for verification.',
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          onboardingStep: user.onboardingStep,
          isEmailVerified: user.isEmailVerified
        }
      });

    } catch (error) {
      this.logger.error('Signup error:', error);
      throw error;
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        // Don't reveal if user exists or not
        res.success({ message: 'If the email exists, a password reset link has been sent.' });
        return;
      }

      // Generate reset token
      const resetToken = uuidv4();
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Save reset token
      await User.findByIdAndUpdate(user._id, {
        passwordResetToken: resetToken,
        passwordResetExpires: resetTokenExpiry
      });

      // Send reset email
      await this.emailService.sendPasswordResetEmail(email, resetToken);

      // Track password reset request
      await this.analyticsService.track('password_reset_requested', { 
        userId: user._id.toString(),
        email: user.email,
        ip: req.ip 
      });

      res.success({ message: 'If the email exists, a password reset link has been sent.' });

    } catch (error) {
      this.logger.error('Forgot password error:', error);
      throw error;
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, newPassword } = req.body;

    try {
      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        throw new ValidationError('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      await User.findByIdAndUpdate(user._id, {
        password: hashedPassword,
        passwordResetToken: undefined,
        passwordResetExpires: undefined,
        failedLoginAttempts: 0 // Reset failed attempts
      });

      // Track password reset success
      await this.analyticsService.track('password_reset_success', { 
        userId: user._id.toString(),
        email: user.email,
        ip: req.ip 
      });

      res.success({ message: 'Password reset successful' });

    } catch (error) {
      this.logger.error('Reset password error:', error);
      throw error;
    }
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body;

    try {
      if (!refreshToken) {
        throw new AuthenticationError('Refresh token required');
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret') as any;
      
      // Find user with matching refresh token
      const user = await User.findOne({
        _id: decoded.userId,
        refreshToken
      });

      if (!user) {
        throw new AuthenticationError('Invalid refresh token');
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken(user);

      res.success({
        accessToken: newAccessToken,
        expiresIn: '24h'
      });

    } catch (error) {
      this.logger.error('Refresh token error:', error);
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (userId) {
        // Clear refresh token
        await User.findByIdAndUpdate(userId, {
          refreshToken: null
        });

        // Track logout
        await this.analyticsService.track('logout', { 
          userId,
          ip: req.ip 
        });
      }

      res.success({ message: 'Logout successful' });

    } catch (error) {
      this.logger.error('Logout error:', error);
      throw error;
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    try {
      // Verify email token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
      
      const user = await User.findById(decoded.userId);
      if (!user) {
        throw new ValidationError('Invalid verification token');
      }

      if (user.isEmailVerified) {
        res.success({ message: 'Email already verified' });
        return;
      }

      // Mark email as verified and update onboarding step
      await User.findByIdAndUpdate(user._id, {
        isEmailVerified: true,
        onboardingStep: 'company-details',
        emailVerifiedAt: new Date()
      });

      // Track email verification
      await this.analyticsService.track('email_verified', { 
        userId: user._id.toString(),
        email: user.email,
        ip: req.ip 
      });

      res.success({ message: 'Email verified successfully' });

    } catch (error) {
      this.logger.error('Email verification error:', error);
      throw new ValidationError('Invalid or expired verification token');
    }
  }

  private generateAccessToken(user: any): string {
    return jwt.sign(
      { 
        userId: user._id.toString(),
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }

  private generateRefreshToken(user: any): string {
    return jwt.sign(
      { 
        userId: user._id.toString(),
        type: 'refresh' 
      },
      process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
  }

  private generateEmailVerificationToken(user: any): string {
    return jwt.sign(
      { 
        userId: user._id.toString(),
        type: 'email_verification' 
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
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
    }

    await User.findByIdAndUpdate(user._id, updateData);
  }

  private async resetFailedLoginAttempts(user: any): Promise<void> {
    await User.findByIdAndUpdate(user._id, {
      failedLoginAttempts: 0,
      lastFailedLoginAt: undefined,
      accountStatus: 'active'
    });
  }
}