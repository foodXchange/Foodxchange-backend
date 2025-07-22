import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { advancedRateLimitingService } from '../services/security/AdvancedRateLimitingService';

type RateLimitingRequest = Request & {
  user?: {
    id: string;
    companyId: string;
    role: string;
    tier?: string;
  };
};

class RateLimitingController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('RateLimitingController');
  }

  /**
   * Get all rate limiting rules
   */
  async getRules(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const rules = advancedRateLimitingService.getRules();

      res.json({
        success: true,
        data: {
          rules,
          total: rules.length
        }
      });
    } catch (error) {
      this.logger.error('Failed to get rate limiting rules:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_RULES_FAILED',
          message: 'Failed to retrieve rate limiting rules'
        }
      });
    }
  }

  /**
   * Get a specific rule
   */
  async getRule(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;

      const rule = advancedRateLimitingService.getRule(ruleId);
      if (!rule) {
        res.status(404).json({
          success: false,
          error: {
            code: 'RULE_NOT_FOUND',
            message: 'Rate limiting rule not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: rule
      });
    } catch (error) {
      this.logger.error('Failed to get rate limiting rule:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_RULE_FAILED',
          message: 'Failed to retrieve rate limiting rule'
        }
      });
    }
  }

  /**
   * Create a new rate limiting rule
   */
  async createRule(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const {
        name,
        windowMs,
        maxRequests,
        tier,
        endpoint,
        method,
        userRole,
        ipWhitelist,
        ipBlacklist,
        customKey,
        priority,
        enabled,
        burstAllowance,
        queueSize,
        backoffStrategy,
        metadata
      } = req.body;

      const rule = await advancedRateLimitingService.addRule({
        name,
        windowMs,
        maxRequests,
        tier,
        endpoint,
        method,
        userRole,
        ipWhitelist,
        ipBlacklist,
        customKey,
        priority: priority || 5,
        enabled: enabled !== false,
        burstAllowance,
        queueSize,
        backoffStrategy: backoffStrategy || 'exponential',
        metadata: metadata || {}
      });

      res.status(201).json({
        success: true,
        data: rule
      });
    } catch (error) {
      this.logger.error('Failed to create rate limiting rule:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_RULE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create rate limiting rule'
        }
      });
    }
  }

  /**
   * Update a rate limiting rule
   */
  async updateRule(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const updates = req.body;

      const updatedRule = await advancedRateLimitingService.updateRule(ruleId, updates);
      if (!updatedRule) {
        res.status(404).json({
          success: false,
          error: {
            code: 'RULE_NOT_FOUND',
            message: 'Rate limiting rule not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: updatedRule
      });
    } catch (error) {
      this.logger.error('Failed to update rate limiting rule:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_RULE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update rate limiting rule'
        }
      });
    }
  }

  /**
   * Delete a rate limiting rule
   */
  async deleteRule(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;

      const deleted = await advancedRateLimitingService.deleteRule(ruleId);
      if (!deleted) {
        res.status(404).json({
          success: false,
          error: {
            code: 'RULE_NOT_FOUND',
            message: 'Rate limiting rule not found'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: {
          message: 'Rate limiting rule deleted successfully',
          ruleId
        }
      });
    } catch (error) {
      this.logger.error('Failed to delete rate limiting rule:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETE_RULE_FAILED',
          message: 'Failed to delete rate limiting rule'
        }
      });
    }
  }

  /**
   * Whitelist an IP address
   */
  async whitelistIP(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ipAddress } = req.params;
      const { duration } = req.body;

      await advancedRateLimitingService.whitelistIP(ipAddress, duration);

      res.json({
        success: true,
        data: {
          message: 'IP address whitelisted successfully',
          ipAddress,
          duration: duration || 86400
        }
      });
    } catch (error) {
      this.logger.error('Failed to whitelist IP:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WHITELIST_FAILED',
          message: 'Failed to whitelist IP address'
        }
      });
    }
  }

  /**
   * Blacklist an IP address
   */
  async blacklistIP(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ipAddress } = req.params;
      const { reason, duration } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          error: {
            code: 'REASON_REQUIRED',
            message: 'Reason is required for blacklisting'
          }
        });
        return;
      }

      await advancedRateLimitingService.blacklistIP(ipAddress, reason, duration);

      res.json({
        success: true,
        data: {
          message: 'IP address blacklisted successfully',
          ipAddress,
          reason,
          duration: duration || 86400
        }
      });
    } catch (error) {
      this.logger.error('Failed to blacklist IP:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BLACKLIST_FAILED',
          message: 'Failed to blacklist IP address'
        }
      });
    }
  }

  /**
   * Check IP address status
   */
  async checkIPStatus(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ipAddress } = req.params;

      const [whitelisted, blacklistCheck] = await Promise.all([
        advancedRateLimitingService.isWhitelisted(ipAddress),
        advancedRateLimitingService.isBlacklisted(ipAddress)
      ]);

      res.json({
        success: true,
        data: {
          ipAddress,
          whitelisted,
          blacklisted: blacklistCheck.blocked,
          blacklistReason: blacklistCheck.reason,
          status: whitelisted ? 'whitelisted' : (blacklistCheck.blocked ? 'blacklisted' : 'normal')
        }
      });
    } catch (error) {
      this.logger.error('Failed to check IP status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CHECK_IP_FAILED',
          message: 'Failed to check IP address status'
        }
      });
    }
  }

  /**
   * Get remaining quota for a user or IP
   */
  async getQuota(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { ruleId } = req.params;
      const { userId, ipAddress } = req.query;

      const rule = advancedRateLimitingService.getRule(ruleId);
      if (!rule) {
        res.status(404).json({
          success: false,
          error: {
            code: 'RULE_NOT_FOUND',
            message: 'Rate limiting rule not found'
          }
        });
        return;
      }

      const key = userId ? `user:${userId}` : `ip:${ipAddress}`;
      const quota = await advancedRateLimitingService.getRemainingQuota(key, rule);

      res.json({
        success: true,
        data: {
          ruleId,
          key,
          ...quota
        }
      });
    } catch (error) {
      this.logger.error('Failed to get quota:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_QUOTA_FAILED',
          message: 'Failed to get remaining quota'
        }
      });
    }
  }

  /**
   * Reset rate limit for a user or IP
   */
  async resetRateLimit(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { key } = req.params;

      await advancedRateLimitingService.resetRateLimit(key);

      res.json({
        success: true,
        data: {
          message: 'Rate limit reset successfully',
          key
        }
      });
    } catch (error) {
      this.logger.error('Failed to reset rate limit:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESET_FAILED',
          message: 'Failed to reset rate limit'
        }
      });
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getStatistics(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { timeWindow } = req.query;
      const window = timeWindow ? parseInt(timeWindow as string) : 3600;

      const statistics = await advancedRateLimitingService.getStatistics(window);

      res.json({
        success: true,
        data: {
          timeWindow: window,
          ...statistics,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get statistics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_STATISTICS_FAILED',
          message: 'Failed to retrieve rate limiting statistics'
        }
      });
    }
  }

  /**
   * Get system load for adaptive rate limiting
   */
  async getSystemLoad(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const systemLoad = await advancedRateLimitingService.getSystemLoad();

      res.json({
        success: true,
        data: {
          systemLoad,
          level: systemLoad < 0.3 ? 'low' : systemLoad < 0.6 ? 'medium' : 'high',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to get system load:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_SYSTEM_LOAD_FAILED',
          message: 'Failed to get system load'
        }
      });
    }
  }

  /**
   * Test rate limiting for a specific context
   */
  async testRateLimit(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const {
        userId,
        userRole,
        userTier,
        ipAddress,
        endpoint,
        method,
        userAgent,
        apiKey,
        companyId
      } = req.body;

      const context = {
        userId,
        userRole,
        userTier,
        ipAddress: ipAddress || req.ip,
        endpoint: endpoint || req.path,
        method: method || req.method,
        userAgent,
        apiKey,
        companyId,
        timestamp: new Date()
      };

      const result = await advancedRateLimitingService.checkRateLimit(context);

      res.json({
        success: true,
        data: {
          context,
          result,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      this.logger.error('Failed to test rate limit:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TEST_RATE_LIMIT_FAILED',
          message: 'Failed to test rate limit'
        }
      });
    }
  }

  /**
   * Get rate limiting configuration
   */
  async getConfiguration(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const configuration = {
        defaultRules: advancedRateLimitingService.getRules().filter(rule =>
          ['global', 'api_general', 'auth_strict'].includes(rule.id)
        ),
        features: {
          adaptiveRateLimit: true,
          burstAllowance: true,
          requestThrottling: true,
          ipWhitelisting: true,
          ipBlacklisting: true,
          statisticsTracking: true
        },
        limits: {
          maxRules: 100,
          maxQueueSize: 100,
          maxBurstSize: 10,
          maxWindowMs: 3600000, // 1 hour
          maxRequestsPerWindow: 10000
        }
      };

      res.json({
        success: true,
        data: configuration
      });
    } catch (error) {
      this.logger.error('Failed to get configuration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_CONFIGURATION_FAILED',
          message: 'Failed to get rate limiting configuration'
        }
      });
    }
  }

  /**
   * Bulk operations for rules
   */
  async bulkOperations(req: RateLimitingRequest, res: Response): Promise<void> {
    try {
      const { operation, ruleIds, data } = req.body;

      if (!operation || !ruleIds || !Array.isArray(ruleIds)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BULK_REQUEST',
            message: 'Operation and ruleIds array are required'
          }
        });
        return;
      }

      const results = [];

      switch (operation) {
        case 'enable':
          for (const ruleId of ruleIds) {
            try {
              const result = await advancedRateLimitingService.updateRule(ruleId, { enabled: true });
              results.push({ ruleId, success: !!result });
            } catch (error) {
              results.push({ ruleId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
          }
          break;

        case 'disable':
          for (const ruleId of ruleIds) {
            try {
              const result = await advancedRateLimitingService.updateRule(ruleId, { enabled: false });
              results.push({ ruleId, success: !!result });
            } catch (error) {
              results.push({ ruleId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
          }
          break;

        case 'delete':
          for (const ruleId of ruleIds) {
            try {
              const result = await advancedRateLimitingService.deleteRule(ruleId);
              results.push({ ruleId, success: result });
            } catch (error) {
              results.push({ ruleId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
          }
          break;

        case 'update':
          if (!data) {
            res.status(400).json({
              success: false,
              error: {
                code: 'UPDATE_DATA_REQUIRED',
                message: 'Update data is required for bulk update operation'
              }
            });
            return;
          }

          for (const ruleId of ruleIds) {
            try {
              const result = await advancedRateLimitingService.updateRule(ruleId, data);
              results.push({ ruleId, success: !!result });
            } catch (error) {
              results.push({ ruleId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
            }
          }
          break;

        default:
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_OPERATION',
              message: 'Valid operations are: enable, disable, delete, update'
            }
          });
          return;
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      res.json({
        success: true,
        data: {
          operation,
          totalRules: ruleIds.length,
          successCount,
          failureCount,
          results
        }
      });
    } catch (error) {
      this.logger.error('Failed to perform bulk operations:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BULK_OPERATION_FAILED',
          message: 'Failed to perform bulk operations'
        }
      });
    }
  }
}

export const rateLimitingController = new RateLimitingController();
