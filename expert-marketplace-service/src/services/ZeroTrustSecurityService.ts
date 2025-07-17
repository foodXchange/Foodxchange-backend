import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import geoip from 'geoip-lite';
import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService.cleaned';
import { config } from '../config/index.cleaned';

const logger = new Logger('ZeroTrustSecurityService');

export interface SecurityContext {
  userId: string;
  sessionId: string;
  deviceFingerprint: string;
  ipAddress: string;
  userAgent: string;
  geolocation: {
    country: string;
    region: string;
    city: string;
    timezone: string;
  };
  riskScore: number;
  trustLevel: 'low' | 'medium' | 'high' | 'verified';
  authenticationFactors: string[];
  permissions: string[];
  lastActivity: Date;
  anomalyFlags: string[];
}

export interface ThreatIntelligence {
  ipAddress: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  threatTypes: string[];
  reputation: number;
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isMalicious: boolean;
  lastSeen: Date;
  source: string;
}

export interface SecurityEvent {
  id: string;
  type: 'authentication' | 'authorization' | 'anomaly' | 'threat' | 'access_denied';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  endpoint: string;
  method: string;
  timestamp: Date;
  details: any;
  riskScore: number;
  actionTaken: string;
  resolved: boolean;
}

export interface RiskAssessment {
  overallRisk: number;
  factors: {
    geographical: number;
    behavioral: number;
    device: number;
    network: number;
    temporal: number;
  };
  recommendations: string[];
  requiresAdditionalAuth: boolean;
  blockedReasons: string[];
}

/**
 * Zero Trust Security Service implementing continuous authentication and authorization
 */
export class ZeroTrustSecurityService {
  private securityEvents: SecurityEvent[] = [];
  private threatIntelligence: Map<string, ThreatIntelligence> = new Map();
  private activeSessions: Map<string, SecurityContext> = new Map();
  private readonly maxRiskScore = 100;
  private readonly highRiskThreshold = 70;
  private readonly criticalRiskThreshold = 90;
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private readonly maxFailedAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes

  constructor() {
    this.initializeThreatIntelligence();
    this.startPeriodicCleanup();
  }

  /**
   * Zero Trust authentication middleware
   */
  authenticate() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const securityContext = await this.evaluateSecurityContext(req);
        
        // Store security context in request
        req.securityContext = securityContext;
        
        // Evaluate risk and make access decision
        const riskAssessment = await this.assessRisk(securityContext);
        
        // Block high-risk requests
        if (riskAssessment.overallRisk >= this.criticalRiskThreshold) {
          await this.logSecurityEvent({
            type: 'access_denied',
            severity: 'critical',
            userId: securityContext.userId,
            sessionId: securityContext.sessionId,
            ipAddress: securityContext.ipAddress,
            userAgent: securityContext.userAgent,
            endpoint: req.path,
            method: req.method,
            details: { riskAssessment },
            riskScore: riskAssessment.overallRisk,
            actionTaken: 'blocked',
            resolved: false
          });

          return res.status(403).json({
            error: 'Access denied',
            message: 'Request blocked due to high risk score',
            riskScore: riskAssessment.overallRisk,
            requiresAdditionalAuth: riskAssessment.requiresAdditionalAuth
          });
        }

        // Require additional authentication for medium-high risk
        if (riskAssessment.overallRisk >= this.highRiskThreshold && 
            riskAssessment.requiresAdditionalAuth) {
          return res.status(401).json({
            error: 'Additional authentication required',
            message: 'Please verify your identity with additional factors',
            riskScore: riskAssessment.overallRisk,
            authChallenges: this.generateAuthChallenges(securityContext)
          });
        }

        // Update session with current context
        await this.updateSessionContext(securityContext);
        
        // Log successful authentication
        await this.logSecurityEvent({
          type: 'authentication',
          severity: 'low',
          userId: securityContext.userId,
          sessionId: securityContext.sessionId,
          ipAddress: securityContext.ipAddress,
          userAgent: securityContext.userAgent,
          endpoint: req.path,
          method: req.method,
          details: { riskAssessment },
          riskScore: riskAssessment.overallRisk,
          actionTaken: 'allowed',
          resolved: true
        });

        next();
      } catch (error) {
        logger.error('Zero trust authentication failed', { error: error.message });
        
        await this.logSecurityEvent({
          type: 'authentication',
          severity: 'high',
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || '',
          endpoint: req.path,
          method: req.method,
          details: { error: error.message },
          riskScore: 100,
          actionTaken: 'error',
          resolved: false
        });

        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Unable to verify security context'
        });
      }
    };
  }

  /**
   * Zero Trust authorization middleware
   */
  authorize(requiredPermissions: string[]) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const securityContext = req.securityContext;
        if (!securityContext) {
          return res.status(401).json({ error: 'Security context not found' });
        }

        // Check permissions
        const hasPermission = requiredPermissions.every(permission => 
          securityContext.permissions.includes(permission)
        );

        if (!hasPermission) {
          await this.logSecurityEvent({
            type: 'authorization',
            severity: 'medium',
            userId: securityContext.userId,
            sessionId: securityContext.sessionId,
            ipAddress: securityContext.ipAddress,
            userAgent: securityContext.userAgent,
            endpoint: req.path,
            method: req.method,
            details: { 
              requiredPermissions,
              userPermissions: securityContext.permissions
            },
            riskScore: 50,
            actionTaken: 'denied',
            resolved: true
          });

          return res.status(403).json({
            error: 'Insufficient permissions',
            required: requiredPermissions,
            current: securityContext.permissions
          });
        }

        // Continuous authorization check
        const authResult = await this.performContinuousAuthorization(securityContext, req);
        if (!authResult.authorized) {
          return res.status(403).json({
            error: 'Authorization denied',
            reason: authResult.reason
          });
        }

        next();
      } catch (error) {
        logger.error('Zero trust authorization failed', { error: error.message });
        return res.status(500).json({ error: 'Authorization error' });
      }
    };
  }

  /**
   * Evaluate security context for incoming request
   */
  private async evaluateSecurityContext(req: Request): Promise<SecurityContext> {
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent') || '';
    const deviceFingerprint = this.generateDeviceFingerprint(req);
    const geolocation = this.getGeolocation(ipAddress);

    // Extract user information from token
    const token = req.headers.authorization?.replace('Bearer ', '');
    const tokenPayload = token ? this.verifyToken(token) : null;

    const securityContext: SecurityContext = {
      userId: tokenPayload?.userId || 'anonymous',
      sessionId: tokenPayload?.sessionId || this.generateSessionId(),
      deviceFingerprint,
      ipAddress,
      userAgent,
      geolocation,
      riskScore: 0,
      trustLevel: 'low',
      authenticationFactors: tokenPayload ? ['jwt'] : [],
      permissions: tokenPayload?.permissions || [],
      lastActivity: new Date(),
      anomalyFlags: []
    };

    // Calculate initial risk score
    securityContext.riskScore = await this.calculateRiskScore(securityContext);
    securityContext.trustLevel = this.determineTrustLevel(securityContext.riskScore);

    return securityContext;
  }

  /**
   * Assess risk based on security context
   */
  private async assessRisk(context: SecurityContext): Promise<RiskAssessment> {
    const factors = {
      geographical: await this.assessGeographicalRisk(context),
      behavioral: await this.assessBehavioralRisk(context),
      device: await this.assessDeviceRisk(context),
      network: await this.assessNetworkRisk(context),
      temporal: await this.assessTemporalRisk(context)
    };

    const overallRisk = Object.values(factors).reduce((sum, risk) => sum + risk, 0) / 5;
    
    const recommendations = this.generateSecurityRecommendations(factors);
    const requiresAdditionalAuth = overallRisk >= this.highRiskThreshold;
    const blockedReasons = this.getBlockedReasons(factors);

    return {
      overallRisk,
      factors,
      recommendations,
      requiresAdditionalAuth,
      blockedReasons
    };
  }

  /**
   * Calculate risk score for security context
   */
  private async calculateRiskScore(context: SecurityContext): Promise<number> {
    let riskScore = 0;

    // IP reputation check
    const threatIntel = await this.getThreatIntelligence(context.ipAddress);
    if (threatIntel) {
      switch (threatIntel.riskLevel) {
        case 'critical': riskScore += 80; break;
        case 'high': riskScore += 60; break;
        case 'medium': riskScore += 40; break;
        case 'low': riskScore += 20; break;
      }
    }

    // Geolocation risk
    if (context.geolocation.country !== 'US') {
      riskScore += 10;
    }

    // Device fingerprint analysis
    const deviceRisk = await this.analyzeDeviceFingerprint(context.deviceFingerprint);
    riskScore += deviceRisk;

    // Session analysis
    const sessionRisk = await this.analyzeSessionPattern(context);
    riskScore += sessionRisk;

    // Failed authentication attempts
    const failedAttempts = await this.getFailedAttempts(context.ipAddress);
    riskScore += Math.min(failedAttempts * 10, 50);

    return Math.min(riskScore, this.maxRiskScore);
  }

  /**
   * Assess geographical risk
   */
  private async assessGeographicalRisk(context: SecurityContext): Promise<number> {
    const cachedRisk = await advancedCacheService.get(`geo_risk:${context.geolocation.country}`);
    if (cachedRisk) return cachedRisk;

    let risk = 0;
    
    // High-risk countries
    const highRiskCountries = ['CN', 'RU', 'KP', 'IR'];
    if (highRiskCountries.includes(context.geolocation.country)) {
      risk += 60;
    }

    // VPN/Proxy detection
    const threatIntel = await this.getThreatIntelligence(context.ipAddress);
    if (threatIntel?.isVpn || threatIntel?.isProxy) {
      risk += 40;
    }

    // Tor detection
    if (threatIntel?.isTor) {
      risk += 80;
    }

    // Cache result
    await advancedCacheService.set(`geo_risk:${context.geolocation.country}`, risk, {
      ttl: 3600,
      tags: ['security', 'geolocation']
    });

    return Math.min(risk, 100);
  }

  /**
   * Assess behavioral risk
   */
  private async assessBehavioralRisk(context: SecurityContext): Promise<number> {
    let risk = 0;

    // Unusual activity patterns
    const userPattern = await this.getUserActivityPattern(context.userId);
    if (userPattern) {
      const timeRisk = this.assessTimeBasedRisk(userPattern, context);
      const frequencyRisk = this.assessFrequencyRisk(userPattern, context);
      risk += Math.max(timeRisk, frequencyRisk);
    }

    // Rapid successive requests
    const requestFrequency = await this.getRequestFrequency(context.sessionId);
    if (requestFrequency > 10) { // More than 10 requests per minute
      risk += 30;
    }

    return Math.min(risk, 100);
  }

  /**
   * Assess device risk
   */
  private async assessDeviceRisk(context: SecurityContext): Promise<number> {
    let risk = 0;

    // Unknown device
    const isKnownDevice = await this.isKnownDevice(context.userId, context.deviceFingerprint);
    if (!isKnownDevice) {
      risk += 50;
    }

    // Suspicious user agent
    if (this.isSuspiciousUserAgent(context.userAgent)) {
      risk += 30;
    }

    // Device fingerprint analysis
    const deviceRisk = await this.analyzeDeviceFingerprint(context.deviceFingerprint);
    risk += deviceRisk;

    return Math.min(risk, 100);
  }

  /**
   * Assess network risk
   */
  private async assessNetworkRisk(context: SecurityContext): Promise<number> {
    let risk = 0;

    // Threat intelligence
    const threatIntel = await this.getThreatIntelligence(context.ipAddress);
    if (threatIntel?.isMalicious) {
      risk += 90;
    }

    // Recent security events from same IP
    const recentEvents = await this.getRecentSecurityEvents(context.ipAddress);
    risk += Math.min(recentEvents.length * 10, 50);

    return Math.min(risk, 100);
  }

  /**
   * Assess temporal risk
   */
  private async assessTemporalRisk(context: SecurityContext): Promise<number> {
    let risk = 0;

    // Off-hours access
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 22) {
      risk += 20;
    }

    // Unusual time patterns
    const userPattern = await this.getUserActivityPattern(context.userId);
    if (userPattern && this.isUnusualTimeAccess(userPattern, context)) {
      risk += 30;
    }

    return Math.min(risk, 100);
  }

  /**
   * Perform continuous authorization check
   */
  private async performContinuousAuthorization(
    context: SecurityContext, 
    req: Request
  ): Promise<{ authorized: boolean; reason?: string }> {
    // Check session validity
    const session = this.activeSessions.get(context.sessionId);
    if (!session) {
      return { authorized: false, reason: 'Session not found' };
    }

    // Check session timeout
    const sessionAge = Date.now() - session.lastActivity.getTime();
    if (sessionAge > this.sessionTimeout) {
      this.activeSessions.delete(context.sessionId);
      return { authorized: false, reason: 'Session expired' };
    }

    // Check for privilege escalation
    if (this.detectPrivilegeEscalation(context, req)) {
      return { authorized: false, reason: 'Privilege escalation detected' };
    }

    // Check for anomalous behavior
    if (context.anomalyFlags.length > 0) {
      return { authorized: false, reason: 'Anomalous behavior detected' };
    }

    return { authorized: true };
  }

  /**
   * Generate device fingerprint
   */
  private generateDeviceFingerprint(req: Request): string {
    const components = [
      req.get('user-agent') || '',
      req.get('accept') || '',
      req.get('accept-language') || '',
      req.get('accept-encoding') || '',
      req.get('x-forwarded-for') || req.ip
    ];

    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
  }

  /**
   * Get geolocation from IP address
   */
  private getGeolocation(ipAddress: string): any {
    const geo = geoip.lookup(ipAddress);
    return {
      country: geo?.country || 'Unknown',
      region: geo?.region || 'Unknown',
      city: geo?.city || 'Unknown',
      timezone: geo?.timezone || 'Unknown'
    };
  }

  /**
   * Verify JWT token
   */
  private verifyToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message });
      return null;
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Determine trust level based on risk score
   */
  private determineTrustLevel(riskScore: number): 'low' | 'medium' | 'high' | 'verified' {
    if (riskScore >= 80) return 'low';
    if (riskScore >= 50) return 'medium';
    if (riskScore >= 20) return 'high';
    return 'verified';
  }

  /**
   * Generate authentication challenges
   */
  private generateAuthChallenges(context: SecurityContext): string[] {
    const challenges = [];

    if (context.riskScore >= 80) {
      challenges.push('two_factor_auth');
    }

    if (context.riskScore >= 60) {
      challenges.push('email_verification');
    }

    if (context.riskScore >= 40) {
      challenges.push('security_questions');
    }

    return challenges;
  }

  /**
   * Update session context
   */
  private async updateSessionContext(context: SecurityContext): Promise<void> {
    context.lastActivity = new Date();
    this.activeSessions.set(context.sessionId, context);

    // Cache session for distributed systems
    await advancedCacheService.set(`session:${context.sessionId}`, context, {
      ttl: this.sessionTimeout / 1000,
      tags: ['session', 'security']
    });
  }

  /**
   * Log security event
   */
  private async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...event
    };

    this.securityEvents.push(securityEvent);

    // Cache recent events
    await advancedCacheService.set(`security_event:${securityEvent.id}`, securityEvent, {
      ttl: 86400, // 24 hours
      tags: ['security', 'events', event.type]
    });

    // Log high-severity events immediately
    if (event.severity === 'high' || event.severity === 'critical') {
      logger.warn('High-severity security event', securityEvent);
    }
  }

  /**
   * Initialize threat intelligence
   */
  private async initializeThreatIntelligence(): Promise<void> {
    // Load threat intelligence from external sources
    // This is a simplified implementation
    logger.info('Initializing threat intelligence');
    
    // In production, integrate with threat intelligence feeds
    // such as VirusTotal, AbuseIPDB, etc.
  }

  /**
   * Get threat intelligence for IP address
   */
  private async getThreatIntelligence(ipAddress: string): Promise<ThreatIntelligence | null> {
    // Check cache first
    const cached = await advancedCacheService.get(`threat_intel:${ipAddress}`);
    if (cached) return cached;

    // Check local threat intelligence
    const localThreat = this.threatIntelligence.get(ipAddress);
    if (localThreat) {
      await advancedCacheService.set(`threat_intel:${ipAddress}`, localThreat, {
        ttl: 3600,
        tags: ['threat', 'intelligence']
      });
      return localThreat;
    }

    // In production, query external threat intelligence APIs
    return null;
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupOldEvents();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, context] of this.activeSessions.entries()) {
      if (now - context.lastActivity.getTime() > this.sessionTimeout) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  /**
   * Cleanup old security events
   */
  private cleanupOldEvents(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    this.securityEvents = this.securityEvents.filter(event => 
      event.timestamp.getTime() > cutoff
    );
  }

  // Additional helper methods would be implemented here
  private async analyzeDeviceFingerprint(fingerprint: string): Promise<number> {
    // Implement device fingerprint analysis
    return 0;
  }

  private async analyzeSessionPattern(context: SecurityContext): Promise<number> {
    // Implement session pattern analysis
    return 0;
  }

  private async getFailedAttempts(ipAddress: string): Promise<number> {
    // Get failed authentication attempts for IP
    return 0;
  }

  private async getUserActivityPattern(userId: string): Promise<any> {
    // Get user activity patterns
    return null;
  }

  private assessTimeBasedRisk(userPattern: any, context: SecurityContext): number {
    // Assess time-based risk
    return 0;
  }

  private assessFrequencyRisk(userPattern: any, context: SecurityContext): number {
    // Assess frequency-based risk
    return 0;
  }

  private async getRequestFrequency(sessionId: string): Promise<number> {
    // Get request frequency for session
    return 0;
  }

  private async isKnownDevice(userId: string, deviceFingerprint: string): Promise<boolean> {
    // Check if device is known for user
    return false;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    // Check for suspicious user agents
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private async getRecentSecurityEvents(ipAddress: string): Promise<SecurityEvent[]> {
    // Get recent security events for IP
    return [];
  }

  private isUnusualTimeAccess(userPattern: any, context: SecurityContext): boolean {
    // Check if access time is unusual for user
    return false;
  }

  private detectPrivilegeEscalation(context: SecurityContext, req: Request): boolean {
    // Detect privilege escalation attempts
    return false;
  }

  private generateSecurityRecommendations(factors: any): string[] {
    // Generate security recommendations
    return [];
  }

  private getBlockedReasons(factors: any): string[] {
    // Get reasons for blocking
    return [];
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      securityContext?: SecurityContext;
    }
  }
}

// Export singleton instance
export const zeroTrustSecurityService = new ZeroTrustSecurityService();