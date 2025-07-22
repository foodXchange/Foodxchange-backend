import { LoginRequest, RegisterRequest } from '@shared/types';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { config } from '../../core/config';
import { AuthenticationError, ValidationError, NotFoundError } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { User } from '../../models/User';

const logger = new Logger('AuthService');

export class AuthService {
  async register(data: RegisterRequest) {
    logger.info('Registering new user', { email: data.email });

    // Check if user exists
    const existingUser = await User.findOne({ email: data.email.toLowerCase() });
    if (existingUser) {
      throw new ValidationError('User already exists: Email is already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, config.auth.bcrypt.rounds);

    // Create user
    const user = new User({
      email: data.email.toLowerCase(),
      password: hashedPassword,
      role: data.role,
      profile: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone
      },
      company: data.company
    });

    await user.save();
    logger.info('User registered successfully', { userId: user._id });

    // Generate token
    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
      expiresIn: this.getTokenExpiry()
    };
  }

  async login(data: LoginRequest) {
    logger.info('User login attempt', { email: data.email });

    // Find user
    const user = await User.findOne({ email: data.email.toLowerCase() })
      .populate('company')
      .select('+password');

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if account is locked
    if (user.isLocked) {
      throw new AuthenticationError('Account is locked due to too many failed attempts');
    }

    // Verify password
    const isValidPassword = await user.comparePassword(data.password);
    if (!isValidPassword) {
      await user.incLoginAttempts();
      throw new AuthenticationError('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      throw new AuthenticationError('Account is not active');
    }

    // Reset login attempts and update last login
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    logger.info('User logged in successfully', { userId: user._id });

    // Generate token
    const token = this.generateToken(user);

    return {
      user: this.sanitizeUser(user),
      token,
      expiresIn: this.getTokenExpiry()
    };
  }

  async refreshToken(userId: string) {
    const user = await User.findById(userId).populate('company');
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid user');
    }

    const token = this.generateToken(user);
    return {
      token,
      expiresIn: this.getTokenExpiry()
    };
  }

  async getProfile(userId: string) {
    const user = await User.findById(userId)
      .populate('company')
      .select('-password');

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return this.sanitizeUser(user);
  }

  async updateProfile(userId: string, updates: any) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { profile: updates } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    logger.info('User profile updated', { userId });
    return this.sanitizeUser(user);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Verify old password
    const isValid = await user.comparePassword(oldPassword);
    if (!isValid) {
      throw new AuthenticationError('Invalid current password');
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, config.auth.bcrypt.rounds);
    await user.save();

    logger.info('User password changed', { userId });
    return { message: 'Password changed successfully' };
  }

  private generateToken(user: any): string {
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
      company: user.company?._id
    };

    return jwt.sign(payload, config.auth.jwt.secret, {
      expiresIn: config.auth.jwt.expiresIn
    });
  }

  private getTokenExpiry(): number {
    const expiry = config.auth.jwt.expiresIn;
    const match = expiry.match(/(\d+)([dhms])/);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'm': return value * 60 * 1000;
      case 's': return value * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }

  private sanitizeUser(user: any) {
    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.loginAttempts;
    delete sanitized.lockUntil;
    return sanitized;
  }
}

export default new AuthService();
