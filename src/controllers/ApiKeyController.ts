import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';

import { redisClient } from '../config/redis';
import { ValidationError } from '../core/errors';
import { Logger } from '../core/logging/logger';
import {
  createAPIKey,
  revokeAPIKey,
  listAPIKeys,
  getAPIKeyUsage,
  validateAPIKeyFormat,
  hashAPIKey,
  generateAPIKey,
  cacheAPIKey,
  getCachedAPIKey
} from '../middleware/apiKeyAuth';

const logger = new Logger('ApiKeyController');

// Placeholder for API key storage - in production, use a dedicated collection
interface StoredAPIKey {
  id: string;
  hashedKey: string;
  tenantId: string;
  name: string;
  permissions: string[];
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  rateLimit?: number;
  allowedIPs?: string[];
  allowedDomains?: string[];
}

export class ApiKeyController {
  /**
   * List all API keys for the tenant
   */
  listApiKeys = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    // In production, query from database
    const keys = await this.getStoredApiKeys(req.tenantId, status);

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedKeys = keys.slice(startIndex, endIndex);

    // Remove sensitive data
    const sanitizedKeys = paginatedKeys.map(key => ({
      id: key.id,
      name: key.name,
      permissions: key.permissions,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
      rateLimit: key.rateLimit,
      hasRestrictions: !!(key.allowedIPs?.length || key.allowedDomains?.length)
    }));

    res.json({
      success: true,
      data: {
        keys: sanitizedKeys,
        pagination: {
          page,
          limit,
          total: keys.length,
          pages: Math.ceil(keys.length / limit)
        }
      }
    });
  });

  /**
   * Create a new API key
   */
  createApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { name, permissions, expiresIn, rateLimit, allowedIPs, allowedDomains } = req.body;

    // Check tenant API key limit
    const existingKeys = await this.getStoredApiKeys(req.tenantId);
    const activeKeys = existingKeys.filter(k => k.isActive).length;

    const maxKeys = req.tenantContext?.subscriptionTier === 'enterprise' ? 100 :
      req.tenantContext?.subscriptionTier === 'premium' ? 50 :
        req.tenantContext?.subscriptionTier === 'standard' ? 20 : 10;

    if (activeKeys >= maxKeys) {
      throw new ValidationError(`API key limit reached. Your tier allows ${maxKeys} active keys.`);
    }

    // Create the API key
    const result = await createAPIKey(
      req.tenantId,
      name,
      permissions,
      req.userId,
      {
        expiresIn,
        rateLimit,
        allowedIPs,
        allowedDomains
      }
    );

    // Store in database (placeholder)
    await this.storeApiKey({
      ...result.keyData,
      hashedKey: result.keyData.key,
      createdBy: req.userId
    });

    logger.info('API key created', {
      keyId: result.keyData.id,
      tenantId: req.tenantId,
      name,
      permissions,
      createdBy: req.userId
    });

    res.status(201).json({
      success: true,
      message: 'API key created successfully. Store this key securely as it will not be shown again.',
      data: {
        id: result.keyData.id,
        key: result.key, // Only shown once
        name: result.keyData.name,
        permissions: result.keyData.permissions,
        expiresAt: result.keyData.expiresAt,
        rateLimit: result.keyData.rateLimit
      }
    });
  });

  /**
   * Get API key details
   */
  getApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;

    const apiKey = await this.getStoredApiKey(keyId, req.tenantId);

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    res.json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        isActive: apiKey.isActive,
        rateLimit: apiKey.rateLimit,
        allowedIPs: apiKey.allowedIPs,
        allowedDomains: apiKey.allowedDomains,
        createdBy: apiKey.createdBy
      }
    });
  });

  /**
   * Update API key
   */
  updateApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;
    const { name, permissions, rateLimit, allowedIPs, allowedDomains } = req.body;

    const apiKey = await this.getStoredApiKey(keyId, req.tenantId);

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    // Update fields
    if (name !== undefined) apiKey.name = name;
    if (permissions !== undefined) apiKey.permissions = permissions;
    if (rateLimit !== undefined) apiKey.rateLimit = rateLimit;
    if (allowedIPs !== undefined) apiKey.allowedIPs = allowedIPs;
    if (allowedDomains !== undefined) apiKey.allowedDomains = allowedDomains;

    // Update in cache
    await cacheAPIKey(apiKey.hashedKey, {
      id: apiKey.id,
      key: apiKey.hashedKey,
      tenantId: apiKey.tenantId,
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdBy: apiKey.createdBy,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      allowedIPs: apiKey.allowedIPs,
      allowedDomains: apiKey.allowedDomains
    });

    logger.info('API key updated', {
      keyId,
      tenantId: req.tenantId,
      updatedBy: req.userId,
      changes: { name, permissions, rateLimit, allowedIPs, allowedDomains }
    });

    res.json({
      success: true,
      message: 'API key updated successfully',
      data: {
        id: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        allowedIPs: apiKey.allowedIPs,
        allowedDomains: apiKey.allowedDomains
      }
    });
  });

  /**
   * Revoke API key
   */
  revokeApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;

    const apiKey = await this.getStoredApiKey(keyId, req.tenantId);

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    // Revoke the key
    await revokeAPIKey(keyId, req.userId);

    // Update in storage
    apiKey.isActive = false;

    logger.info('API key revoked', {
      keyId,
      tenantId: req.tenantId,
      revokedBy: req.userId
    });

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  });

  /**
   * Regenerate API key
   */
  regenerateApiKey = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;

    const apiKey = await this.getStoredApiKey(keyId, req.tenantId);

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    // Revoke old key
    await revokeAPIKey(keyId, req.userId);

    // Generate new key
    const newKey = generateAPIKey();
    const hashedNewKey = hashAPIKey(newKey);

    // Update stored key
    apiKey.hashedKey = hashedNewKey;
    apiKey.createdAt = new Date();
    apiKey.lastUsedAt = undefined;

    // Cache new key
    await cacheAPIKey(hashedNewKey, {
      id: apiKey.id,
      key: hashedNewKey,
      tenantId: apiKey.tenantId,
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdBy: apiKey.createdBy,
      createdAt: apiKey.createdAt,
      isActive: apiKey.isActive,
      rateLimit: apiKey.rateLimit,
      allowedIPs: apiKey.allowedIPs,
      allowedDomains: apiKey.allowedDomains,
      expiresAt: apiKey.expiresAt
    });

    logger.info('API key regenerated', {
      keyId,
      tenantId: req.tenantId,
      regeneratedBy: req.userId
    });

    res.json({
      success: true,
      message: 'API key regenerated successfully. Store this key securely as it will not be shown again.',
      data: {
        id: apiKey.id,
        key: newKey, // Only shown once
        name: apiKey.name
      }
    });
  });

  /**
   * Get API key usage statistics
   */
  getApiKeyUsage = asyncHandler(async (req: Request, res: Response) => {
    const { keyId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    const apiKey = await this.getStoredApiKey(keyId, req.tenantId);

    if (!apiKey) {
      throw new ValidationError('API key not found');
    }

    const usage = await getAPIKeyUsage(apiKey.hashedKey, days);

    // Calculate statistics
    const dates = Object.keys(usage).sort();
    const totalRequests = Object.values(usage).reduce((sum: number, count: unknown) => sum + Number(count || 0), 0);
    const averagePerDay = Number(totalRequests) / Number(days);
    const peakDay = dates.reduce((max, date) =>
      Number(usage[date] || 0) > Number(usage[max] || 0) ? date : max, dates[0]
    );

    res.json({
      success: true,
      data: {
        keyId,
        period: {
          days,
          startDate: dates[dates.length - 1],
          endDate: dates[0]
        },
        statistics: {
          totalRequests,
          averagePerDay: Math.round(averagePerDay),
          peakDay,
          peakRequests: usage[peakDay] || 0
        },
        daily: usage
      }
    });
  });

  /**
   * Validate API key
   */
  validateApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { key } = req.body;

    if (!validateAPIKeyFormat(key)) {
      res.json({
        success: true,
        data: {
          valid: false,
          reason: 'Invalid format'
        }
      });
      return;
    }

    const hashedKey = hashAPIKey(key);
    const keyData = await getCachedAPIKey(hashedKey);

    if (!keyData) {
      res.json({
        success: true,
        data: {
          valid: false,
          reason: 'Key not found'
        }
      });
      return;
    }

    if (!keyData.isActive) {
      res.json({
        success: true,
        data: {
          valid: false,
          reason: 'Key is inactive'
        }
      });
      return;
    }

    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      res.json({
        success: true,
        data: {
          valid: false,
          reason: 'Key has expired'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        valid: true,
        tenantId: keyData.tenantId,
        permissions: keyData.permissions,
        rateLimit: keyData.rateLimit
      }
    });
  });

  // Helper methods (would be replaced with database queries in production)

  private async getStoredApiKeys(tenantId: string, status?: string): Promise<StoredAPIKey[]> {
    // Placeholder - in production, query from database
    const pattern = `api_key_store:${tenantId}:*`;
    const keys = await redisClient.keys(pattern);
    const apiKeys: StoredAPIKey[] = [];

    for (const key of keys) {
      const data = await redisClient.get(key);
      if (data) {
        const apiKey = JSON.parse(data) as StoredAPIKey;

        if (status === 'active' && !apiKey.isActive) continue;
        if (status === 'inactive' && apiKey.isActive) continue;
        if (status === 'expired' && (!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date())) continue;

        apiKeys.push(apiKey);
      }
    }

    return apiKeys.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async getStoredApiKey(keyId: string, tenantId: string): Promise<StoredAPIKey | null> {
    // Placeholder - in production, query from database
    const key = `api_key_store:${tenantId}:${keyId}`;
    const data = await redisClient.get(key);

    if (data) {
      return JSON.parse(data) as StoredAPIKey;
    }

    return null;
  }

  private async storeApiKey(apiKey: StoredAPIKey): Promise<void> {
    // Placeholder - in production, store in database
    const key = `api_key_store:${apiKey.tenantId}:${apiKey.id}`;
    await redisClient.setex(key, 90 * 24 * 60 * 60, JSON.stringify(apiKey)); // 90 days
  }
}

export default ApiKeyController;
