import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService.cleaned';
import { EnhancedAIMatchingService } from './EnhancedAIMatchingService.cleaned';
import { ExpertProfile } from '../models/ExpertProfile.model.cleaned';
import { Lead } from '../modules/agent/models/Lead.model.cleaned';
import { config } from '../config/index.cleaned';

const logger = new Logger('CacheWarmingService');

export interface CacheWarmingConfig {
  batchSize: number;
  maxConcurrency: number;
  warmupSchedule: {
    enabled: boolean;
    cronExpression: string;
    timezone: string;
  };
  predictiveConfig: {
    enabled: boolean;
    lookAheadDays: number;
    confidenceThreshold: number;
  };
  priorityWeights: {
    popularExperts: number;
    recentMatches: number;
    activeLeads: number;
    seasonalTrends: number;
  };
}

export interface WarmupMetrics {
  totalKeysWarmed: number;
  cacheHitImprovement: number;
  averageWarmupTime: number;
  predictiveAccuracy: number;
  lastWarmupAt: Date;
  nextWarmupAt: Date;
  failedWarmups: number;
  successfulWarmups: number;
}

export interface WarmupJob {
  id: string;
  type: 'expert_profiles' | 'matching_results' | 'industry_data' | 'predictive' | 'user_preferences';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedTime: number;
  dependencies: string[];
  metadata: any;
  createdAt: Date;
  scheduledAt: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

/**
 * Advanced cache warming service with predictive caching for AI matching operations
 */
export class CacheWarmingService {
  private aiMatchingService: EnhancedAIMatchingService;
  private warmupQueue: WarmupJob[] = [];
  private isWarmingUp = false;
  private metrics: WarmupMetrics;
  private readonly config: CacheWarmingConfig;
  private warmupInterval?: NodeJS.Timeout;
  private predictiveInterval?: NodeJS.Timeout;

  constructor(aiMatchingService: EnhancedAIMatchingService) {
    this.aiMatchingService = aiMatchingService;
    this.config = {
      batchSize: config.cache?.warmup?.batchSize || 50,
      maxConcurrency: config.cache?.warmup?.maxConcurrency || 5,
      warmupSchedule: {
        enabled: config.cache?.warmup?.schedule?.enabled || true,
        cronExpression: config.cache?.warmup?.schedule?.cron || '0 */4 * * *', // Every 4 hours
        timezone: config.cache?.warmup?.schedule?.timezone || 'UTC'
      },
      predictiveConfig: {
        enabled: config.cache?.warmup?.predictive?.enabled || true,
        lookAheadDays: config.cache?.warmup?.predictive?.lookAhead || 7,
        confidenceThreshold: config.cache?.warmup?.predictive?.threshold || 0.7
      },
      priorityWeights: {
        popularExperts: 0.4,
        recentMatches: 0.3,
        activeLeads: 0.2,
        seasonalTrends: 0.1
      }
    };

    this.metrics = {
      totalKeysWarmed: 0,
      cacheHitImprovement: 0,
      averageWarmupTime: 0,
      predictiveAccuracy: 0,
      lastWarmupAt: new Date(),
      nextWarmupAt: new Date(),
      failedWarmups: 0,
      successfulWarmups: 0
    };

    this.initialize();
  }

  private initialize(): void {
    logger.info('Initializing cache warming service', { config: this.config });

    // Start scheduled warmup
    if (this.config.warmupSchedule.enabled) {
      this.startScheduledWarmup();
    }

    // Start predictive caching
    if (this.config.predictiveConfig.enabled) {
      this.startPredictiveCaching();
    }

    // Perform initial warmup
    this.performInitialWarmup();
  }

  /**
   * Perform comprehensive cache warming
   */
  async performWarmup(): Promise<void> {
    if (this.isWarmingUp) {
      logger.warn('Cache warming already in progress, skipping');
      return;
    }

    this.isWarmingUp = true;
    const startTime = Date.now();

    try {
      logger.info('Starting cache warming process');

      // Clear existing warmup queue
      this.warmupQueue = [];

      // Generate warmup jobs
      await this.generateWarmupJobs();

      // Process warmup queue
      await this.processWarmupQueue();

      // Update metrics
      const duration = Date.now() - startTime;
      this.metrics.averageWarmupTime = duration;
      this.metrics.lastWarmupAt = new Date();
      this.metrics.successfulWarmups++;

      logger.info('Cache warming completed successfully', {
        duration,
        keysWarmed: this.metrics.totalKeysWarmed,
        queueSize: this.warmupQueue.length
      });

    } catch (error) {
      this.metrics.failedWarmups++;
      logger.error('Cache warming failed', { error: error.message });
      throw error;
    } finally {
      this.isWarmingUp = false;
    }
  }

  /**
   * Generate warmup jobs based on priority and usage patterns
   */
  private async generateWarmupJobs(): Promise<void> {
    const jobs: WarmupJob[] = [];

    // 1. Popular expert profiles
    const popularExperts = await this.getPopularExperts();
    for (const expert of popularExperts) {
      jobs.push({
        id: `expert_${expert.id}`,
        type: 'expert_profiles',
        priority: 'high',
        estimatedTime: 500,
        dependencies: [],
        metadata: { expertId: expert.id },
        createdAt: new Date(),
        scheduledAt: new Date(),
        status: 'pending'
      });
    }

    // 2. Recent successful matches
    const recentMatches = await this.getRecentSuccessfulMatches();
    for (const match of recentMatches) {
      jobs.push({
        id: `match_${match.id}`,
        type: 'matching_results',
        priority: 'medium',
        estimatedTime: 1000,
        dependencies: [`expert_${match.expertId}`],
        metadata: { matchId: match.id, criteria: match.criteria },
        createdAt: new Date(),
        scheduledAt: new Date(),
        status: 'pending'
      });
    }

    // 3. Active leads with high probability
    const activeLeads = await this.getActiveLeads();
    for (const lead of activeLeads) {
      jobs.push({
        id: `lead_${lead.id}`,
        type: 'predictive',
        priority: 'high',
        estimatedTime: 2000,
        dependencies: [],
        metadata: { leadId: lead.id, requirements: lead.requirements },
        createdAt: new Date(),
        scheduledAt: new Date(),
        status: 'pending'
      });
    }

    // 4. Industry-specific data
    const industryData = await this.getIndustryCategories();
    for (const industry of industryData) {
      jobs.push({
        id: `industry_${industry.category}`,
        type: 'industry_data',
        priority: 'medium',
        estimatedTime: 800,
        dependencies: [],
        metadata: { category: industry.category, subcategories: industry.subcategories },
        createdAt: new Date(),
        scheduledAt: new Date(),
        status: 'pending'
      });
    }

    // 5. User preferences for frequent users
    const frequentUsers = await this.getFrequentUsers();
    for (const user of frequentUsers) {
      jobs.push({
        id: `user_${user.id}`,
        type: 'user_preferences',
        priority: 'low',
        estimatedTime: 300,
        dependencies: [],
        metadata: { userId: user.id, preferences: user.preferences },
        createdAt: new Date(),
        scheduledAt: new Date(),
        status: 'pending'
      });
    }

    // Sort jobs by priority and dependencies
    this.warmupQueue = this.sortJobsByPriority(jobs);

    logger.info('Generated warmup jobs', { 
      totalJobs: jobs.length, 
      byType: this.getJobCountByType(jobs) 
    });
  }

  /**
   * Process warmup queue with concurrency control
   */
  private async processWarmupQueue(): Promise<void> {
    const concurrentJobs: Promise<void>[] = [];
    const completedJobs: string[] = [];

    while (this.warmupQueue.length > 0 || concurrentJobs.length > 0) {
      // Start new jobs up to max concurrency
      while (concurrentJobs.length < this.config.maxConcurrency && this.warmupQueue.length > 0) {
        const job = this.getNextAvailableJob(completedJobs);
        if (!job) break;

        const jobPromise = this.processWarmupJob(job)
          .then(() => {
            completedJobs.push(job.id);
            job.status = 'completed';
            job.completedAt = new Date();
          })
          .catch((error) => {
            job.status = 'failed';
            job.error = error.message;
            logger.error('Warmup job failed', { jobId: job.id, error: error.message });
          });

        concurrentJobs.push(jobPromise);
      }

      // Wait for at least one job to complete
      if (concurrentJobs.length > 0) {
        await Promise.race(concurrentJobs);
        
        // Remove completed jobs
        for (let i = concurrentJobs.length - 1; i >= 0; i--) {
          const isCompleted = await Promise.race([
            concurrentJobs[i].then(() => true),
            Promise.resolve(false)
          ]);
          
          if (isCompleted) {
            concurrentJobs.splice(i, 1);
          }
        }
      }
    }
  }

  /**
   * Process individual warmup job
   */
  private async processWarmupJob(job: WarmupJob): Promise<void> {
    job.status = 'running';
    const startTime = Date.now();

    try {
      logger.debug('Processing warmup job', { jobId: job.id, type: job.type });

      switch (job.type) {
        case 'expert_profiles':
          await this.warmupExpertProfile(job.metadata.expertId);
          break;
        case 'matching_results':
          await this.warmupMatchingResults(job.metadata.criteria);
          break;
        case 'industry_data':
          await this.warmupIndustryData(job.metadata.category);
          break;
        case 'predictive':
          await this.warmupPredictiveMatches(job.metadata.requirements);
          break;
        case 'user_preferences':
          await this.warmupUserPreferences(job.metadata.userId);
          break;
      }

      const duration = Date.now() - startTime;
      this.metrics.totalKeysWarmed++;
      
      logger.debug('Warmup job completed', { 
        jobId: job.id, 
        duration, 
        type: job.type 
      });

    } catch (error) {
      logger.error('Warmup job failed', { 
        jobId: job.id, 
        type: job.type, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Warm up expert profile data
   */
  private async warmupExpertProfile(expertId: string): Promise<void> {
    const cacheKey = `expert_profile:${expertId}`;
    
    try {
      // Check if already cached
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Expert profile already cached', { expertId });
        return;
      }

      // Fetch and cache expert profile
      const expert = await ExpertProfile.findById(expertId).lean();
      if (expert) {
        await advancedCacheService.set(cacheKey, expert, {
          ttl: 3600, // 1 hour
          tags: ['expert', 'profile', expert.expertise?.[0]],
          priority: 'high'
        });

        // Pre-warm related data
        await this.warmupRelatedExpertData(expert);
      }
    } catch (error) {
      logger.error('Failed to warm expert profile', { expertId, error: error.message });
      throw error;
    }
  }

  /**
   * Warm up matching results for common criteria
   */
  private async warmupMatchingResults(criteria: any): Promise<void> {
    const cacheKey = `matching_results:${JSON.stringify(criteria)}`;
    
    try {
      // Check if already cached
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Matching results already cached', { criteria });
        return;
      }

      // Generate matching results
      const matches = await this.aiMatchingService.findMatches(criteria);
      if (matches && matches.length > 0) {
        await advancedCacheService.set(cacheKey, matches, {
          ttl: 1800, // 30 minutes
          tags: ['matching', 'results', criteria.industryFocus?.[0]],
          priority: 'medium'
        });
      }
    } catch (error) {
      logger.error('Failed to warm matching results', { criteria, error: error.message });
      throw error;
    }
  }

  /**
   * Warm up industry-specific data
   */
  private async warmupIndustryData(category: string): Promise<void> {
    const cacheKey = `industry_data:${category}`;
    
    try {
      // Check if already cached
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Industry data already cached', { category });
        return;
      }

      // Fetch industry-specific data
      const industryData = await this.getIndustrySpecificData(category);
      if (industryData) {
        await advancedCacheService.set(cacheKey, industryData, {
          ttl: 7200, // 2 hours
          tags: ['industry', 'data', category],
          priority: 'medium'
        });
      }
    } catch (error) {
      logger.error('Failed to warm industry data', { category, error: error.message });
      throw error;
    }
  }

  /**
   * Warm up predictive matches for active leads
   */
  private async warmupPredictiveMatches(requirements: any): Promise<void> {
    const cacheKey = `predictive_matches:${JSON.stringify(requirements)}`;
    
    try {
      // Check if already cached
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        logger.debug('Predictive matches already cached', { requirements });
        return;
      }

      // Generate predictive matches
      const predictiveMatches = await this.generatePredictiveMatches(requirements);
      if (predictiveMatches && predictiveMatches.length > 0) {
        await advancedCacheService.set(cacheKey, predictiveMatches, {
          ttl: 900, // 15 minutes
          tags: ['predictive', 'matching', requirements.category],
          priority: 'high'
        });
      }
    } catch (error) {
      logger.error('Failed to warm predictive matches', { requirements, error: error.message });
      throw error;
    }
  }

  /**
   * Warm up user preferences
   */
  private async warmupUserPreferences(userId: string): Promise<void> {
    const cacheKey = `user_preferences:${userId}`;
    
    try {
      // Check if already cached
      const cached = await advancedCacheService.get(cacheKey);
      if (cached) {
        logger.debug('User preferences already cached', { userId });
        return;
      }

      // Fetch user preferences
      const preferences = await this.getUserPreferences(userId);
      if (preferences) {
        await advancedCacheService.set(cacheKey, preferences, {
          ttl: 1800, // 30 minutes
          tags: ['user', 'preferences', userId],
          priority: 'low'
        });
      }
    } catch (error) {
      logger.error('Failed to warm user preferences', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Start scheduled warmup process
   */
  private startScheduledWarmup(): void {
    // Parse cron expression (simplified for demo)
    const intervalMs = this.parseCronToInterval(this.config.warmupSchedule.cronExpression);
    
    this.warmupInterval = setInterval(() => {
      logger.info('Starting scheduled cache warmup');
      this.performWarmup().catch(error => {
        logger.error('Scheduled warmup failed', { error: error.message });
      });
    }, intervalMs);

    logger.info('Scheduled warmup started', { 
      interval: intervalMs, 
      cron: this.config.warmupSchedule.cronExpression 
    });
  }

  /**
   * Start predictive caching process
   */
  private startPredictiveCaching(): void {
    this.predictiveInterval = setInterval(() => {
      logger.info('Starting predictive cache warming');
      this.performPredictiveWarmup().catch(error => {
        logger.error('Predictive warmup failed', { error: error.message });
      });
    }, 30 * 60 * 1000); // Every 30 minutes

    logger.info('Predictive caching started');
  }

  /**
   * Perform initial warmup on service start
   */
  private async performInitialWarmup(): Promise<void> {
    try {
      logger.info('Performing initial cache warmup');
      
      // Warm up essential data
      await this.warmupEssentialData();
      
      logger.info('Initial cache warmup completed');
    } catch (error) {
      logger.error('Initial warmup failed', { error: error.message });
    }
  }

  /**
   * Warm up essential data that's needed immediately
   */
  private async warmupEssentialData(): Promise<void> {
    const essentialData = [
      { key: 'industry_categories', fetcher: () => this.getIndustryCategories() },
      { key: 'compliance_requirements', fetcher: () => this.getComplianceRequirements() },
      { key: 'certification_types', fetcher: () => this.getCertificationTypes() },
      { key: 'system_config', fetcher: () => this.getSystemConfig() }
    ];

    for (const data of essentialData) {
      try {
        const value = await data.fetcher();
        await advancedCacheService.set(data.key, value, {
          ttl: 3600, // 1 hour
          tags: ['essential', 'system'],
          priority: 'critical'
        });
        logger.debug('Essential data warmed', { key: data.key });
      } catch (error) {
        logger.error('Failed to warm essential data', { key: data.key, error: error.message });
      }
    }
  }

  /**
   * Get warmup metrics
   */
  getMetrics(): WarmupMetrics {
    return { ...this.metrics };
  }

  /**
   * Stop warmup service
   */
  async stop(): Promise<void> {
    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
    }
    if (this.predictiveInterval) {
      clearInterval(this.predictiveInterval);
    }
    logger.info('Cache warming service stopped');
  }

  // Helper methods for data fetching
  private async getPopularExperts(): Promise<any[]> {
    // Fetch popular experts based on recent activity
    return await ExpertProfile.find({ isActive: true })
      .sort({ 'stats.totalMatches': -1 })
      .limit(this.config.batchSize)
      .lean();
  }

  private async getRecentSuccessfulMatches(): Promise<any[]> {
    // Fetch recent successful matches
    return []; // Implementation depends on your matching history model
  }

  private async getActiveLeads(): Promise<any[]> {
    // Fetch active leads
    return await Lead.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(this.config.batchSize)
      .lean();
  }

  private async getIndustryCategories(): Promise<any[]> {
    return [
      { category: 'dairy', subcategories: ['milk', 'cheese', 'yogurt'] },
      { category: 'meat_poultry', subcategories: ['beef', 'pork', 'chicken'] },
      { category: 'seafood', subcategories: ['fish', 'shellfish', 'processed'] }
    ];
  }

  private async getFrequentUsers(): Promise<any[]> {
    // Fetch frequent users based on activity
    return []; // Implementation depends on your user activity tracking
  }

  private async getIndustrySpecificData(category: string): Promise<any> {
    // Fetch industry-specific data
    return {
      category,
      regulations: [],
      commonChallenges: [],
      bestPractices: []
    };
  }

  private async generatePredictiveMatches(requirements: any): Promise<any[]> {
    // Generate predictive matches based on requirements
    return [];
  }

  private async getUserPreferences(userId: string): Promise<any> {
    // Fetch user preferences
    return {
      userId,
      preferences: {},
      lastUpdated: new Date()
    };
  }

  private async warmupRelatedExpertData(expert: any): Promise<void> {
    // Warm up related expert data like certifications, reviews, etc.
    if (expert.certifications && expert.certifications.length > 0) {
      for (const cert of expert.certifications) {
        const certKey = `certification:${cert.type}:${cert.level}`;
        await advancedCacheService.set(certKey, cert, {
          ttl: 7200,
          tags: ['certification', expert.expertise?.[0]],
          priority: 'low'
        });
      }
    }
  }

  private async performPredictiveWarmup(): Promise<void> {
    // Implement predictive warmup logic
    logger.info('Performing predictive cache warmup');
  }

  private getNextAvailableJob(completedJobs: string[]): WarmupJob | null {
    for (let i = 0; i < this.warmupQueue.length; i++) {
      const job = this.warmupQueue[i];
      if (job.status === 'pending' && this.areDependenciesMet(job, completedJobs)) {
        this.warmupQueue.splice(i, 1);
        return job;
      }
    }
    return null;
  }

  private areDependenciesMet(job: WarmupJob, completedJobs: string[]): boolean {
    return job.dependencies.every(dep => completedJobs.includes(dep));
  }

  private sortJobsByPriority(jobs: WarmupJob[]): WarmupJob[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return jobs.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  }

  private getJobCountByType(jobs: WarmupJob[]): Record<string, number> {
    return jobs.reduce((acc, job) => {
      acc[job.type] = (acc[job.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private parseCronToInterval(cron: string): number {
    // Simplified cron parser - in production use a proper cron library
    // For demo, return 4 hours in milliseconds
    return 4 * 60 * 60 * 1000;
  }

  private async getComplianceRequirements(): Promise<string[]> {
    return ['HACCP', 'SQF', 'BRC', 'IFS', 'FDA', 'FSIS'];
  }

  private async getCertificationTypes(): Promise<string[]> {
    return ['Food Safety', 'Quality Assurance', 'Organic', 'Halal', 'Kosher'];
  }

  private async getSystemConfig(): Promise<any> {
    return {
      version: '2.0',
      features: ['ai_matching', 'predictive_caching', 'advanced_analytics'],
      limits: {
        maxMatchingResults: 100,
        maxCacheSize: '1GB',
        maxConcurrentJobs: 10
      }
    };
  }
}

// Export singleton instance
export const cacheWarmingService = new CacheWarmingService(new EnhancedAIMatchingService());