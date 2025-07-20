import bcrypt from 'bcryptjs';

import { cacheService, cacheKeys } from '../config/redis';
import { AuthenticationError } from '../core/errors';
import { User, IUser } from '../models/User';

import { BaseRepository } from './base/BaseRepository';


export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User, 'UserRepository');
  }

  // Override findById to use cache
  async findById(id: string): Promise<IUser | null> {
    const cacheKey = cacheKeys.user(id);

    // Try cache first
    const cached = await cacheService.get<IUser>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for user ${id}`);
      return cached;
    }

    // Fetch from database
    const user = await super.findById(id);

    // Cache the result (exclude sensitive data)
    if (user) {
      const userToCache = { ...user };
      delete (userToCache as any).password;
      await cacheService.set(cacheKey, userToCache, 3600); // 1 hour
    }

    return user;
  }

  // Find user by email
  async findByEmail(email: string): Promise<IUser | null> {
    const cacheKey = cacheKeys.userByEmail(email);

    // Try cache first
    const cached = await cacheService.get<IUser>(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const user = await this.findOne({ email: email.toLowerCase() });

    // Cache the result
    if (user) {
      const userToCache = { ...user };
      delete (userToCache as any).password;
      await cacheService.set(cacheKey, userToCache, 3600);
    }

    return user;
  }

  // Create user with password hashing
  async createUser(userData: Partial<IUser>): Promise<IUser> {
    // Hash password if provided
    if (userData.password) {
      const salt = await bcrypt.genSalt(10);
      userData.password = await bcrypt.hash(userData.password, salt);
    }

    // Ensure email is lowercase
    if (userData.email) {
      userData.email = userData.email.toLowerCase();
    }

    const user = await this.create(userData);

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return userResponse;
  }

  // Update user and invalidate cache
  async updateUser(id: string, data: Partial<IUser>): Promise<IUser | null> {
    // Hash password if being updated
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(data.password, salt);
    }

    const user = await this.update(id, data);

    if (user) {
      // Invalidate caches
      await Promise.all([
        cacheService.del(cacheKeys.user(id)),
        cacheService.del(cacheKeys.userByEmail(user.email))
      ]);
    }

    return user;
  }

  // Verify user credentials
  async verifyCredentials(email: string, password: string): Promise<IUser> {
    const user = await this.model.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;

    return userResponse;
  }

  // Find users by company
  async findByCompany(companyId: string): Promise<IUser[]> {
    return this.findAll({ company: companyId });
  }

  // Find active users
  async findActiveUsers(tenantId: string): Promise<IUser[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.findAll({
      tenantId,
      isActive: true,
      lastLogin: { $gte: thirtyDaysAgo }
    });
  }

  // Update user preferences
  async updatePreferences(userId: string, preferences: any): Promise<IUser | null> {
    const user = await this.update(userId, {
      $set: { preferences }
    });

    if (user) {
      await cacheService.del(cacheKeys.user(userId));
    }

    return user;
  }

  // Enable/disable two-factor authentication
  async setTwoFactorAuth(userId: string, enabled: boolean, secret?: string): Promise<IUser | null> {
    const updateData: any = {
      'twoFactorAuth.enabled': enabled
    };

    if (secret) {
      updateData['twoFactorAuth.secret'] = secret;
    }

    return this.updateUser(userId, updateData);
  }

  // Record login attempt
  async recordLoginAttempt(email: string, success: boolean, ip?: string): Promise<void> {
    const user = await this.findByEmail(email);

    if (!user) return;

    const attempt = {
      timestamp: new Date(),
      success,
      ip
    };

    await this.model.findByIdAndUpdate(user._id, {
      $push: {
        loginAttempts: {
          $each: [attempt],
          $slice: -10 // Keep only last 10 attempts
        }
      }
    });
  }

  // Get users by role
  async findByRole(role: string, tenantId?: string): Promise<IUser[]> {
    const filter: any = { role };
    if (tenantId) filter.tenantId = tenantId;

    return this.findAll(filter);
  }

  // Soft delete user
  async softDelete(userId: string): Promise<boolean> {
    const user = await this.update(userId, {
      $set: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    if (user) {
      // Invalidate caches
      await Promise.all([
        cacheService.del(cacheKeys.user(userId)),
        cacheService.del(cacheKeys.userByEmail(user.email))
      ]);
      return true;
    }

    return false;
  }
}
