import crypto from 'crypto';

import { AuthenticationError, UserInputError } from 'apollo-server-express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Declare global for reset tokens (temporary solution)
declare global {
  var resetTokens: Map<string, { userId: string; expiry: Date }>;
}

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { User } from '../../models/User';
import { TwoFactorAuthService } from '../../services/auth/TwoFactorAuthService';
import { queueEmail } from '../../services/queue/jobHelpers';


const logger = new Logger('AuthResolvers');

const generateTokens = (userId: string, role: string) => {
  const payload = { userId, role };
  const secret = process.env.JWT_SECRET || 'secret';

  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  const refreshToken = jwt.sign(payload, secret, { expiresIn: '7d' });

  return { token, refreshToken };
};

export const authResolvers = {
  Mutation: {
    signUp: async (_: any, { input }: any, context: any) => {
      try {
        const { email, password, firstName, lastName, role, companyName } = input;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          throw new UserInputError('Email already registered');
        }

        // Create company first
        const company = new Company({
          name: companyName,
          legalName: companyName,
          address: {
            street: '',
            city: '',
            country: '',
            postalCode: ''
          }
        });
        await company.save();

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role,
          company: company._id,
          verified: false
        });
        await user.save();

        // Generate tokens
        const tokens = generateTokens(user._id.toString(), user.role);

        // Send welcome email
        await queueEmail(
          email,
          'Welcome to FoodXchange',
          `Welcome ${firstName}! Your account has been created successfully.`,
          {
            template: 'welcome',
            templateData: { firstName, companyName }
          }
        );

        logger.info('User registered', { userId: user._id, email });

        return {
          ...tokens,
          user: await User.findById(user._id).populate('company')
        };
      } catch (error) {
        logger.error('Sign up failed', error);
        throw error;
      }
    },

    signIn: async (_: any, { input }: any, context: any) => {
      try {
        const { email, password } = input;

        // Find user
        const user = await User.findOne({ email }).populate('company');
        if (!user) {
          throw new AuthenticationError('Invalid credentials');
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          throw new AuthenticationError('Invalid credentials');
        }

        // Check if 2FA is enabled - skipping for now as not implemented
        // TODO: Implement 2FA when properties are added to User model

        // Generate tokens
        const tokens = generateTokens(user._id.toString(), user.role);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        logger.info('User logged in', { userId: user._id, email });

        return {
          ...tokens,
          user
        };
      } catch (error) {
        logger.error('Sign in failed', error);
        throw error;
      }
    },

    signOut: async (_: any, __: any, context: any) => {
      // In a real implementation, you might want to blacklist the token
      return true;
    },

    refreshToken: async (_: any, { refreshToken }: any, context: any) => {
      try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'secret') as any;
        const user = await User.findById(decoded.userId).populate('company');

        if (!user) {
          throw new AuthenticationError('Invalid refresh token');
        }

        const tokens = generateTokens(user._id.toString(), user.role);

        return {
          ...tokens,
          user
        };
      } catch (error) {
        throw new AuthenticationError('Invalid refresh token');
      }
    },

    requestPasswordReset: async (_: any, { email }: any, context: any) => {
      try {
        const user = await User.findOne({ email });
        if (!user) {
          // Don't reveal if email exists
          return true;
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        // TODO: Store reset token in a separate collection or cache
        // For now, we'll use in-memory storage (not production ready)
        const resetTokens = global.resetTokens || (global.resetTokens = new Map());
        resetTokens.set(resetToken, {
          userId: user._id.toString(),
          expiry: resetTokenExpiry
        });

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        await queueEmail(
          email,
          'Password Reset Request',
          `Click here to reset your password: ${resetUrl}`,
          {
            template: 'password-reset',
            templateData: { resetUrl, firstName: user.firstName }
          }
        );

        logger.info('Password reset requested', { userId: user._id, email });

        return true;
      } catch (error) {
        logger.error('Password reset request failed', error);
        return false;
      }
    },

    resetPassword: async (_: any, { token, newPassword }: any, context: any) => {
      try {
        // Check token in temporary storage
        const resetTokens = global.resetTokens || new Map();
        const tokenData = resetTokens.get(token);

        if (!tokenData || tokenData.expiry < new Date()) {
          throw new AuthenticationError('Invalid or expired reset token');
        }

        const user = await User.findById(tokenData.userId);
        if (!user) {
          throw new AuthenticationError('User not found');
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        // Remove used token
        resetTokens.delete(token);

        // Send confirmation email
        await queueEmail(
          user.email,
          'Password Reset Successful',
          'Your password has been reset successfully.',
          {
            template: 'password-reset-success',
            templateData: { firstName: user.firstName }
          }
        );

        logger.info('Password reset successful', { userId: user._id });

        return true;
      } catch (error) {
        logger.error('Password reset failed', error);
        throw error;
      }
    },

    enableTwoFactor: async (_: any, __: any, context: any) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const twoFactorService = new TwoFactorAuthService();
        const secretData = await twoFactorService.generateTOTPSecret(context.user.id);

        // In real implementation, return QR code URL
        // For now, just return success
        return true;
      } catch (error) {
        logger.error('Enable 2FA failed', error);
        throw error;
      }
    },

    verifyTwoFactor: async (_: any, { code }: any, context: any) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const twoFactorService = new TwoFactorAuthService();
        const isValid = await twoFactorService.verifyAndEnable2FA(context.user.id, code);

        if (!isValid) {
          throw new AuthenticationError('Invalid 2FA code');
        }

        // Mark user as 2FA verified for this session
        // TODO: Implement session-based 2FA verification when User model is updated

        return true;
      } catch (error) {
        logger.error('2FA verification failed', error);
        throw error;
      }
    }
  }
};
