import { AuthenticationError, UserInputError } from 'apollo-server-express';
import bcrypt from 'bcryptjs';

import { Logger } from '../../core/logging/logger';
import { User } from '../../models/User';
import { Context } from '../context';

const logger = new Logger('UserResolvers');

export const userResolvers = {
  Query: {
    me: async (_: any, __: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      return context.user;
    },

    user: async (_: any, { id }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'ADMIN') {
        throw new AuthenticationError('Not authorized');
      }

      return context.dataloaders.userLoader.load(id);
    },

    users: async (_: any, { role, limit = 20, offset = 0 }: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'ADMIN') {
        throw new AuthenticationError('Not authorized');
      }

      const query: any = {};
      if (role) query.role = role;

      return User.find(query)
        .populate('company')
        .skip(offset)
        .limit(limit)
        .lean();
    }
  },

  Mutation: {
    updateProfile: async (_: any, { input }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const user = await User.findByIdAndUpdate(
          context.user.id,
          { $set: input },
          { new: true, runValidators: true }
        ).populate('company');

        logger.info('Profile updated', { userId: context.user.id });

        return user;
      } catch (error) {
        logger.error('Failed to update profile', error);
        throw new UserInputError('Failed to update profile');
      }
    },

    changePassword: async (_: any, { currentPassword, newPassword }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const user = await User.findById(context.user.id);
        if (!user) {
          throw new UserInputError('User not found');
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
          throw new UserInputError('Current password is incorrect');
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        logger.info('Password changed', { userId: context.user.id });

        return true;
      } catch (error) {
        logger.error('Failed to change password', error);
        throw error;
      }
    }
  },

  User: {
    company: async (user: any, _: any, context: Context) => {
      if (user.company?._id) return user.company;
      return context.dataloaders.companyLoader.load(user.company);
    }
  }
};
