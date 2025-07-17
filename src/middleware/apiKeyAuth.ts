import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Logger } from '../core/logging/logger';
import { AuthenticationError, AuthorizationError } from '../core/errors';
import { redisClient } from '../config/redis';
import { Company } from '../models/Company';

const logger = new Logger('APIKeyAuth');

// Extend Request interface to include API key information
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        tenantId: string;
        name: string;
        permissions: string[];
        rateLimit?: number;
        isValid: boolean;
      };
    }
  }
}

export interface APIKey {
  id: string;
  key: string;
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

/**
 * Generate a secure API key
 */
export const generateAPIKey = (prefix: string = 'fx'): string => {
  const randomBytes = crypto.randomBytes(32);
  const key = randomBytes.toString('base64url');
  return `${prefix}_${key}`;
};

/**
 * Hash API key for storage
 */
export const hashAPIKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

/**
 * Validate API key format
 */
export const validateAPIKeyFormat = (key: string): boolean => {
  const pattern = /^fx_[A-Za-z0-9_-]{43}$/;
  return pattern.test(key);
};

/**
 * Store API key in cache
 */
export const cacheAPIKey = async (hashedKey: string, keyData: APIKey): Promise<void> => {
  const cacheKey = `api_key:${hashedKey}`;
  const ttl = 3600; // 1 hour cache
  
  await redisClient.setex(
    cacheKey,
    ttl,
    JSON.stringify(keyData)
  );
};

/**
 * Get API key from cache
 */
export const getCachedAPIKey = async (hashedKey: string): Promise<APIKey | null> => {
  const cacheKey = `api_key:${hashedKey}`;
  const cached = await redisClient.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  return null;
};

/**
 * API Key authentication middleware
 */
export const apiKeyAuth = (requiredPermissions: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract API key from headers
      const apiKey = req.headers['x-api-key'] as string || 
                     req.headers['authorization']?.replace('Bearer ', '') ||
                     req.query.api_key as string;

      if (!apiKey) {
        throw new AuthenticationError('API key required');
      }

      // Validate format
      if (!validateAPIKeyFormat(apiKey)) {
        throw new AuthenticationError('Invalid API key format');
      }

      // Hash the key for lookup
      const hashedKey = hashAPIKey(apiKey);

      // Check cache first
      let keyData = await getCachedAPIKey(hashedKey);

      if (!keyData) {
        // Fetch from database (would be from a dedicated API keys collection)
        // For now, using company settings
        const companies = await Company.find({
          'tenantSettings.apiAccessEnabled': true
        });

        // This is a placeholder - in production, use a dedicated API keys collection
        const company = companies.find(c => 
          c.tenantSettings.webhookEndpoints?.includes(hashedKey)
        );

        if (!company) {
          throw new AuthenticationError('Invalid API key');
        }

        keyData = {
          id: hashedKey.substring(0, 8),
          key: hashedKey,
          tenantId: company._id.toString(),
          name: 'Default API Key',
          permissions: ['read', 'write'],
          createdBy: 'system',
          createdAt: new Date(),
          isActive: true
        };

        // Cache the key data
        await cacheAPIKey(hashedKey, keyData);
      }

      // Validate key status
      if (!keyData.isActive) {
        throw new AuthenticationError('API key is inactive');
      }

      // Check expiration
      if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
        throw new AuthenticationError('API key has expired');
      }

      // Validate IP restrictions
      if (keyData.allowedIPs && keyData.allowedIPs.length > 0) {
        const clientIP = req.ip;
        if (!keyData.allowedIPs.includes(clientIP)) {
          logger.warn('API key used from unauthorized IP', {
            keyId: keyData.id,
            clientIP,
            allowedIPs: keyData.allowedIPs
          });
          throw new AuthorizationError('API key not authorized from this IP');
        }
      }

      // Validate domain restrictions
      if (keyData.allowedDomains && keyData.allowedDomains.length > 0) {
        const origin = req.headers.origin || req.headers.referer;
        if (origin) {
          const domain = new URL(origin).hostname;
          if (!keyData.allowedDomains.some(d => domain.endsWith(d))) {
            logger.warn('API key used from unauthorized domain', {
              keyId: keyData.id,
              domain,
              allowedDomains: keyData.allowedDomains
            });
            throw new AuthorizationError('API key not authorized from this domain');
          }
        }
      }

      // Check required permissions
      if (requiredPermissions.length > 0) {
        const hasPermissions = requiredPermissions.every(perm => 
          keyData.permissions.includes(perm) || keyData.permissions.includes('*')
        );

        if (!hasPermissions) {
          throw new AuthorizationError('Insufficient API key permissions');
        }
      }

      // Update last used timestamp (async, don't wait)
      updateAPIKeyUsage(hashedKey).catch(err => 
        logger.error('Failed to update API key usage:', err)
      );

      // Attach API key info to request
      req.apiKey = keyData;
      req.tenantId = keyData.tenantId;

      // Log API key usage
      logger.info('API key authenticated', {
        keyId: keyData.id,
        tenantId: keyData.tenantId,
        permissions: keyData.permissions,
        ip: req.ip,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('API key authentication failed:', error);
      
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'API_KEY_AUTH_FAILED',
            message: error.message
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'API_KEY_AUTH_ERROR',
          message: 'API key authentication error'
        }
      });
    }
  };
};

/**
 * Update API key usage statistics
 */
async function updateAPIKeyUsage(hashedKey: string): Promise<void> {
  const usageKey = `api_key_usage:${hashedKey}:${new Date().toISOString().slice(0, 10)}`;
  await redisClient.incr(usageKey);
  await redisClient.expire(usageKey, 30 * 24 * 60 * 60); // Keep for 30 days
}

/**
 * Optional API key authentication (allows both API key and JWT)
 */
export const optionalApiKeyAuth = (requiredPermissions: string[] = []) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string || 
                   req.query.api_key as string;

    if (apiKey) {
      // If API key is provided, validate it
      return apiKeyAuth(requiredPermissions)(req, res, next);
    }

    // No API key provided, continue to next middleware (e.g., JWT auth)
    next();
  };
};

/**
 * Create a new API key for a tenant
 */
export const createAPIKey = async (
  tenantId: string,
  name: string,
  permissions: string[],
  createdBy: string,
  options?: {
    expiresIn?: number; // days
    rateLimit?: number;
    allowedIPs?: string[];
    allowedDomains?: string[];
  }
): Promise<{ key: string; keyData: APIKey }> => {
  const key = generateAPIKey();
  const hashedKey = hashAPIKey(key);
  
  const keyData: APIKey = {
    id: crypto.randomBytes(8).toString('hex'),
    key: hashedKey,
    tenantId,
    name,
    permissions,
    createdBy,
    createdAt: new Date(),
    isActive: true,
    rateLimit: options?.rateLimit,
    allowedIPs: options?.allowedIPs,
    allowedDomains: options?.allowedDomains
  };

  if (options?.expiresIn) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + options.expiresIn);
    keyData.expiresAt = expiresAt;
  }

  // Store in database (placeholder - would use dedicated collection)
  await cacheAPIKey(hashedKey, keyData);

  logger.info('API key created', {
    keyId: keyData.id,
    tenantId,
    name,
    permissions,
    createdBy
  });

  return { key, keyData };
};

/**
 * Revoke an API key
 */
export const revokeAPIKey = async (keyId: string, revokedBy: string): Promise<void> => {
  // Remove from cache
  const cachePattern = `api_key:*`;
  const keys = await redisClient.keys(cachePattern);
  
  for (const cacheKey of keys) {
    const keyData = await redisClient.get(cacheKey);
    if (keyData) {
      const parsed = JSON.parse(keyData);
      if (parsed.id === keyId) {
        await redisClient.del(cacheKey);
        logger.info('API key revoked', {
          keyId,
          revokedBy
        });
        break;
      }
    }
  }
};

/**
 * List API keys for a tenant
 */
export const listAPIKeys = async (tenantId: string): Promise<APIKey[]> => {
  // This would query a dedicated API keys collection
  // For now, return empty array as placeholder
  return [];
};

/**
 * Get API key usage statistics
 */
export const getAPIKeyUsage = async (keyId: string, days: number = 30): Promise<any> => {
  const usage: any = {};
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    
    const usageKey = `api_key_usage:${keyId}:${dateStr}`;
    const count = await redisClient.get(usageKey);
    
    usage[dateStr] = parseInt(count || '0');
  }
  
  return usage;
};

export default {
  generateAPIKey,
  hashAPIKey,
  validateAPIKeyFormat,
  apiKeyAuth,
  optionalApiKeyAuth,
  createAPIKey,
  revokeAPIKey,
  listAPIKeys,
  getAPIKeyUsage
};