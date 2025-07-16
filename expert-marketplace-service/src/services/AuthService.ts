import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { ExpertProfile } from '../models';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { CacheService } from './CacheService';
import { 
  AuthTokens, 
  LoginCredentials, 
  ExpertRegistration, 
  JWTPayload, 
  UserRole, 
  ExpertPermission,
  TwoFactorSetup,
  SecuritySettings,
  LoginAttempt,
  SessionData
} from '../interfaces/auth.interface';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  NotFoundError
} from '../utils/errors';

const logger = new Logger('AuthService');

export class AuthService {
  private cacheService: CacheService;
  private readonly SALT_ROUNDS = 12;
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 15 * 60; // 15 minutes

  constructor() {
    this.cacheService = new CacheService();
  }

  /**
   * Register a new expert
   */
  async registerExpert(registrationData: ExpertRegistration): Promise<{
    expert: any;
    tokens: AuthTokens;
  }> {
    try {
      // Check if email already exists
      const existingExpert = await ExpertProfile.findOne({ 
        email: registrationData.email 
      });

      if (existingExpert) {
        throw new ConflictError('Email already registered');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(
        registrationData.password, 
        this.SALT_ROUNDS
      );

      // Create user in main backend (mock for now)
      const userId = await this.createUserInMainBackend({
        email: registrationData.email,
        password: hashedPassword,
        role: UserRole.EXPERT
      });

      // Create expert profile
      const expertProfile = new ExpertProfile({
        userId,
        firstName: registrationData.firstName,
        lastName: registrationData.lastName,
        email: registrationData.email,
        phone: registrationData.phone,
        headline: registrationData.headline,
        bio: registrationData.bio,
        expertise: registrationData.expertise.map(id => ({ 
          category: id,
          subcategories: [],
          level: 'intermediate',
          yearsOfExperience: 1
        })),
        languages: registrationData.languages,
        location: {
          country: registrationData.country,
          state: registrationData.state,
          city: registrationData.city,
          timezone: registrationData.timezone
        },
        hourlyRate: {
          min: registrationData.hourlyRateMin,
          max: registrationData.hourlyRateMax,
          currency: registrationData.currency
        },
        status: 'pending' // Require verification
      });

      await expertProfile.save();

      // Generate tokens
      const tokens = await this.generateTokens(
        userId.toString(),
        expertProfile._id.toString(),
        UserRole.EXPERT,
        'unverified'
      );

      // Log registration
      logger.info('Expert registered successfully', {
        expertId: expertProfile._id,
        email: registrationData.email
      });

      return {
        expert: expertProfile.toObject(),
        tokens
      };
    } catch (error) {
      logger.error('Expert registration failed:', error);
      throw error;
    }
  }

  /**
   * Login expert
   */
  async loginExpert(credentials: LoginCredentials, metadata: {
    ipAddress: string;
    userAgent: string;
  }): Promise<{
    expert: any;
    tokens: AuthTokens;
    requiresTwoFactor?: boolean;
  }> {
    try {
      // Check for account lockout
      await this.checkAccountLockout(credentials.email, metadata.ipAddress);

      // Find expert by email
      const expert = await ExpertProfile.findOne({ 
        email: credentials.email 
      }).select('+password +twoFactorSecret +securitySettings');

      if (!expert) {
        await this.recordLoginAttempt(credentials.email, metadata, false, 'Invalid credentials');
        throw new AuthenticationError('Invalid credentials');
      }

      // Get user password from main backend (mock for now)
      const userPassword = await this.getUserPasswordFromMainBackend(expert.userId);

      // Verify password
      const isValidPassword = await bcrypt.compare(credentials.password, userPassword);
      if (!isValidPassword) {
        await this.recordLoginAttempt(credentials.email, metadata, false, 'Invalid password');
        throw new AuthenticationError('Invalid credentials');
      }

      // Check if expert account is active
      if (expert.status === 'suspended') {
        await this.recordLoginAttempt(credentials.email, metadata, false, 'Account suspended');
        throw new AuthenticationError('Account suspended');
      }

      // Check two-factor authentication
      if (expert.securitySettings?.twoFactorEnabled) {
        if (!credentials.twoFactorCode) {
          return {
            expert: null,
            tokens: null as any,
            requiresTwoFactor: true
          };
        }

        const isValidTwoFactor = this.verifyTwoFactorCode(
          expert.twoFactorSecret,
          credentials.twoFactorCode
        );

        if (!isValidTwoFactor) {
          await this.recordLoginAttempt(credentials.email, metadata, false, 'Invalid 2FA code');
          throw new AuthenticationError('Invalid two-factor code');
        }
      }

      // Generate tokens
      const tokens = await this.generateTokens(
        expert.userId.toString(),
        expert._id.toString(),
        UserRole.EXPERT,
        expert.verificationStatus
      );

      // Update last active
      expert.lastActiveAt = new Date();
      await expert.save();

      // Record successful login
      await this.recordLoginAttempt(credentials.email, metadata, true);

      // Clear any lockout
      await this.clearAccountLockout(credentials.email, metadata.ipAddress);

      logger.info('Expert login successful', {
        expertId: expert._id,
        email: credentials.email
      });

      return {
        expert: expert.toObject(),
        tokens
      };
    } catch (error) {
      logger.error('Expert login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(
        refreshToken, 
        config.jwt.refreshSecret
      ) as JWTPayload;

      // Check if refresh token is blacklisted
      const isBlacklisted = await this.cacheService.get(
        `refresh_blacklist:${refreshToken}`
      );

      if (isBlacklisted) {
        throw new AuthenticationError('Refresh token revoked');
      }

      // Get current expert data
      const expert = await ExpertProfile.findById(decoded.expertId);
      if (!expert) {
        throw new AuthenticationError('Expert not found');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(
        decoded.userId,
        decoded.expertId!,
        decoded.role,
        expert.verificationStatus
      );

      // Blacklist old refresh token
      await this.cacheService.set(
        `refresh_blacklist:${refreshToken}`,
        true,
        { ttl: 30 * 24 * 60 * 60 } // 30 days
      );

      return tokens;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Logout expert
   */
  async logout(accessToken: string, refreshToken: string): Promise<void> {
    try {
      // Blacklist both tokens
      const accessDecoded = jwt.decode(accessToken) as JWTPayload;
      const refreshDecoded = jwt.decode(refreshToken) as JWTPayload;

      if (accessDecoded) {
        await this.cacheService.set(
          `blacklist:${accessToken}`,
          true,
          { ttl: accessDecoded.exp - Math.floor(Date.now() / 1000) }
        );

        // Clear session
        await this.cacheService.delete(`session:${accessDecoded.sessionId}`);
      }

      if (refreshDecoded) {
        await this.cacheService.set(
          `refresh_blacklist:${refreshToken}`,
          true,
          { ttl: 30 * 24 * 60 * 60 }
        );
      }

      logger.info('Expert logout successful');
    } catch (error) {
      logger.error('Logout error:', error);
      // Don't throw error for logout
    }
  }

  /**
   * Setup two-factor authentication
   */
  async setupTwoFactor(expertId: string): Promise<TwoFactorSetup> {
    try {
      const expert = await ExpertProfile.findById(expertId);
      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `FoodXchange Expert (${expert.email})`,
        issuer: 'FoodXchange'
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = Array.from({ length: 8 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );

      // Store secret temporarily (not enabled until verified)
      await this.cacheService.set(
        `2fa_setup:${expertId}`,
        { secret: secret.base32, backupCodes },
        { ttl: 10 * 60 } // 10 minutes
      );

      return {
        secret: secret.base32,
        qrCode,
        backupCodes
      };
    } catch (error) {
      logger.error('Two-factor setup error:', error);
      throw error;
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(
    expertId: string, 
    verificationCode: string
  ): Promise<{ backupCodes: string[] }> {
    try {
      const setupData = await this.cacheService.get<{
        secret: string;
        backupCodes: string[];
      }>(`2fa_setup:${expertId}`);

      if (!setupData) {
        throw new ValidationError('Two-factor setup not found or expired');
      }

      // Verify the code
      const isValid = speakeasy.totp.verify({
        secret: setupData.secret,
        encoding: 'base32',
        token: verificationCode,
        window: 2
      });

      if (!isValid) {
        throw new ValidationError('Invalid verification code');
      }

      // Enable 2FA for expert
      await ExpertProfile.findByIdAndUpdate(expertId, {
        twoFactorSecret: setupData.secret,
        'securitySettings.twoFactorEnabled': true,
        'securitySettings.backupCodes': setupData.backupCodes
      });

      // Clear setup cache
      await this.cacheService.delete(`2fa_setup:${expertId}`);

      logger.info('Two-factor authentication enabled', { expertId });

      return { backupCodes: setupData.backupCodes };
    } catch (error) {
      logger.error('Two-factor enable error:', error);
      throw error;
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(expertId: string, password: string): Promise<void> {
    try {
      const expert = await ExpertProfile.findById(expertId);
      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Verify password
      const userPassword = await this.getUserPasswordFromMainBackend(expert.userId);
      const isValidPassword = await bcrypt.compare(password, userPassword);
      
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid password');
      }

      // Disable 2FA
      await ExpertProfile.findByIdAndUpdate(expertId, {
        $unset: { twoFactorSecret: 1 },
        'securitySettings.twoFactorEnabled': false,
        'securitySettings.backupCodes': []
      });

      logger.info('Two-factor authentication disabled', { expertId });
    } catch (error) {
      logger.error('Two-factor disable error:', error);
      throw error;
    }
  }

  /**
   * Change password
   */
  async changePassword(
    expertId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      const expert = await ExpertProfile.findById(expertId);
      if (!expert) {
        throw new NotFoundError('Expert');
      }

      // Verify current password
      const userPassword = await this.getUserPasswordFromMainBackend(expert.userId);
      const isValidPassword = await bcrypt.compare(currentPassword, userPassword);
      
      if (!isValidPassword) {
        throw new AuthenticationError('Invalid current password');
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      // Update password in main backend
      await this.updatePasswordInMainBackend(expert.userId, hashedNewPassword);

      // Invalidate all sessions for this user
      await this.invalidateAllSessions(expert.userId.toString());

      logger.info('Password changed successfully', { expertId });
    } catch (error) {
      logger.error('Password change error:', error);
      throw error;
    }
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(
    userId: string,
    expertId: string,
    role: UserRole,
    verificationStatus: string
  ): Promise<AuthTokens> {
    const sessionId = crypto.randomUUID();
    const permissions = this.getExpertPermissions(verificationStatus);

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId,
      expertId,
      role,
      permissions,
      verificationStatus,
      sessionId
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn
    });

    // Store session
    await this.cacheService.set(
      `session:${sessionId}`,
      { active: true, userId, expertId },
      { ttl: 24 * 60 * 60 } // 24 hours
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpirationTime(config.jwt.expiresIn)
    };
  }

  /**
   * Get expert permissions based on verification status
   */
  private getExpertPermissions(verificationStatus: string): ExpertPermission[] {
    const basePermissions = [
      ExpertPermission.MANAGE_PROFILE,
      ExpertPermission.UPDATE_AVAILABILITY,
      ExpertPermission.VIEW_COLLABORATIONS,
      ExpertPermission.SEND_MESSAGES,
      ExpertPermission.VIEW_EARNINGS
    ];

    if (verificationStatus === 'verified') {
      return [
        ...basePermissions,
        ExpertPermission.MANAGE_SERVICES,
        ExpertPermission.MANAGE_COLLABORATIONS,
        ExpertPermission.ACCESS_WORKSPACE,
        ExpertPermission.MAKE_VIDEO_CALLS,
        ExpertPermission.SHARE_DOCUMENTS,
        ExpertPermission.MANAGE_PAYMENTS,
        ExpertPermission.WITHDRAW_FUNDS,
        ExpertPermission.VIEW_ANALYTICS,
        ExpertPermission.EXPORT_DATA,
        ExpertPermission.INSTANT_BOOKING,
        ExpertPermission.PRIORITY_SUPPORT
      ];
    }

    return basePermissions;
  }

  /**
   * Verify two-factor code
   */
  private verifyTwoFactorCode(secret: string, code: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2
    });
  }

  /**
   * Check account lockout
   */
  private async checkAccountLockout(email: string, ipAddress: string): Promise<void> {
    const attempts = await this.cacheService.get<number>(`login_attempts:${email}`) || 0;
    const ipAttempts = await this.cacheService.get<number>(`login_attempts_ip:${ipAddress}`) || 0;

    if (attempts >= this.MAX_LOGIN_ATTEMPTS || ipAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      throw new AuthenticationError(
        `Account temporarily locked. Try again in ${this.LOCKOUT_DURATION / 60} minutes.`
      );
    }
  }

  /**
   * Record login attempt
   */
  private async recordLoginAttempt(
    email: string,
    metadata: { ipAddress: string; userAgent: string },
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    if (!success) {
      // Increment failed attempt counters
      const attempts = await this.cacheService.get<number>(`login_attempts:${email}`) || 0;
      const ipAttempts = await this.cacheService.get<number>(`login_attempts_ip:${metadata.ipAddress}`) || 0;

      await this.cacheService.set(
        `login_attempts:${email}`,
        attempts + 1,
        { ttl: this.LOCKOUT_DURATION }
      );

      await this.cacheService.set(
        `login_attempts_ip:${metadata.ipAddress}`,
        ipAttempts + 1,
        { ttl: this.LOCKOUT_DURATION }
      );
    }

    // Log attempt for security monitoring
    logger.info('Login attempt recorded', {
      email,
      success,
      failureReason,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });
  }

  /**
   * Clear account lockout
   */
  private async clearAccountLockout(email: string, ipAddress: string): Promise<void> {
    await this.cacheService.delete(`login_attempts:${email}`);
    await this.cacheService.delete(`login_attempts_ip:${ipAddress}`);
  }

  /**
   * Invalidate all sessions for a user
   */
  private async invalidateAllSessions(userId: string): Promise<void> {
    // This would require tracking all active sessions for a user
    // For now, we'll just clear the pattern
    await this.cacheService.deletePattern(`session:*`);
  }

  /**
   * Parse expiration time string to seconds
   */
  private parseExpirationTime(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 3600; // Default 1 hour
    }
  }

  // Mock methods for main backend integration
  private async createUserInMainBackend(userData: any): Promise<string> {
    // This would integrate with the main FoodXchange backend
    return crypto.randomUUID();
  }

  private async getUserPasswordFromMainBackend(userId: any): Promise<string> {
    // This would fetch from the main backend
    return '$2a$12$mockhashedpassword';
  }

  private async updatePasswordInMainBackend(userId: any, hashedPassword: string): Promise<void> {
    // This would update in the main backend
  }
}