import { Logger } from '../../core/logging/logger';
import { optimizedCache } from '../cache/OptimizedCacheService';

interface RateLimitRule {
  id: string;
  name: string;
  windowMs: number;
  maxRequests: number;
  tier?: string;
  endpoint?: string;
  method?: string;
  userRole?: string;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  customKey?: string;
  priority: number;
  enabled: boolean;
  resetTime?: Date;
  burstAllowance?: number;
  queueSize?: number;
  backoffStrategy?: 'linear' | 'exponential' | 'constant';
  metadata?: Record<string, any>;
}

interface RateLimitContext {
  userId?: string;
  userRole?: string;
  userTier?: string;
  ipAddress: string;
  endpoint: string;
  method: string;
  userAgent?: string;
  apiKey?: string;
  companyId?: string;
  timestamp: Date;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
  rule?: RateLimitRule;
  queuePosition?: number;
  estimatedWaitTime?: number;
  throttled: boolean;
  blocked: boolean;
  reason?: string;
}

interface ThrottleConfig {
  enabled: boolean;
  queueSize: number;
  maxWaitTime: number;
  priorityLevels: string[];
  backoffStrategy: 'linear' | 'exponential' | 'constant';
  backoffBase: number;
}

interface BurstConfig {
  enabled: boolean;
  maxBurstSize: number;
  burstRefillRate: number;
  burstWindow: number;
}

interface AdaptiveConfig {
  enabled: boolean;
  baseLimit: number;
  loadThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  adjustmentFactors: {
    low: number;
    medium: number;
    high: number;
  };
}

export class AdvancedRateLimitingService {
  private readonly logger: Logger;
  private readonly rules: Map<string, RateLimitRule> = new Map();
  private readonly requestQueue: Map<string, Array<{ timestamp: Date; resolve: Function; reject: Function }>> = new Map();
  private readonly burstTokens: Map<string, { tokens: number; lastRefill: Date }> = new Map();

  private readonly throttleConfig: ThrottleConfig = {
    enabled: true,
    queueSize: 100,
    maxWaitTime: 30000, // 30 seconds
    priorityLevels: ['premium', 'standard', 'basic'],
    backoffStrategy: 'exponential',
    backoffBase: 1000
  };

  private readonly burstConfig: BurstConfig = {
    enabled: true,
    maxBurstSize: 10,
    burstRefillRate: 1,
    burstWindow: 60000 // 1 minute
  };

  private readonly adaptiveConfig: AdaptiveConfig = {
    enabled: true,
    baseLimit: 100,
    loadThresholds: {
      low: 0.3,
      medium: 0.6,
      high: 0.8
    },
    adjustmentFactors: {
      low: 1.5,
      medium: 1.0,
      high: 0.5
    }
  };

  constructor() {
    this.logger = new Logger('AdvancedRateLimitingService');
    this.initializeDefaultRules();
    this.startQueueProcessor();
    this.startBurstTokenRefill();
  }

  /**
   * Check rate limit for a request
   */
  async checkRateLimit(context: RateLimitContext): Promise<RateLimitResult> {
    try {
      // Find applicable rules
      const applicableRules = await this.findApplicableRules(context);

      if (applicableRules.length === 0) {
        return this.createAllowedResult(1000, 999, new Date(Date.now() + 60000));
      }

      // Sort by priority (highest first)
      applicableRules.sort((a, b) => b.priority - a.priority);

      // Check each rule
      for (const rule of applicableRules) {
        const result = await this.checkRule(rule, context);

        if (!result.allowed) {
          // Check if throttling is enabled and queue has space
          if (this.throttleConfig.enabled && this.canQueue(context)) {
            return await this.handleThrottling(rule, context);
          }

          return result;
        }
      }

      // All rules passed, apply most restrictive limit
      const mostRestrictive = this.getMostRestrictiveRule(applicableRules, context);
      return await this.checkRule(mostRestrictive, context);
    } catch (error) {
      this.logger.error('Rate limit check failed:', error);
      // Fail open - allow request
      return this.createAllowedResult(1000, 999, new Date(Date.now() + 60000));
    }
  }

  /**
   * Add a new rate limiting rule
   */
  async addRule(rule: Omit<RateLimitRule, 'id'>): Promise<RateLimitRule> {
    const newRule: RateLimitRule = {
      id: this.generateRuleId(),
      ...rule
    };

    this.rules.set(newRule.id, newRule);
    await this.cacheRule(newRule);

    this.logger.info(`Rate limiting rule added: ${newRule.id} - ${newRule.name}`);
    return newRule;
  }

  /**
   * Update an existing rule
   */
  async updateRule(ruleId: string, updates: Partial<RateLimitRule>): Promise<RateLimitRule | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return null;
    }

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    await this.cacheRule(updatedRule);

    this.logger.info(`Rate limiting rule updated: ${ruleId}`);
    return updatedRule;
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      await optimizedCache.del(`rate_limit_rule:${ruleId}`);
      this.logger.info(`Rate limiting rule deleted: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * Get all rules
   */
  getRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): RateLimitRule | null {
    return this.rules.get(ruleId) || null;
  }

  /**
   * Whitelist an IP address
   */
  async whitelistIP(ipAddress: string, duration?: number): Promise<void> {
    const key = `ip_whitelist:${ipAddress}`;
    await optimizedCache.set(key, true, duration || 86400); // Default 24 hours
    this.logger.info(`IP whitelisted: ${ipAddress}`);
  }

  /**
   * Blacklist an IP address
   */
  async blacklistIP(ipAddress: string, reason: string, duration?: number): Promise<void> {
    const key = `ip_blacklist:${ipAddress}`;
    const data = { reason, timestamp: new Date() };
    await optimizedCache.set(key, data, duration || 86400); // Default 24 hours
    this.logger.warn(`IP blacklisted: ${ipAddress} - ${reason}`);
  }

  /**
   * Check if IP is whitelisted
   */
  async isWhitelisted(ipAddress: string): Promise<boolean> {
    const key = `ip_whitelist:${ipAddress}`;
    const whitelisted = await optimizedCache.get(key);
    return !!whitelisted;
  }

  /**
   * Check if IP is blacklisted
   */
  async isBlacklisted(ipAddress: string): Promise<{ blocked: boolean; reason?: string }> {
    const key = `ip_blacklist:${ipAddress}`;
    const blacklistData = await optimizedCache.get(key);

    if (blacklistData) {
      return {
        blocked: true,
        reason: blacklistData.reason || 'IP address blocked'
      };
    }

    return { blocked: false };
  }

  /**
   * Get current system load for adaptive rate limiting
   */
  async getSystemLoad(): Promise<number> {
    try {
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      const cpuUsage = require('os').loadavg()[0];

      const memoryLoad = (totalMemory - freeMemory) / totalMemory;
      const normalizedCpuLoad = Math.min(cpuUsage / require('os').cpus().length, 1);

      // Weighted average of memory and CPU load
      return (memoryLoad * 0.4 + normalizedCpuLoad * 0.6);
    } catch (error) {
      this.logger.warn('Failed to get system load:', error);
      return 0.5; // Default medium load
    }
  }

  /**
   * Get rate limiting statistics
   */
  async getStatistics(timeWindow: number = 3600): Promise<{
    totalRequests: number;
    blockedRequests: number;
    throttledRequests: number;
    topBlockedIPs: Array<{ ip: string; count: number }>;
    ruleHitCounts: Array<{ ruleId: string; hits: number }>;
    averageResponseTime: number;
  }> {
    try {
      const stats = {
        totalRequests: 0,
        blockedRequests: 0,
        throttledRequests: 0,
        topBlockedIPs: [],
        ruleHitCounts: [],
        averageResponseTime: 0
      };

      // Get statistics from cache
      const totalKey = `stats:total_requests:${Math.floor(Date.now() / 1000 / 60)}`; // Per minute
      const blockedKey = `stats:blocked_requests:${Math.floor(Date.now() / 1000 / 60)}`;
      const throttledKey = `stats:throttled_requests:${Math.floor(Date.now() / 1000 / 60)}`;

      stats.totalRequests = await optimizedCache.get(totalKey) || 0;
      stats.blockedRequests = await optimizedCache.get(blockedKey) || 0;
      stats.throttledRequests = await optimizedCache.get(throttledKey) || 0;

      return stats;
    } catch (error) {
      this.logger.error('Failed to get statistics:', error);
      return {
        totalRequests: 0,
        blockedRequests: 0,
        throttledRequests: 0,
        topBlockedIPs: [],
        ruleHitCounts: [],
        averageResponseTime: 0
      };
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(key: string): Promise<void> {
    await optimizedCache.del(`rate_limit:${key}`);
    this.logger.info(`Rate limit reset for key: ${key}`);
  }

  /**
   * Get remaining quota for a key
   */
  async getRemainingQuota(key: string, rule: RateLimitRule): Promise<{ remaining: number; resetTime: Date }> {
    const cacheKey = `rate_limit:${key}`;
    const cached = await optimizedCache.get(cacheKey);

    if (!cached) {
      return {
        remaining: rule.maxRequests,
        resetTime: new Date(Date.now() + rule.windowMs)
      };
    }

    return {
      remaining: Math.max(0, rule.maxRequests - cached.count),
      resetTime: new Date(cached.resetTime)
    };
  }

  // Private methods

  private async findApplicableRules(context: RateLimitContext): Promise<RateLimitRule[]> {
    const rules: RateLimitRule[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check if rule applies to this context
      if (await this.ruleApplies(rule, context)) {
        rules.push(rule);
      }
    }

    return rules;
  }

  private async ruleApplies(rule: RateLimitRule, context: RateLimitContext): Promise<boolean> {
    // Check tier
    if (rule.tier && context.userTier !== rule.tier) {
      return false;
    }

    // Check endpoint
    if (rule.endpoint && !context.endpoint.match(rule.endpoint)) {
      return false;
    }

    // Check method
    if (rule.method && context.method !== rule.method) {
      return false;
    }

    // Check user role
    if (rule.userRole && context.userRole !== rule.userRole) {
      return false;
    }

    // Check IP whitelist
    if (rule.ipWhitelist && !rule.ipWhitelist.includes(context.ipAddress)) {
      return false;
    }

    // Check IP blacklist
    if (rule.ipBlacklist && rule.ipBlacklist.includes(context.ipAddress)) {
      return false;
    }

    return true;
  }

  private async checkRule(rule: RateLimitRule, context: RateLimitContext): Promise<RateLimitResult> {
    const key = this.generateKey(rule, context);
    const cacheKey = `rate_limit:${key}`;

    // Check if IP is whitelisted (bypasses rate limits)
    if (await this.isWhitelisted(context.ipAddress)) {
      return this.createAllowedResult(rule.maxRequests, rule.maxRequests - 1, new Date(Date.now() + rule.windowMs));
    }

    // Check if IP is blacklisted
    const blacklistCheck = await this.isBlacklisted(context.ipAddress);
    if (blacklistCheck.blocked) {
      return this.createBlockedResult(rule, blacklistCheck.reason);
    }

    // Get current count
    const cached = await optimizedCache.get(cacheKey);
    const now = Date.now();

    let count = 0;
    let resetTime = now + rule.windowMs;

    if (cached && cached.resetTime > now) {
      count = cached.count;
      resetTime = cached.resetTime;
    }

    // Apply adaptive rate limiting
    const adjustedLimit = await this.getAdaptiveLimit(rule.maxRequests);

    // Check burst allowance
    if (this.burstConfig.enabled && rule.burstAllowance) {
      const burstResult = await this.checkBurstAllowance(key, rule.burstAllowance);
      if (burstResult.allowed) {
        await this.incrementCounter(cacheKey, count + 1, resetTime);
        return this.createAllowedResult(adjustedLimit, adjustedLimit - count - 1, new Date(resetTime));
      }
    }

    // Check standard limit
    if (count >= adjustedLimit) {
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      return this.createDeniedResult(rule, adjustedLimit, 0, new Date(resetTime), retryAfter);
    }

    // Increment counter
    await this.incrementCounter(cacheKey, count + 1, resetTime);

    // Record statistics
    await this.recordStatistics(context, rule, true);

    return this.createAllowedResult(adjustedLimit, adjustedLimit - count - 1, new Date(resetTime));
  }

  private async getAdaptiveLimit(baseLimit: number): Promise<number> {
    if (!this.adaptiveConfig.enabled) {
      return baseLimit;
    }

    const systemLoad = await this.getSystemLoad();

    if (systemLoad < this.adaptiveConfig.loadThresholds.low) {
      return Math.floor(baseLimit * this.adaptiveConfig.adjustmentFactors.low);
    } else if (systemLoad < this.adaptiveConfig.loadThresholds.medium) {
      return Math.floor(baseLimit * this.adaptiveConfig.adjustmentFactors.medium);
    }
    return Math.floor(baseLimit * this.adaptiveConfig.adjustmentFactors.high);

  }

  private async checkBurstAllowance(key: string, burstSize: number): Promise<{ allowed: boolean; tokens: number }> {
    const burstKey = `burst:${key}`;
    const now = Date.now();

    let tokenData = this.burstTokens.get(burstKey);

    if (!tokenData) {
      tokenData = {
        tokens: burstSize,
        lastRefill: new Date(now)
      };
      this.burstTokens.set(burstKey, tokenData);
    }

    // Refill tokens based on time elapsed
    const timeSinceRefill = now - tokenData.lastRefill.getTime();
    const tokensToAdd = Math.floor(timeSinceRefill / this.burstConfig.burstWindow * this.burstConfig.burstRefillRate);

    if (tokensToAdd > 0) {
      tokenData.tokens = Math.min(burstSize, tokenData.tokens + tokensToAdd);
      tokenData.lastRefill = new Date(now);
    }

    if (tokenData.tokens > 0) {
      tokenData.tokens--;
      return { allowed: true, tokens: tokenData.tokens };
    }

    return { allowed: false, tokens: 0 };
  }

  private async handleThrottling(rule: RateLimitRule, context: RateLimitContext): Promise<RateLimitResult> {
    const queueKey = this.generateKey(rule, context);

    return new Promise((resolve) => {
      const queue = this.requestQueue.get(queueKey) || [];

      if (queue.length >= this.throttleConfig.queueSize) {
        // Queue is full, reject request
        resolve(this.createDeniedResult(rule, rule.maxRequests, 0, new Date(Date.now() + rule.windowMs), 0, 'Queue full'));
        return;
      }

      const queueItem = {
        timestamp: new Date(),
        resolve: (result: RateLimitResult) => resolve(result),
        reject: (error: Error) => resolve(this.createDeniedResult(rule, rule.maxRequests, 0, new Date(Date.now() + rule.windowMs), 0, error.message))
      };

      queue.push(queueItem);
      this.requestQueue.set(queueKey, queue);

      // Set timeout for request
      setTimeout(() => {
        const index = queue.indexOf(queueItem);
        if (index > -1) {
          queue.splice(index, 1);
          queueItem.resolve(this.createDeniedResult(rule, rule.maxRequests, 0, new Date(Date.now() + rule.windowMs), 0, 'Request timeout'));
        }
      }, this.throttleConfig.maxWaitTime);
    });
  }

  private canQueue(context: RateLimitContext): boolean {
    // Higher tier users get priority
    const priorityLevel = context.userTier || 'basic';
    return this.throttleConfig.priorityLevels.includes(priorityLevel);
  }

  private getMostRestrictiveRule(rules: RateLimitRule[], context: RateLimitContext): RateLimitRule {
    return rules.reduce((mostRestrictive, current) => {
      const currentRatio = current.maxRequests / current.windowMs;
      const restrictiveRatio = mostRestrictive.maxRequests / mostRestrictive.windowMs;

      return currentRatio < restrictiveRatio ? current : mostRestrictive;
    });
  }

  private generateKey(rule: RateLimitRule, context: RateLimitContext): string {
    if (rule.customKey) {
      return rule.customKey;
    }

    const parts = [rule.id];

    if (context.userId) {
      parts.push(`user:${context.userId}`);
    } else {
      parts.push(`ip:${context.ipAddress}`);
    }

    if (rule.endpoint) {
      parts.push(`endpoint:${context.endpoint}`);
    }

    return parts.join(':');
  }

  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async incrementCounter(key: string, count: number, resetTime: number): Promise<void> {
    await optimizedCache.set(key, { count, resetTime }, Math.ceil((resetTime - Date.now()) / 1000));
  }

  private async recordStatistics(context: RateLimitContext, rule: RateLimitRule, allowed: boolean): Promise<void> {
    const minute = Math.floor(Date.now() / 1000 / 60);

    // Total requests
    const totalKey = `stats:total_requests:${minute}`;
    const totalCount = await optimizedCache.get(totalKey) || 0;
    await optimizedCache.set(totalKey, totalCount + 1, 120); // 2 minutes TTL

    if (!allowed) {
      // Blocked requests
      const blockedKey = `stats:blocked_requests:${minute}`;
      const blockedCount = await optimizedCache.get(blockedKey) || 0;
      await optimizedCache.set(blockedKey, blockedCount + 1, 120);
    }

    // Rule hit count
    const ruleKey = `stats:rule_hits:${rule.id}:${minute}`;
    const ruleCount = await optimizedCache.get(ruleKey) || 0;
    await optimizedCache.set(ruleKey, ruleCount + 1, 120);
  }

  private async cacheRule(rule: RateLimitRule): Promise<void> {
    await optimizedCache.set(`rate_limit_rule:${rule.id}`, rule, 86400); // 24 hours
  }

  private createAllowedResult(limit: number, remaining: number, resetTime: Date): RateLimitResult {
    return {
      allowed: true,
      limit,
      remaining,
      resetTime,
      throttled: false,
      blocked: false
    };
  }

  private createDeniedResult(rule: RateLimitRule, limit: number, remaining: number, resetTime: Date, retryAfter?: number, reason?: string): RateLimitResult {
    return {
      allowed: false,
      limit,
      remaining,
      resetTime,
      retryAfter,
      rule,
      throttled: false,
      blocked: true,
      reason: reason || 'Rate limit exceeded'
    };
  }

  private createBlockedResult(rule: RateLimitRule, reason?: string): RateLimitResult {
    return {
      allowed: false,
      limit: 0,
      remaining: 0,
      resetTime: new Date(Date.now() + 86400000), // 24 hours
      rule,
      throttled: false,
      blocked: true,
      reason: reason || 'IP address blocked'
    };
  }

  private initializeDefaultRules(): void {
    // Global rate limit
    this.rules.set('global', {
      id: 'global',
      name: 'Global Rate Limit',
      windowMs: 60000, // 1 minute
      maxRequests: 1000,
      priority: 1,
      enabled: true
    });

    // API rate limit
    this.rules.set('api_general', {
      id: 'api_general',
      name: 'General API Rate Limit',
      windowMs: 60000,
      maxRequests: 100,
      endpoint: '/api/.*',
      priority: 5,
      enabled: true
    });

    // Authentication endpoints
    this.rules.set('auth_strict', {
      id: 'auth_strict',
      name: 'Authentication Rate Limit',
      windowMs: 900000, // 15 minutes
      maxRequests: 5,
      endpoint: '/api/auth/(login|register)',
      priority: 10,
      enabled: true
    });
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueues();
    }, 1000); // Process every second
  }

  private async processQueues(): Promise<void> {
    for (const [queueKey, queue] of this.requestQueue.entries()) {
      if (queue.length === 0) continue;

      // Try to process first item in queue
      const item = queue[0];
      const age = Date.now() - item.timestamp.getTime();

      // Check if request has expired
      if (age > this.throttleConfig.maxWaitTime) {
        queue.shift();
        item.resolve(this.createDeniedResult(
          { id: 'timeout', name: 'Timeout', windowMs: 60000, maxRequests: 0, priority: 0, enabled: true },
          0, 0, new Date(), 0, 'Request timeout'
        ));
        continue;
      }

      // Try to allow request (simplified - in practice, re-check rate limits)
      const backoffTime = this.calculateBackoff(age);
      if (age >= backoffTime) {
        queue.shift();
        item.resolve(this.createAllowedResult(100, 99, new Date(Date.now() + 60000)));
      }
    }
  }

  private calculateBackoff(age: number): number {
    const base = this.throttleConfig.backoffBase;

    switch (this.throttleConfig.backoffStrategy) {
      case 'linear':
        return base;
      case 'exponential':
        return base * Math.pow(2, Math.floor(age / base));
      case 'constant':
        return base;
      default:
        return base;
    }
  }

  private startBurstTokenRefill(): void {
    setInterval(() => {
      this.refillBurstTokens();
    }, this.burstConfig.burstWindow / 10); // Refill every 6 seconds for 1-minute window
  }

  private refillBurstTokens(): void {
    const now = Date.now();

    for (const [key, tokenData] of this.burstTokens.entries()) {
      const timeSinceRefill = now - tokenData.lastRefill.getTime();
      const tokensToAdd = Math.floor(timeSinceRefill / this.burstConfig.burstWindow * this.burstConfig.burstRefillRate);

      if (tokensToAdd > 0) {
        tokenData.tokens = Math.min(this.burstConfig.maxBurstSize, tokenData.tokens + tokensToAdd);
        tokenData.lastRefill = new Date(now);
      }
    }
  }
}

// Singleton instance
export const advancedRateLimitingService = new AdvancedRateLimitingService();
