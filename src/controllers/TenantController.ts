import { Request, Response } from 'express';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Logger } from '../core/logging/logger';
import { AuthorizationError, ValidationError } from '../core/errors';
import { AzureB2CService } from '../services/auth/AzureB2CService';
import { getFeaturesForTier, subscriptionFeatures } from '../middleware/tenantIsolation';
import asyncHandler from 'express-async-handler';

const logger = new Logger('TenantController');

export class TenantController {
  private azureB2CService: AzureB2CService;

  constructor() {
    this.azureB2CService = new AzureB2CService();
  }

  /**
   * Get current tenant information
   */
  getTenantInfo = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const company = await Company.findById(req.tenantId);
    if (!company) {
      throw new AuthorizationError('Company not found');
    }

    res.json({
      success: true,
      data: {
        id: req.tenantContext.id,
        name: req.tenantContext.name,
        domain: req.tenantContext.domain,
        subscriptionTier: req.tenantContext.subscriptionTier,
        subscriptionStatus: company.subscriptionStatus,
        features: req.tenantContext.features,
        limits: req.tenantContext.limits,
        tenantSettings: company.tenantSettings,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt
      }
    });
  });

  /**
   * Get tenant resource usage
   */
  getTenantUsage = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const [userCount, productCount] = await Promise.all([
      User.countDocuments({ 
        company: req.tenantId,
        accountStatus: 'active'
      }),
      // Dynamic import to avoid circular dependency
      (async () => {
        try {
          const Product = (await import('../models/Product')).default;
          return Product.countDocuments({ tenantId: req.tenantId });
        } catch (error) {
          return 0;
        }
      })()
    ]);

    let orderCount = 0;
    try {
      const Order = (await import('../models/Order')).default;
      orderCount = await Order.countDocuments({ tenantId: req.tenantId });
    } catch (error) {
      // Order model might not exist yet
    }

    const usage = {
      users: {
        current: userCount,
        limit: req.tenantContext.limits.maxUsers,
        percentage: Math.round((userCount / req.tenantContext.limits.maxUsers) * 100)
      },
      products: {
        current: productCount,
        limit: req.tenantContext.limits.maxProducts,
        percentage: Math.round((productCount / req.tenantContext.limits.maxProducts) * 100)
      },
      orders: {
        current: orderCount,
        limit: req.tenantContext.limits.maxOrders,
        percentage: Math.round((orderCount / req.tenantContext.limits.maxOrders) * 100)
      },
      apiCalls: {
        current: 0, // This would be tracked separately
        limit: req.tenantContext.limits.apiCallsPerMinute,
        percentage: 0
      }
    };

    res.json({
      success: true,
      data: usage
    });
  });

  /**
   * Get available features for tenant
   */
  getAvailableFeatures = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const availableFeatures = getFeaturesForTier(req.tenantContext.subscriptionTier);
    const allFeatures = subscriptionFeatures;

    res.json({
      success: true,
      data: {
        currentTier: req.tenantContext.subscriptionTier,
        availableFeatures,
        allTierFeatures: allFeatures,
        enabledFeatures: req.tenantContext.features
      }
    });
  });

  /**
   * Get tenant settings
   */
  getTenantSettings = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const company = await Company.findById(req.tenantId);
    if (!company) {
      throw new AuthorizationError('Company not found');
    }

    res.json({
      success: true,
      data: {
        tenantSettings: company.tenantSettings,
        domain: company.domain,
        subscriptionTier: company.subscriptionTier,
        billingCycle: company.billingCycle
      }
    });
  });

  /**
   * Update tenant settings
   */
  updateTenantSettings = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { customBranding, customDomain, webhookEndpoints } = req.body;

    const company = await Company.findById(req.tenantId);
    if (!company) {
      throw new AuthorizationError('Company not found');
    }

    // Update settings
    if (customBranding !== undefined) {
      company.tenantSettings.customBranding = customBranding;
    }
    if (customDomain !== undefined) {
      company.tenantSettings.customDomain = customDomain;
    }
    if (webhookEndpoints !== undefined) {
      company.tenantSettings.webhookEndpoints = webhookEndpoints;
    }

    await company.save();

    logger.info('Tenant settings updated', {
      tenantId: req.tenantId,
      updatedBy: req.userId,
      changes: { customBranding, customDomain, webhookEndpoints }
    });

    res.json({
      success: true,
      message: 'Tenant settings updated successfully',
      data: company.tenantSettings
    });
  });

  /**
   * Get tenant users
   */
  getTenantUsers = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string;
    const status = req.query.status as string;

    const filter: any = { company: req.tenantId };
    if (role) filter.role = role;
    if (status) filter.accountStatus = status;

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -refreshToken -passwordResetToken')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  });

  /**
   * Get tenant user details
   */
  getTenantUser = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { userId } = req.params;

    const user = await User.findOne({
      _id: userId,
      company: req.tenantId
    }).select('-password -refreshToken -passwordResetToken');

    if (!user) {
      throw new ValidationError('User not found');
    }

    res.json({
      success: true,
      data: user
    });
  });

  /**
   * Update user role
   */
  updateUserRole = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { userId } = req.params;
    const { role } = req.body;

    const user = await User.findOne({
      _id: userId,
      company: req.tenantId
    });

    if (!user) {
      throw new ValidationError('User not found');
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    logger.info('User role updated', {
      tenantId: req.tenantId,
      userId: userId,
      oldRole,
      newRole: role,
      updatedBy: req.userId
    });

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        userId,
        oldRole,
        newRole: role
      }
    });
  });

  /**
   * Update user status
   */
  updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findOne({
      _id: userId,
      company: req.tenantId
    });

    if (!user) {
      throw new ValidationError('User not found');
    }

    const oldStatus = user.accountStatus;
    user.accountStatus = status;
    
    if (status === 'locked') {
      user.accountLockedAt = new Date();
    }

    await user.save();

    logger.info('User status updated', {
      tenantId: req.tenantId,
      userId: userId,
      oldStatus,
      newStatus: status,
      updatedBy: req.userId
    });

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: {
        userId,
        oldStatus,
        newStatus: status
      }
    });
  });

  /**
   * Invite user to tenant
   */
  inviteUser = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { email, role, displayName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      email,
      company: req.tenantId
    });

    if (existingUser) {
      throw new ValidationError('User already exists in this tenant');
    }

    // Send invitation via Azure B2C
    const invitation = await this.azureB2CService.inviteUser(
      email,
      displayName || email,
      req.tenantId
    );

    // Create pending user record
    const pendingUser = new User({
      email,
      firstName: displayName?.split(' ')[0] || 'New',
      lastName: displayName?.split(' ')[1] || 'User',
      displayName,
      role,
      company: req.tenantId,
      accountStatus: 'inactive',
      authProvider: 'azure-b2c',
      onboardingStep: 'email-verification'
    });

    await pendingUser.save();

    logger.info('User invited to tenant', {
      tenantId: req.tenantId,
      email,
      role,
      invitedBy: req.userId,
      invitationId: invitation.invitationId
    });

    res.json({
      success: true,
      message: 'User invitation sent successfully',
      data: {
        email,
        role,
        invitationId: invitation.invitationId,
        invitationUrl: invitation.invitationUrl
      }
    });
  });

  /**
   * Get subscription details
   */
  getSubscriptionDetails = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const company = await Company.findById(req.tenantId);
    if (!company) {
      throw new AuthorizationError('Company not found');
    }

    res.json({
      success: true,
      data: {
        subscriptionId: company.subscriptionId,
        subscriptionTier: company.subscriptionTier,
        subscriptionStatus: company.subscriptionStatus,
        subscriptionStartDate: company.subscriptionStartDate,
        subscriptionEndDate: company.subscriptionEndDate,
        billingCycle: company.billingCycle,
        features: company.features,
        limits: company.limits
      }
    });
  });

  /**
   * Upgrade subscription
   */
  upgradeSubscription = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const { tier, billingCycle } = req.body;

    const company = await Company.findById(req.tenantId);
    if (!company) {
      throw new AuthorizationError('Company not found');
    }

    // Update subscription details
    const oldTier = company.subscriptionTier;
    company.subscriptionTier = tier;
    
    if (billingCycle) {
      company.billingCycle = billingCycle;
    }

    // Update features and limits based on new tier
    company.features = getFeaturesForTier(tier);
    
    // Update limits based on tier
    const tierLimits = {
      basic: { maxUsers: 10, maxProducts: 100, maxOrders: 50, apiCallsPerMinute: 100 },
      standard: { maxUsers: 50, maxProducts: 500, maxOrders: 200, apiCallsPerMinute: 500 },
      premium: { maxUsers: 200, maxProducts: 2000, maxOrders: 1000, apiCallsPerMinute: 2000 },
      enterprise: { maxUsers: 1000, maxProducts: 10000, maxOrders: 5000, apiCallsPerMinute: 10000 }
    };

    company.limits = tierLimits[tier] || tierLimits.basic;

    await company.save();

    logger.info('Subscription upgraded', {
      tenantId: req.tenantId,
      oldTier,
      newTier: tier,
      billingCycle,
      upgradedBy: req.userId
    });

    res.json({
      success: true,
      message: 'Subscription upgraded successfully',
      data: {
        subscriptionTier: tier,
        billingCycle: company.billingCycle,
        features: company.features,
        limits: company.limits
      }
    });
  });

  /**
   * Get activity log
   */
  getActivityLog = asyncHandler(async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      throw new AuthorizationError('Tenant context not found');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const action = req.query.action as string;
    const from = req.query.from as string;
    const to = req.query.to as string;

    // This would typically query an audit log collection
    // For now, return a placeholder response
    const activities = [
      {
        id: '1',
        action: 'user.login',
        userId: req.userId,
        timestamp: new Date(),
        details: { ip: req.ip, userAgent: req.headers['user-agent'] }
      }
    ];

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          page,
          limit,
          total: activities.length,
          pages: 1
        }
      }
    });
  });
}

export default TenantController;