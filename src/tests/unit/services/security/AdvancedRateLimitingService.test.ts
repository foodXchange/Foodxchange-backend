import { AdvancedRateLimitingService } from '../../../../services/security/AdvancedRateLimitingService';
import { optimizedCache } from '../../../../services/cache/OptimizedCacheService';

// Mock dependencies
jest.mock('../../../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    deletePattern: jest.fn()
  }
}));

jest.mock('../../../../core/logging/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

// Mock OS module for system load testing
jest.mock('os', () => ({
  totalmem: jest.fn().mockReturnValue(8589934592), // 8GB
  freemem: jest.fn().mockReturnValue(4294967296), // 4GB
  loadavg: jest.fn().mockReturnValue([0.5, 0.6, 0.7]),
  cpus: jest.fn().mockReturnValue([{}, {}, {}, {}]) // 4 CPUs
}));

describe('AdvancedRateLimitingService', () => {
  let rateLimitingService: AdvancedRateLimitingService;
  let mockContext: any;

  beforeEach(() => {
    rateLimitingService = new AdvancedRateLimitingService();
    
    mockContext = {
      userId: 'user123',
      userRole: 'buyer',
      userTier: 'standard',
      ipAddress: '192.168.1.100',
      endpoint: '/api/products',
      method: 'GET',
      userAgent: 'Mozilla/5.0 Test Browser',
      apiKey: 'test-api-key',
      companyId: 'company123',
      timestamp: new Date()
    };

    jest.clearAllMocks();
  });

  describe('rule management', () => {
    test('should create a new rule', async () => {
      const ruleData = {
        name: 'Test Rule',
        windowMs: 60000,
        maxRequests: 100,
        tier: 'standard',
        endpoint: '/api/test',
        priority: 5,
        enabled: true
      };

      const rule = await rateLimitingService.addRule(ruleData);

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.name).toBe(ruleData.name);
      expect(rule.windowMs).toBe(ruleData.windowMs);
      expect(rule.maxRequests).toBe(ruleData.maxRequests);
      expect(optimizedCache.set).toHaveBeenCalledWith(
        expect.stringContaining('rate_limit_rule:'),
        expect.any(Object),
        86400
      );
    });

    test('should update an existing rule', async () => {
      const ruleData = {
        name: 'Original Rule',
        windowMs: 60000,
        maxRequests: 100,
        priority: 5,
        enabled: true
      };

      const rule = await rateLimitingService.addRule(ruleData);
      
      const updates = {
        name: 'Updated Rule',
        maxRequests: 200
      };

      const updatedRule = await rateLimitingService.updateRule(rule.id, updates);

      expect(updatedRule).toBeDefined();
      expect(updatedRule?.name).toBe(updates.name);
      expect(updatedRule?.maxRequests).toBe(updates.maxRequests);
      expect(updatedRule?.windowMs).toBe(ruleData.windowMs); // Unchanged
    });

    test('should delete a rule', async () => {
      const ruleData = {
        name: 'Rule to Delete',
        windowMs: 60000,
        maxRequests: 100,
        priority: 5,
        enabled: true
      };

      const rule = await rateLimitingService.addRule(ruleData);
      const deleted = await rateLimitingService.deleteRule(rule.id);

      expect(deleted).toBe(true);
      expect(rateLimitingService.getRule(rule.id)).toBeNull();
      expect(optimizedCache.del).toHaveBeenCalledWith(`rate_limit_rule:${rule.id}`);
    });

    test('should get all rules', async () => {
      const rules = rateLimitingService.getRules();
      
      expect(rules).toBeInstanceOf(Array);
      expect(rules.length).toBeGreaterThan(0); // Should have default rules
      
      // Check for default rules
      const defaultRuleIds = ['global', 'api_general', 'auth_strict'];
      const foundDefaultRules = rules.filter(rule => defaultRuleIds.includes(rule.id));
      expect(foundDefaultRules.length).toBe(3);
    });

    test('should get rule by ID', async () => {
      const rule = rateLimitingService.getRule('global');
      
      expect(rule).toBeDefined();
      expect(rule?.id).toBe('global');
      expect(rule?.name).toBe('Global Rate Limit');
    });
  });

  describe('rate limit checking', () => {
    beforeEach(() => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(null);
    });

    test('should allow request within limits', async () => {
      const result = await rateLimitingService.checkRateLimit(mockContext);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.resetTime).toBeInstanceOf(Date);
      expect(optimizedCache.set).toHaveBeenCalled();
    });

    test('should deny request when limit exceeded', async () => {
      // Mock a situation where limit is already exceeded
      (optimizedCache.get as jest.Mock).mockResolvedValue({
        count: 1000,
        resetTime: Date.now() + 60000
      });

      const result = await rateLimitingService.checkRateLimit(mockContext);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.blocked).toBe(true);
    });

    test('should apply most restrictive rule', async () => {
      // Add a more restrictive rule
      await rateLimitingService.addRule({
        name: 'Restrictive Rule',
        windowMs: 60000,
        maxRequests: 10,
        endpoint: '/api/products',
        priority: 10,
        enabled: true
      });

      const result = await rateLimitingService.checkRateLimit(mockContext);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBeLessThanOrEqual(10); // Should use the more restrictive limit
    });

    test('should respect rule priority', async () => {
      // Add high priority rule
      const highPriorityRule = await rateLimitingService.addRule({
        name: 'High Priority Rule',
        windowMs: 60000,
        maxRequests: 5,
        endpoint: '/api/products',
        priority: 100,
        enabled: true
      });

      // Add low priority rule
      await rateLimitingService.addRule({
        name: 'Low Priority Rule',
        windowMs: 60000,
        maxRequests: 1000,
        endpoint: '/api/products',
        priority: 1,
        enabled: true
      });

      const result = await rateLimitingService.checkRateLimit(mockContext);

      expect(result.rule?.id).toBe(highPriorityRule.id);
    });
  });

  describe('IP whitelist/blacklist', () => {
    test('should whitelist an IP address', async () => {
      const ipAddress = '192.168.1.200';
      
      await rateLimitingService.whitelistIP(ipAddress, 3600);

      expect(optimizedCache.set).toHaveBeenCalledWith(
        `ip_whitelist:${ipAddress}`,
        true,
        3600
      );
    });

    test('should blacklist an IP address', async () => {
      const ipAddress = '192.168.1.201';
      const reason = 'Suspicious activity';
      
      await rateLimitingService.blacklistIP(ipAddress, reason, 7200);

      expect(optimizedCache.set).toHaveBeenCalledWith(
        `ip_blacklist:${ipAddress}`,
        { reason, timestamp: expect.any(Date) },
        7200
      );
    });

    test('should check if IP is whitelisted', async () => {
      (optimizedCache.get as jest.Mock).mockResolvedValue(true);
      
      const isWhitelisted = await rateLimitingService.isWhitelisted('192.168.1.200');
      
      expect(isWhitelisted).toBe(true);
      expect(optimizedCache.get).toHaveBeenCalledWith('ip_whitelist:192.168.1.200');
    });

    test('should check if IP is blacklisted', async () => {
      const blacklistData = { reason: 'Spam', timestamp: new Date() };
      (optimizedCache.get as jest.Mock).mockResolvedValue(blacklistData);
      
      const blacklistCheck = await rateLimitingService.isBlacklisted('192.168.1.201');
      
      expect(blacklistCheck.blocked).toBe(true);
      expect(blacklistCheck.reason).toBe('Spam');
    });

    test('should bypass rate limit for whitelisted IP', async () => {
      (optimizedCache.get as jest.Mock)
        .mockResolvedValueOnce(true) // Whitelist check
        .mockResolvedValue(null); // Rate limit cache

      const whitelistedContext = { ...mockContext, ipAddress: '192.168.1.200' };
      const result = await rateLimitingService.checkRateLimit(whitelistedContext);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    test('should block blacklisted IP', async () => {
      (optimizedCache.get as jest.Mock)
        .mockResolvedValueOnce(null) // Whitelist check
        .mockResolvedValueOnce({ reason: 'Blocked', timestamp: new Date() }); // Blacklist check

      const blacklistedContext = { ...mockContext, ipAddress: '192.168.1.201' };
      const result = await rateLimitingService.checkRateLimit(blacklistedContext);

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Blocked');
    });
  });

  describe('adaptive rate limiting', () => {
    test('should get system load', async () => {
      const systemLoad = await rateLimitingService.getSystemLoad();
      
      expect(systemLoad).toBeGreaterThanOrEqual(0);
      expect(systemLoad).toBeLessThanOrEqual(1);
    });

    test('should adjust limits based on system load', async () => {
      // Mock high system load
      jest.spyOn(rateLimitingService, 'getSystemLoad').mockResolvedValue(0.9);

      const result = await rateLimitingService.checkRateLimit(mockContext);

      // Should apply reduced limit due to high load
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeLessThanOrEqual(100); // Reduced from adaptive adjustment
    });
  });

  describe('statistics and monitoring', () => {
    test('should get rate limiting statistics', async () => {
      (optimizedCache.get as jest.Mock).mockImplementation((key) => {
        if (key.includes('total_requests')) return 1000;
        if (key.includes('blocked_requests')) return 50;
        if (key.includes('throttled_requests')) return 25;
        return 0;
      });

      const stats = await rateLimitingService.getStatistics(3600);

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBe(1000);
      expect(stats.blockedRequests).toBe(50);
      expect(stats.throttledRequests).toBe(25);
    });

    test('should get remaining quota', async () => {
      const rule = rateLimitingService.getRule('global');
      expect(rule).toBeDefined();

      (optimizedCache.get as jest.Mock).mockResolvedValue({
        count: 25,
        resetTime: Date.now() + 60000
      });

      const quota = await rateLimitingService.getRemainingQuota('test_key', rule!);

      expect(quota.remaining).toBe(975); // 1000 - 25
      expect(quota.resetTime).toBeInstanceOf(Date);
    });

    test('should reset rate limit', async () => {
      await rateLimitingService.resetRateLimit('test_key');

      expect(optimizedCache.del).toHaveBeenCalledWith('rate_limit:test_key');
    });
  });

  describe('burst allowance', () => {
    test('should handle burst requests', async () => {
      // Add rule with burst allowance
      const rule = await rateLimitingService.addRule({
        name: 'Burst Rule',
        windowMs: 60000,
        maxRequests: 10,
        burstAllowance: 5,
        priority: 15,
        enabled: true
      });

      // Make multiple rapid requests
      const results = [];
      for (let i = 0; i < 15; i++) {
        const result = await rateLimitingService.checkRateLimit(mockContext);
        results.push(result);
      }

      // Should allow some burst requests beyond normal limit
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThan(10); // More than base limit due to burst
    });
  });

  describe('error handling', () => {
    test('should handle cache errors gracefully', async () => {
      (optimizedCache.get as jest.Mock).mockRejectedValue(new Error('Cache error'));

      const result = await rateLimitingService.checkRateLimit(mockContext);

      // Should fail open and allow request
      expect(result.allowed).toBe(true);
    });

    test('should handle invalid rule updates', async () => {
      const result = await rateLimitingService.updateRule('nonexistent', { name: 'Updated' });
      
      expect(result).toBeNull();
    });

    test('should handle rule deletion of non-existent rule', async () => {
      const deleted = await rateLimitingService.deleteRule('nonexistent');
      
      expect(deleted).toBe(false);
    });
  });

  describe('rule application logic', () => {
    test('should apply tier-based rules', async () => {
      await rateLimitingService.addRule({
        name: 'Premium Tier Rule',
        windowMs: 60000,
        maxRequests: 1000,
        tier: 'premium',
        priority: 20,
        enabled: true
      });

      // Test with premium tier
      const premiumContext = { ...mockContext, userTier: 'premium' };
      const premiumResult = await rateLimitingService.checkRateLimit(premiumContext);

      // Test with basic tier
      const basicContext = { ...mockContext, userTier: 'basic' };
      const basicResult = await rateLimitingService.checkRateLimit(basicContext);

      // Premium should have higher limits
      expect(premiumResult.limit).toBeGreaterThanOrEqual(basicResult.limit);
    });

    test('should apply endpoint-specific rules', async () => {
      await rateLimitingService.addRule({
        name: 'Auth Endpoint Rule',
        windowMs: 900000, // 15 minutes
        maxRequests: 5,
        endpoint: '/api/auth',
        priority: 25,
        enabled: true
      });

      const authContext = { ...mockContext, endpoint: '/api/auth/login' };
      const result = await rateLimitingService.checkRateLimit(authContext);

      expect(result.limit).toBeLessThanOrEqual(5);
    });

    test('should apply method-specific rules', async () => {
      await rateLimitingService.addRule({
        name: 'POST Method Rule',
        windowMs: 60000,
        maxRequests: 20,
        method: 'POST',
        priority: 30,
        enabled: true
      });

      const postContext = { ...mockContext, method: 'POST' };
      const postResult = await rateLimitingService.checkRateLimit(postContext);

      const getContext = { ...mockContext, method: 'GET' };
      const getResult = await rateLimitingService.checkRateLimit(getContext);

      // POST should have more restrictive limits
      expect(postResult.limit).toBeLessThanOrEqual(getResult.limit);
    });

    test('should apply role-based rules', async () => {
      await rateLimitingService.addRule({
        name: 'Admin Role Rule',
        windowMs: 60000,
        maxRequests: 500,
        userRole: 'admin',
        priority: 35,
        enabled: true
      });

      const adminContext = { ...mockContext, userRole: 'admin' };
      const adminResult = await rateLimitingService.checkRateLimit(adminContext);

      const buyerContext = { ...mockContext, userRole: 'buyer' };
      const buyerResult = await rateLimitingService.checkRateLimit(buyerContext);

      // Admin should have higher limits
      expect(adminResult.limit).toBeGreaterThanOrEqual(buyerResult.limit);
    });
  });

  describe('complex scenarios', () => {
    test('should handle multiple overlapping rules', async () => {
      // Add multiple rules that could apply
      await rateLimitingService.addRule({
        name: 'General API Rule',
        windowMs: 60000,
        maxRequests: 100,
        endpoint: '/api/.*',
        priority: 5,
        enabled: true
      });

      await rateLimitingService.addRule({
        name: 'Specific Product Rule',
        windowMs: 60000,
        maxRequests: 50,
        endpoint: '/api/products',
        priority: 10,
        enabled: true
      });

      await rateLimitingService.addRule({
        name: 'User Tier Rule',
        windowMs: 60000,
        maxRequests: 200,
        tier: 'standard',
        priority: 8,
        enabled: true
      });

      const result = await rateLimitingService.checkRateLimit(mockContext);

      // Should apply the most restrictive applicable rule
      expect(result.allowed).toBe(true);
      expect(result.limit).toBeLessThanOrEqual(50); // Most restrictive
    });

    test('should handle disabled rules', async () => {
      const rule = await rateLimitingService.addRule({
        name: 'Disabled Rule',
        windowMs: 60000,
        maxRequests: 1,
        endpoint: '/api/products',
        priority: 100,
        enabled: false
      });

      const result = await rateLimitingService.checkRateLimit(mockContext);

      // Should not apply disabled rule
      expect(result.rule?.id).not.toBe(rule.id);
      expect(result.limit).toBeGreaterThan(1);
    });
  });
});