/**
 * Advanced Security Service
 * Enterprise-grade security patterns including rate limiting, API key rotation, 
 * threat detection, and security monitoring
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request } from 'express';
import Redis from 'ioredis';
import { Logger } from '../logging/logger';
import { MetricsService } from '../monitoring/metrics';
import { EventBus, EventFactory } from '../events/EventBus';
import { AdvancedCacheService } from '../cache/AdvancedCacheService';

export interface SecurityConfig {
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
    maxRequestsPerUser: number;
    maxRequestsPerIP: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  apiKeys: {
    rotationIntervalMs: number;
    keyLength: number;
    algorithm: string;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
  };
  threatDetection: {
    maxFailedAttempts: number;
    suspiciousActivityThreshold: number;
    blockDurationMs: number;
    geoLocationEnabled: boolean;
  };
  audit: {
    enabled: boolean;
    retentionDays: number;
    sensitiveFields: string[];
  };
}

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'threat' | 'audit';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ip: string;
  userAgent: string;
  resource?: string;
  action?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ThreatAnalysis {
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  indicators: string[];
  recommendedAction: 'allow' | 'monitor' | 'challenge' | 'block';
  confidence: number;
}

export interface APIKeyInfo {
  id: string;
  key: string;
  hashedKey: string;
  userId: string;
  permissions: string[];
  expiresAt: Date;
  lastUsed?: Date;
  usageCount: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export class AdvancedSecurityService {
  private readonly logger = new Logger('AdvancedSecurityService');
  private readonly metrics: MetricsService;
  private readonly eventBus: EventBus;
  private readonly cache: AdvancedCacheService;
  private readonly redis?: Redis;
  private readonly config: SecurityConfig;

  // Rate limiting storage
  private readonly rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  
  // API key storage
  private readonly apiKeys = new Map<string, APIKeyInfo>();
  
  // Blocked IPs and users
  private readonly blockedIPs = new Set<string>();
  private readonly blockedUsers = new Set<string>();
  
  // Threat detection patterns
  private readonly suspiciousPatterns = [
    /(\b(union|select|insert|drop|delete|script|javascript|<script|eval|alert)\b)/gi,
    /(\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c)/gi,
    /(\bor\b.*=.*\bor\b|\band\b.*=.*\band\b)/gi,
    /(base64|eval|exec|system|shell_exec)/gi
  ];

  constructor(
    config: SecurityConfig,
    metrics: MetricsService,
    eventBus: EventBus,
    cache: AdvancedCacheService,
    redis?: Redis
  ) {
    this.config = config;
    this.metrics = metrics;
    this.eventBus = eventBus;
    this.cache = cache;
    this.redis = redis;

    this.initialize();
  }

  private initialize(): void {
    // Setup periodic cleanup
    setInterval(() => {
      this.cleanupRateLimitStore();
      this.rotateExpiredApiKeys();
    }, 60000); // Every minute

    // Setup API key rotation
    if (this.config.apiKeys.rotationIntervalMs > 0) {
      setInterval(() => {
        this.rotateApiKeys();
      }, this.config.apiKeys.rotationIntervalMs);
    }

    this.logger.info('Advanced security service initialized');
  }

  /**
   * Advanced rate limiting with per-user, per-IP, and global limits
   */
  public async checkRateLimit(req: Request): Promise<{
    allowed: boolean;
    retryAfter?: number;
    reason?: string;
  }> {
    const ip = this.getClientIP(req);
    const userId = (req as any).user?.id;
    const now = Date.now();

    try {
      // Check if IP or user is blocked
      if (this.blockedIPs.has(ip)) {
        return { allowed: false, reason: 'IP blocked due to suspicious activity' };
      }

      if (userId && this.blockedUsers.has(userId)) {
        return { allowed: false, reason: 'User blocked due to suspicious activity' };
      }

      // Global rate limiting
      const globalKey = 'global';
      const globalLimit = await this.checkLimit(globalKey, this.config.rateLimiting.maxRequests, now);
      if (!globalLimit.allowed) {
        this.metrics.incrementCounter('security_rate_limit_exceeded_total', { type: 'global' });
        return globalLimit;
      }

      // IP-based rate limiting
      const ipKey = `ip:${ip}`;
      const ipLimit = await this.checkLimit(ipKey, this.config.rateLimiting.maxRequestsPerIP, now);
      if (!ipLimit.allowed) {
        this.metrics.incrementCounter('security_rate_limit_exceeded_total', { type: 'ip' });
        await this.recordSecurityEvent({
          type: 'threat',
          severity: 'medium',
          ip,
          userAgent: req.get('User-Agent') || 'unknown',
          timestamp: new Date(),
          metadata: { rateLimitType: 'ip', limit: this.config.rateLimiting.maxRequestsPerIP }
        });
        return ipLimit;
      }

      // User-based rate limiting (if authenticated)
      if (userId) {
        const userKey = `user:${userId}`;
        const userLimit = await this.checkLimit(userKey, this.config.rateLimiting.maxRequestsPerUser, now);
        if (!userLimit.allowed) {
          this.metrics.incrementCounter('security_rate_limit_exceeded_total', { type: 'user' });
          return userLimit;
        }
      }

      return { allowed: true };

    } catch (error) {
      this.logger.error('Rate limiting check failed', { error, ip, userId });
      // Fail open for availability, but log the error
      return { allowed: true };
    }
  }

  private async checkLimit(key: string, maxRequests: number, now: number): Promise<{
    allowed: boolean;
    retryAfter?: number;
  }> {
    const windowMs = this.config.rateLimiting.windowMs;
    const resetTime = now + windowMs;

    let record = this.rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime };
      this.rateLimitStore.set(key, record);
    }

    record.count++;

    if (record.count > maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  }

  /**
   * Advanced threat detection and analysis
   */
  public async analyzeThreat(req: Request, context?: Record<string, any>): Promise<ThreatAnalysis> {
    const ip = this.getClientIP(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    const url = req.originalUrl;
    const body = req.body;
    const query = req.query;

    const indicators: string[] = [];
    let threatLevel: ThreatAnalysis['threatLevel'] = 'low';
    let confidence = 0.1;

    // Check for suspicious patterns in URL, query, and body
    const checkText = `${url} ${JSON.stringify(query)} ${JSON.stringify(body)}`;
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(checkText)) {
        indicators.push(`Suspicious pattern detected: ${pattern.source}`);
        confidence += 0.2;
        threatLevel = 'medium';
      }
    }

    // Check for brute force attempts
    const failedAttempts = await this.getFailedAttempts(ip);
    if (failedAttempts > this.config.threatDetection.maxFailedAttempts) {
      indicators.push('Multiple failed authentication attempts');
      confidence += 0.3;
      threatLevel = 'high';
    }

    // Check for unusual request patterns
    const requestRate = await this.getRequestRate(ip);
    if (requestRate > this.config.threatDetection.suspiciousActivityThreshold) {
      indicators.push('Abnormally high request rate');
      confidence += 0.2;
      if (threatLevel === 'low') threatLevel = 'medium';
    }

    // Check for suspicious user agent
    if (this.isSuspiciousUserAgent(userAgent)) {
      indicators.push('Suspicious user agent');
      confidence += 0.1;
    }

    // Check for known attack vectors
    if (this.containsAttackVectors(checkText)) {
      indicators.push('Known attack vectors detected');
      confidence += 0.4;
      threatLevel = 'high';
    }

    // Determine recommended action
    let recommendedAction: ThreatAnalysis['recommendedAction'] = 'allow';
    if (confidence > 0.7) {
      recommendedAction = 'block';
      threatLevel = 'critical';
    } else if (confidence > 0.5) {
      recommendedAction = 'challenge';
      if (threatLevel !== 'high') threatLevel = 'high';
    } else if (confidence > 0.3) {
      recommendedAction = 'monitor';
      if (threatLevel === 'low') threatLevel = 'medium';
    }

    // Record security event if threat detected
    if (indicators.length > 0) {
      await this.recordSecurityEvent({
        type: 'threat',
        severity: threatLevel === 'critical' ? 'critical' : threatLevel === 'high' ? 'high' : 'medium',
        ip,
        userAgent,
        resource: url,
        timestamp: new Date(),
        metadata: {
          indicators,
          confidence,
          context
        }
      });
    }

    this.metrics.incrementCounter('security_threat_analysis_total', {
      threat_level: threatLevel,
      action: recommendedAction
    });

    return {
      threatLevel,
      indicators,
      recommendedAction,
      confidence: Math.min(confidence, 1.0)
    };
  }

  /**
   * Generate and manage API keys with rotation
   */
  public async generateApiKey(
    userId: string,
    permissions: string[],
    expiresInMs: number = 30 * 24 * 60 * 60 * 1000, // 30 days
    metadata?: Record<string, any>
  ): Promise<APIKeyInfo> {
    const keyId = crypto.randomUUID();
    const apiKey = this.generateSecureKey(this.config.apiKeys.keyLength);
    const hashedKey = await bcrypt.hash(apiKey, 12);
    
    const keyInfo: APIKeyInfo = {
      id: keyId,
      key: apiKey,
      hashedKey,
      userId,
      permissions,
      expiresAt: new Date(Date.now() + expiresInMs),
      usageCount: 0,
      isActive: true,
      metadata
    };

    this.apiKeys.set(keyId, keyInfo);

    // Store in cache for fast lookup
    await this.cache.set(`apikey:${keyId}`, keyInfo, {
      ttl: Math.floor(expiresInMs / 1000),
      namespace: 'security'
    });

    this.logger.info('API key generated', {
      keyId,
      userId,
      permissions,
      expiresAt: keyInfo.expiresAt
    });

    this.metrics.incrementCounter('security_api_keys_generated_total', {
      user_id: userId
    });

    return { ...keyInfo, key: apiKey }; // Return the plain key only once
  }

  /**
   * Validate API key and check permissions
   */
  public async validateApiKey(
    keyId: string,
    requiredPermission?: string
  ): Promise<{
    valid: boolean;
    keyInfo?: APIKeyInfo;
    reason?: string;
  }> {
    try {
      // Try cache first
      let keyInfo = await this.cache.get<APIKeyInfo>(`apikey:${keyId}`, { namespace: 'security' });
      
      // Fallback to memory store
      if (!keyInfo) {
        keyInfo = this.apiKeys.get(keyId);
      }

      if (!keyInfo) {
        this.metrics.incrementCounter('security_api_key_validation_failed_total', { reason: 'not_found' });
        return { valid: false, reason: 'API key not found' };
      }

      if (!keyInfo.isActive) {
        this.metrics.incrementCounter('security_api_key_validation_failed_total', { reason: 'inactive' });
        return { valid: false, reason: 'API key is inactive' };
      }

      if (new Date() > keyInfo.expiresAt) {
        this.metrics.incrementCounter('security_api_key_validation_failed_total', { reason: 'expired' });
        return { valid: false, reason: 'API key has expired' };
      }

      if (requiredPermission && !keyInfo.permissions.includes(requiredPermission)) {
        this.metrics.incrementCounter('security_api_key_validation_failed_total', { reason: 'insufficient_permissions' });
        return { valid: false, reason: 'Insufficient permissions' };
      }

      // Update usage
      keyInfo.lastUsed = new Date();
      keyInfo.usageCount++;
      this.apiKeys.set(keyId, keyInfo);
      
      // Update cache
      await this.cache.set(`apikey:${keyId}`, keyInfo, {
        ttl: Math.floor((keyInfo.expiresAt.getTime() - Date.now()) / 1000),
        namespace: 'security'
      });

      this.metrics.incrementCounter('security_api_key_validation_success_total', {
        user_id: keyInfo.userId
      });

      return { valid: true, keyInfo };

    } catch (error) {
      this.logger.error('API key validation error', { keyId, error });
      return { valid: false, reason: 'Validation error' };
    }
  }

  /**
   * Encrypt sensitive data
   */
  public encrypt(data: string, customKey?: string): { encrypted: string; iv: string; tag: string } {
    const key = customKey ? crypto.scryptSync(customKey, 'salt', 32) : this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data
   */
  public decrypt(encryptedData: { encrypted: string; iv: string; tag: string }, customKey?: string): string {
    const key = customKey ? crypto.scryptSync(customKey, 'salt', 32) : this.getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(encryptedData.iv, 'hex'));
    
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Record security events for audit trail
   */
  public async recordSecurityEvent(event: SecurityEvent): Promise<void> {
    if (!this.config.audit.enabled) return;

    try {
      // Publish domain event
      const domainEvent = EventFactory.createDomainEvent(
        'security.event.recorded',
        event.userId || 'anonymous',
        'SecurityEvent',
        1,
        this.sanitizeEvent(event),
        event.userId
      );

      await this.eventBus.publishDomainEvent(domainEvent);

      // Store in cache for recent access
      const eventId = crypto.randomUUID();
      await this.cache.set(`security_event:${eventId}`, event, {
        ttl: this.config.audit.retentionDays * 24 * 60 * 60,
        namespace: 'security_audit',
        tags: ['security_event', event.type, event.severity]
      });

      // Update metrics
      this.metrics.incrementCounter('security_events_total', {
        type: event.type,
        severity: event.severity
      });

      this.logger.info('Security event recorded', {
        type: event.type,
        severity: event.severity,
        ip: event.ip,
        userId: event.userId
      });

      // Auto-block if critical threat
      if (event.severity === 'critical') {
        await this.autoBlock(event);
      }

    } catch (error) {
      this.logger.error('Failed to record security event', { event, error });
    }
  }

  private async autoBlock(event: SecurityEvent): Promise<void> {
    // Block IP for critical threats
    this.blockedIPs.add(event.ip);
    
    // Block user if applicable
    if (event.userId) {
      this.blockedUsers.add(event.userId);
    }

    // Set expiration for auto-unblock
    setTimeout(() => {
      this.blockedIPs.delete(event.ip);
      if (event.userId) {
        this.blockedUsers.delete(event.userId);
      }
      this.logger.info('Auto-unblocked after timeout', {
        ip: event.ip,
        userId: event.userId
      });
    }, this.config.threatDetection.blockDurationMs);

    this.logger.warn('Auto-blocked due to critical security event', {
      ip: event.ip,
      userId: event.userId,
      reason: event.type
    });
  }

  private sanitizeEvent(event: SecurityEvent): Partial<SecurityEvent> {
    const sanitized = { ...event };
    
    // Remove sensitive fields
    if (sanitized.metadata) {
      for (const field of this.config.audit.sensitiveFields) {
        if (sanitized.metadata[field]) {
          sanitized.metadata[field] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }

  private async getFailedAttempts(ip: string): Promise<number> {
    try {
      const attempts = await this.cache.get<number>(`failed_attempts:${ip}`, { namespace: 'security' });
      return attempts || 0;
    } catch {
      return 0;
    }
  }

  private async getRequestRate(ip: string): Promise<number> {
    try {
      const rate = await this.cache.get<number>(`request_rate:${ip}`, { namespace: 'security' });
      return rate || 0;
    } catch {
      return 0;
    }
  }

  private getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           (req.connection as any).socket?.remoteAddress ||
           'unknown';
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspicious = [
      'curl', 'wget', 'python', 'script', 'bot', 'crawler',
      'scanner', 'sqlmap', 'nikto', 'nessus'
    ];
    
    return suspicious.some(s => userAgent.toLowerCase().includes(s));
  }

  private containsAttackVectors(text: string): boolean {
    const attacks = [
      'union select', 'drop table', '<script>', 'javascript:',
      'onerror=', 'onload=', '../../../', 'cmd.exe',
      '/etc/passwd', 'boot.ini'
    ];
    
    return attacks.some(attack => text.toLowerCase().includes(attack));
  }

  private generateSecureKey(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += charset.charAt(crypto.randomInt(0, charset.length));
    }
    
    return result;
  }

  private getEncryptionKey(): Buffer {
    // In production, this should come from a secure key management system
    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    return crypto.scryptSync(keyString, 'salt', this.config.encryption.keyLength);
  }

  private cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [key, record] of this.rateLimitStore.entries()) {
      if (now > record.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  private async rotateExpiredApiKeys(): Promise<void> {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [keyId, keyInfo] of this.apiKeys.entries()) {
      if (now > keyInfo.expiresAt) {
        expiredKeys.push(keyId);
      }
    }

    for (const keyId of expiredKeys) {
      this.apiKeys.delete(keyId);
      await this.cache.invalidate(`apikey:${keyId}`, 'security');
      
      this.logger.info('Expired API key removed', { keyId });
      this.metrics.incrementCounter('security_api_keys_expired_total');
    }
  }

  private async rotateApiKeys(): Promise<void> {
    // This would implement automatic API key rotation for enhanced security
    this.logger.debug('API key rotation cycle completed');
  }

  /**
   * Get security statistics
   */
  public getStats(): {
    rateLimiting: {
      activeRecords: number;
      blockedIPs: number;
      blockedUsers: number;
    };
    apiKeys: {
      total: number;
      active: number;
      expired: number;
    };
    threats: {
      detected: number;
      blocked: number;
    };
  } {
    let activeApiKeys = 0;
    let expiredApiKeys = 0;
    const now = new Date();

    for (const keyInfo of this.apiKeys.values()) {
      if (keyInfo.isActive && now <= keyInfo.expiresAt) {
        activeApiKeys++;
      } else {
        expiredApiKeys++;
      }
    }

    return {
      rateLimiting: {
        activeRecords: this.rateLimitStore.size,
        blockedIPs: this.blockedIPs.size,
        blockedUsers: this.blockedUsers.size
      },
      apiKeys: {
        total: this.apiKeys.size,
        active: activeApiKeys,
        expired: expiredApiKeys
      },
      threats: {
        detected: 0, // Would come from metrics
        blocked: this.blockedIPs.size + this.blockedUsers.size
      }
    };
  }
}

export default AdvancedSecurityService;