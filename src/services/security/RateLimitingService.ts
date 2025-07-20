import { Request } from 'express';
import Redis from 'ioredis';

import { Logger } from '../../core/logging/logger';

const logger = new Logger('RateLimitingService');

interface RateLimitConfig {
  windowMs: number;           // Time window in milliseconds
  maxRequests: number;        // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: (req: Request) => void;
}

interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

interface TierConfig {
  name: string;
  limits: {
    perSecond?: number;
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  };
  burst?: number;
  cost?: number;
}

export class RateLimitingService {
  private readonly redis: Redis;
  private readonly defaultWindow = 60000; // 1 minute
  private readonly defaultMaxRequests = 100;

  // Tier configurations
  private readonly tiers: Map<string, TierConfig> = new Map([
    ['free', {
      name: 'free',
      limits: {
        perSecond: 2,
        perMinute: 60,
        perHour: 1000,
        perDay: 10000
      },
      burst: 5
    }],
    ['basic', {
      name: 'basic',
      limits: {
        perSecond: 10,
        perMinute: 300,
        perHour: 5000,
        perDay: 50000
      },
      burst: 20,
      cost: 29
    }],
    ['premium', {
      name: 'premium',
      limits: {
        perSecond: 50,
        perMinute: 1000,
        perHour: 20000,
        perDay: 200000
      },
      burst: 100,
      cost: 99
    }],
    ['enterprise', {
      name: 'enterprise',
      limits: {
        perSecond: 200,
        perMinute: 5000,
        perHour: 100000,
        perDay: 1000000
      },
      burst: 500,
      cost: 499
    }]
  ]);

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '1'), // Use different DB for rate limiting
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableOfflineQueue: false
    });

    this.redis.on('error', (error) => {
      logger.error('Redis rate limiting error:', error);
    });
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    try {
      const now = Date.now();
      const window = config.windowMs;
      const limit = config.maxRequests;

      // Use Redis sliding window algorithm
      const windowStart = now - window;
      const redisKey = `ratelimit:${key}`;

      // Remove old entries
      await this.redis.zremrangebyscore(redisKey, '-inf', windowStart);

      // Count current requests in window
      const current = await this.redis.zcard(redisKey);

      if (current >= limit) {
        // Get oldest entry to calculate retry after
        const oldestEntry = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
        const oldestTime = oldestEntry[1] ? parseInt(oldestEntry[1]) : now;
        const resetTime = new Date(oldestTime + window);
        const retryAfter = Math.ceil((oldestTime + window - now) / 1000);

        return {
          allowed: false,
          info: {
            limit,
            current,
            remaining: 0,
            resetTime,
            retryAfter
          }
        };
      }

      // Add current request
      await this.redis.zadd(redisKey, now, `${now}-${Math.random()}`);
      await this.redis.expire(redisKey, Math.ceil(window / 1000));

      const resetTime = new Date(now + window);

      return {
        allowed: true,
        info: {
          limit,
          current: current + 1,
          remaining: limit - current - 1,
          resetTime
        }
      };
    } catch (error) {
      logger.error('Rate limit check failed:', error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        info: {
          limit: config.maxRequests,
          current: 0,
          remaining: config.maxRequests,
          resetTime: new Date(Date.now() + config.windowMs)
        }
      };
    }
  }

  /**
   * Token bucket algorithm for burst handling
   */
  async checkTokenBucket(
    key: string,
    capacity: number,
    refillRate: number,
    tokensRequested: number = 1
  ): Promise<{ allowed: boolean; tokensRemaining: number }> {
    try {
      const now = Date.now();
      const bucketKey = `bucket:${key}`;

      // Get current bucket state
      const bucketData = await this.redis.get(bucketKey);
      let tokens = capacity;
      let lastRefill = now;

      if (bucketData) {
        const parsed = JSON.parse(bucketData);
        tokens = parsed.tokens;
        lastRefill = parsed.lastRefill;

        // Calculate tokens to add based on time passed
        const timePassed = now - lastRefill;
        const tokensToAdd = (timePassed / 1000) * refillRate;
        tokens = Math.min(capacity, tokens + tokensToAdd);
      }

      if (tokens >= tokensRequested) {
        // Consume tokens
        tokens -= tokensRequested;

        // Save bucket state
        await this.redis.setex(
          bucketKey,
          86400, // Expire after 24 hours
          JSON.stringify({ tokens, lastRefill: now })
        );

        return { allowed: true, tokensRemaining: Math.floor(tokens) };
      }

      return { allowed: false, tokensRemaining: Math.floor(tokens) };
    } catch (error) {
      logger.error('Token bucket check failed:', error);
      return { allowed: true, tokensRemaining: 0 };
    }
  }

  /**
   * Check tier-based rate limits
   */
  async checkTierLimit(
    userId: string,
    tier: string = 'free'
  ): Promise<{ allowed: boolean; info: any }> {
    const tierConfig = this.tiers.get(tier) || this.tiers.get('free');
    const checks: Promise<any>[] = [];

    // Check all time windows
    if (tierConfig.limits.perSecond) {
      checks.push(this.checkRateLimit(`${userId}:second`, {
        windowMs: 1000,
        maxRequests: tierConfig.limits.perSecond
      }));
    }

    if (tierConfig.limits.perMinute) {
      checks.push(this.checkRateLimit(`${userId}:minute`, {
        windowMs: 60000,
        maxRequests: tierConfig.limits.perMinute
      }));
    }

    if (tierConfig.limits.perHour) {
      checks.push(this.checkRateLimit(`${userId}:hour`, {
        windowMs: 3600000,
        maxRequests: tierConfig.limits.perHour
      }));
    }

    if (tierConfig.limits.perDay) {
      checks.push(this.checkRateLimit(`${userId}:day`, {
        windowMs: 86400000,
        maxRequests: tierConfig.limits.perDay
      }));
    }

    // Check burst if configured
    if (tierConfig.burst) {
      checks.push(this.checkTokenBucket(
        `${userId}:burst`,
        tierConfig.burst,
        tierConfig.limits.perSecond || 10
      ));
    }

    const results = await Promise.all(checks);

    // Find the most restrictive limit
    let mostRestrictive: any = null;
    for (const result of results) {
      if (!result.allowed) {
        mostRestrictive = result;
        break;
      }
      if (!mostRestrictive || result.info?.remaining < mostRestrictive.info?.remaining) {
        mostRestrictive = result;
      }
    }

    return {
      allowed: mostRestrictive?.allowed ?? true,
      info: {
        tier: tierConfig.name,
        ...mostRestrictive?.info,
        limits: tierConfig.limits
      }
    };
  }

  /**
   * Distributed rate limiting across multiple servers
   */
  async checkDistributedLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; count: number }> {
    const script = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      -- Clear old entries
      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      
      -- Count current entries
      local count = redis.call('ZCARD', key)
      
      if count < limit then
        -- Add new entry
        redis.call('ZADD', key, now, now .. ':' .. math.random())
        redis.call('EXPIRE', key, window)
        return {1, count + 1}
      else
        return {0, count}
      end
    `;

    try {
      const result = await this.redis.eval(
        script,
        1,
        `distributed:${key}`,
        limit,
        window,
        Date.now()
      ) as [number, number];

      return {
        allowed: result[0] === 1,
        count: result[1]
      };
    } catch (error) {
      logger.error('Distributed rate limit check failed:', error);
      return { allowed: true, count: 0 };
    }
  }

  /**
   * Adaptive rate limiting based on system load
   */
  async checkAdaptiveLimit(
    key: string,
    baseLimit: number,
    window: number,
    systemLoad: number
  ): Promise<{ allowed: boolean; adjustedLimit: number }> {
    // Adjust limit based on system load (0-1)
    const loadFactor = Math.max(0.1, 1 - systemLoad);
    const adjustedLimit = Math.floor(baseLimit * loadFactor);

    const result = await this.checkRateLimit(key, {
      windowMs: window,
      maxRequests: adjustedLimit
    });

    return {
      allowed: result.allowed,
      adjustedLimit
    };
  }

  /**
   * IP-based rate limiting
   */
  async checkIPLimit(
    ip: string,
    config?: Partial<RateLimitConfig>
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const ipConfig: RateLimitConfig = {
      windowMs: config?.windowMs || 60000, // 1 minute
      maxRequests: config?.maxRequests || 20, // Lower limit for IPs
      ...config
    };

    return this.checkRateLimit(`ip:${ip}`, ipConfig);
  }

  /**
   * API key rate limiting
   */
  async checkAPIKeyLimit(
    apiKey: string,
    config?: Partial<RateLimitConfig>
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const keyConfig: RateLimitConfig = {
      windowMs: config?.windowMs || 60000,
      maxRequests: config?.maxRequests || 1000, // Higher limit for API keys
      ...config
    };

    return this.checkRateLimit(`apikey:${apiKey}`, keyConfig);
  }

  /**
   * Endpoint-specific rate limiting
   */
  async checkEndpointLimit(
    endpoint: string,
    key: string,
    config?: Partial<RateLimitConfig>
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const endpointConfig: RateLimitConfig = {
      windowMs: config?.windowMs || 60000,
      maxRequests: config?.maxRequests || this.getEndpointLimit(endpoint),
      ...config
    };

    return this.checkRateLimit(`${endpoint}:${key}`, endpointConfig);
  }

  /**
   * Get endpoint-specific limits
   */
  private getEndpointLimit(endpoint: string): number {
    const limits: Record<string, number> = {
      '/api/v1/auth/login': 5,
      '/api/v1/auth/register': 3,
      '/api/v1/auth/reset-password': 3,
      '/api/v1/images/upload': 10,
      '/api/v1/export': 5,
      '/api/v1/analytics': 20,
      default: 100
    };

    return limits[endpoint] || limits.default;
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(`ratelimit:${pattern}`);
      if (keys.length === 0) return 0;

      const deleted = await this.redis.del(...keys);
      logger.info(`Reset ${deleted} rate limit keys matching pattern: ${pattern}`);

      return deleted;
    } catch (error) {
      logger.error('Failed to reset rate limits:', error);
      return 0;
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStatistics(): Promise<any> {
    try {
      const keys = await this.redis.keys('ratelimit:*');
      const stats = {
        totalKeys: keys.length,
        byType: {} as Record<string, number>,
        topLimited: [] as Array<{ key: string; count: number }>
      };

      // Analyze keys by type
      for (const key of keys) {
        const type = key.split(':')[1];
        stats.byType[type] = (stats.byType[type] || 0) + 1;

        // Get request count
        const count = await this.redis.zcard(key);
        if (count > 0) {
          stats.topLimited.push({ key, count });
        }
      }

      // Sort by count and take top 10
      stats.topLimited = stats.topLimited
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return stats;
    } catch (error) {
      logger.error('Failed to get rate limit statistics:', error);
      return null;
    }
  }

  /**
   * Whitelist a key from rate limiting
   */
  async addToWhitelist(key: string, duration?: number): Promise<void> {
    const whitelistKey = `whitelist:${key}`;
    if (duration) {
      await this.redis.setex(whitelistKey, duration, '1');
    } else {
      await this.redis.set(whitelistKey, '1');
    }
  }

  /**
   * Check if key is whitelisted
   */
  async isWhitelisted(key: string): Promise<boolean> {
    const exists = await this.redis.exists(`whitelist:${key}`);
    return exists === 1;
  }

  /**
   * Blacklist a key
   */
  async addToBlacklist(key: string, reason: string, duration?: number): Promise<void> {
    const blacklistKey = `blacklist:${key}`;
    const data = JSON.stringify({ reason, timestamp: Date.now() });

    if (duration) {
      await this.redis.setex(blacklistKey, duration, data);
    } else {
      await this.redis.set(blacklistKey, data);
    }
  }

  /**
   * Check if key is blacklisted
   */
  async isBlacklisted(key: string): Promise<{ blocked: boolean; reason?: string }> {
    const data = await this.redis.get(`blacklist:${key}`);
    if (!data) return { blocked: false };

    try {
      const parsed = JSON.parse(data);
      return { blocked: true, reason: parsed.reason };
    } catch {
      return { blocked: true };
    }
  }
}

// Export singleton instance
export const rateLimitingService = new RateLimitingService();
