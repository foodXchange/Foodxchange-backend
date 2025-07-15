import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/metrics/MetricsService';
import { cacheManager } from '../cache/CacheManager';
import { EventEmitter } from 'events';

const logger = new Logger('JobProcessor');
const metricsService = new MetricsService();

export interface Job {
  id: string;
  type: string;
  data: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: any;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'delayed';
}

export interface JobHandler {
  (job: Job): Promise<any>;
}

export interface JobOptions {
  priority?: number;
  maxAttempts?: number;
  delay?: number;
  timeout?: number;
  retryDelay?: number;
  retryBackoff?: 'fixed' | 'exponential' | 'linear';
}

export interface QueueOptions {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  defaultJobOptions?: JobOptions;
  processInterval?: number;
}

export class JobProcessor extends EventEmitter {
  private static instance: JobProcessor;
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private isProcessing = false;
  private processInterval?: NodeJS.Timeout;
  private activeJobs: Set<string> = new Set();
  private options: Required<QueueOptions>;

  private constructor(options: QueueOptions = {}) {
    super();
    this.options = {
      concurrency: options.concurrency ?? 10,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 5000,
      processInterval: options.processInterval ?? 1000,
      defaultJobOptions: {
        priority: 0,
        maxAttempts: 3,
        delay: 0,
        timeout: 30000,
        retryDelay: 5000,
        retryBackoff: 'exponential',
        ...options.defaultJobOptions
      }
    };
  }

  public static getInstance(options?: QueueOptions): JobProcessor {
    if (!JobProcessor.instance) {
      JobProcessor.instance = new JobProcessor(options);
    }
    return JobProcessor.instance;
  }

  /**
   * Register a job handler for a specific job type
   */
  public registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    logger.info('Job handler registered', { jobType });
  }

  /**
   * Add a job to the queue
   */
  public async addJob(
    type: string,
    data: any,
    options: JobOptions = {}
  ): Promise<string> {
    const jobOptions = { ...this.options.defaultJobOptions, ...options };
    
    const job: Job = {
      id: this.generateJobId(),
      type,
      data,
      priority: jobOptions.priority!,
      attempts: 0,
      maxAttempts: jobOptions.maxAttempts!,
      delay: jobOptions.delay!,
      createdAt: new Date(),
      status: jobOptions.delay! > 0 ? 'delayed' : 'pending'
    };

    this.jobs.set(job.id, job);
    
    // Store job persistently if cache is available
    await cacheManager.set(`job:${job.id}`, job, { ttl: 3600 });
    
    logger.info('Job added to queue', { 
      jobId: job.id, 
      type: job.type, 
      priority: job.priority,
      delay: job.delay
    });
    
    this.emit('job:added', job);
    
    metricsService.incrementCounter('jobs_added_total', { type: job.type });
    
    return job.id;
  }

  /**
   * Start processing jobs
   */
  public start(): void {
    if (this.isProcessing) {
      logger.warn('Job processor is already running');
      return;
    }

    this.isProcessing = true;
    this.processInterval = setInterval(
      () => this.processJobs(),
      this.options.processInterval
    );
    
    logger.info('Job processor started', {
      concurrency: this.options.concurrency,
      processInterval: this.options.processInterval
    });
    
    this.emit('processor:started');
  }

  /**
   * Stop processing jobs
   */
  public stop(): void {
    if (!this.isProcessing) {
      logger.warn('Job processor is not running');
      return;
    }

    this.isProcessing = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }
    
    logger.info('Job processor stopped');
    this.emit('processor:stopped');
  }

  /**
   * Process pending jobs
   */
  private async processJobs(): Promise<void> {
    if (this.activeJobs.size >= this.options.concurrency) {
      return;
    }

    const pendingJobs = this.getPendingJobs();
    const availableSlots = this.options.concurrency - this.activeJobs.size;
    const jobsToProcess = pendingJobs.slice(0, availableSlots);

    for (const job of jobsToProcess) {
      this.processJob(job);
    }
  }

  /**
   * Get jobs ready for processing
   */
  private getPendingJobs(): Job[] {
    const now = new Date();
    
    return Array.from(this.jobs.values())
      .filter(job => {
        // Check if job is ready to be processed
        if (job.status === 'pending') {
          return true;
        }
        
        // Check if delayed job is ready
        if (job.status === 'delayed') {
          const delayedUntil = new Date(job.createdAt.getTime() + job.delay);
          return now >= delayedUntil;
        }
        
        return false;
      })
      .sort((a, b) => {
        // Sort by priority (higher first), then by creation time
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    if (this.activeJobs.has(job.id)) {
      return;
    }

    this.activeJobs.add(job.id);
    
    job.status = 'processing';
    job.processedAt = new Date();
    job.attempts++;
    
    logger.info('Processing job', { 
      jobId: job.id, 
      type: job.type, 
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });
    
    this.emit('job:processing', job);
    
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.failJob(job, `No handler registered for job type: ${job.type}`);
      return;
    }

    const startTime = Date.now();
    
    try {
      // Set timeout for job processing
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Job processing timeout'));
        }, this.options.defaultJobOptions.timeout);
      });

      const result = await Promise.race([
        handler(job),
        timeoutPromise
      ]);

      await this.completeJob(job, result);
      
      const processingTime = Date.now() - startTime;
      metricsService.recordTimer('job_processing_duration_seconds', processingTime / 1000, {
        type: job.type,
        status: 'completed'
      });
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      metricsService.recordTimer('job_processing_duration_seconds', processingTime / 1000, {
        type: job.type,
        status: 'failed'
      });
      
      await this.handleJobError(job, error);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Complete a job successfully
   */
  private async completeJob(job: Job, result: any): Promise<void> {
    job.status = 'completed';
    job.completedAt = new Date();
    job.result = result;
    
    logger.info('Job completed successfully', { 
      jobId: job.id, 
      type: job.type,
      processingTime: job.completedAt.getTime() - job.processedAt!.getTime()
    });
    
    this.emit('job:completed', job);
    
    metricsService.incrementCounter('jobs_completed_total', { type: job.type });
    
    // Remove completed job after some time
    setTimeout(() => {
      this.jobs.delete(job.id);
      cacheManager.delete(`job:${job.id}`);
    }, 300000); // 5 minutes
  }

  /**
   * Handle job processing error
   */
  private async handleJobError(job: Job, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error('Job processing failed', error, {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    });
    
    if (job.attempts >= job.maxAttempts) {
      await this.failJob(job, errorMessage);
    } else {
      await this.retryJob(job, errorMessage);
    }
  }

  /**
   * Retry a failed job
   */
  private async retryJob(job: Job, error: string): Promise<void> {
    job.status = 'pending';
    job.error = error;
    
    // Calculate retry delay based on backoff strategy
    const retryDelay = this.calculateRetryDelay(job);
    job.delay = retryDelay;
    
    if (retryDelay > 0) {
      job.status = 'delayed';
    }
    
    logger.info('Job scheduled for retry', {
      jobId: job.id,
      type: job.type,
      attempt: job.attempts,
      retryDelay
    });
    
    this.emit('job:retry', job);
    
    metricsService.incrementCounter('jobs_retried_total', { type: job.type });
  }

  /**
   * Mark job as permanently failed
   */
  private async failJob(job: Job, error: string): Promise<void> {
    job.status = 'failed';
    job.failedAt = new Date();
    job.error = error;
    
    logger.error('Job permanently failed', {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      error
    });
    
    this.emit('job:failed', job);
    
    metricsService.incrementCounter('jobs_failed_total', { type: job.type });
  }

  /**
   * Calculate retry delay based on backoff strategy
   */
  private calculateRetryDelay(job: Job): number {
    const baseDelay = this.options.defaultJobOptions.retryDelay!;
    const backoff = this.options.defaultJobOptions.retryBackoff!;
    
    switch (backoff) {
      case 'fixed':
        return baseDelay;
      case 'linear':
        return baseDelay * job.attempts;
      case 'exponential':
        return baseDelay * Math.pow(2, job.attempts - 1);
      default:
        return baseDelay;
    }
  }

  /**
   * Get job by ID
   */
  public getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs of a specific type
   */
  public getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.type === type);
  }

  /**
   * Get jobs by status
   */
  public getJobsByStatus(status: Job['status']): Job[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  /**
   * Cancel a job
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'processing' || job.status === 'completed') {
      return false;
    }

    this.jobs.delete(jobId);
    cacheManager.delete(`job:${jobId}`);
    
    logger.info('Job cancelled', { jobId });
    this.emit('job:cancelled', job);
    
    return true;
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    delayed: number;
    active: number;
    handlers: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      delayed: jobs.filter(j => j.status === 'delayed').length,
      active: this.activeJobs.size,
      handlers: this.handlers.size
    };
  }

  /**
   * Clear all jobs
   */
  public clearJobs(): void {
    this.jobs.clear();
    this.activeJobs.clear();
    logger.info('All jobs cleared');
    this.emit('jobs:cleared');
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Common job types
export const JOB_TYPES = {
  EMAIL_SEND: 'email:send',
  EMAIL_VERIFICATION: 'email:verification',
  PASSWORD_RESET: 'password:reset',
  USER_WELCOME: 'user:welcome',
  ANALYTICS_PROCESS: 'analytics:process',
  NOTIFICATION_SEND: 'notification:send',
  FILE_PROCESS: 'file:process',
  DATA_EXPORT: 'data:export',
  CACHE_WARM: 'cache:warm',
  CLEANUP: 'cleanup',
  BACKUP: 'backup'
} as const;

// Job handler decorator
export function JobHandler(jobType: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    // Register handler with job processor
    JobProcessor.getInstance().registerHandler(jobType, originalMethod);
    
    return descriptor;
  };
}

// Export singleton instance
export const jobProcessor = JobProcessor.getInstance();
export default jobProcessor;