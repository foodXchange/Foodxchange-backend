import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService.cleaned';
import { EnhancedAIMatchingService } from './EnhancedAIMatchingService.cleaned';
import { businessIntelligenceService } from './BusinessIntelligenceService';
import { NotificationService } from './NotificationService.cleaned';
import { config } from '../config/index.cleaned';

const logger = new Logger('AsyncProcessingService');

export interface AsyncJob {
  id: string;
  type: 'ai_matching' | 'bulk_data_processing' | 'report_generation' | 'data_migration' | 'notification_batch' | 'analytics_computation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  payload: any;
  metadata: {
    userId?: string;
    clientId?: string;
    estimatedDuration?: number;
    maxRetries?: number;
    currentRetry?: number;
    tags?: string[];
    dependencies?: string[];
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    timeout?: number;
  };
  result?: any;
  error?: string;
  progress?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueMetrics {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  throughput: number;
  queueLength: number;
  workerUtilization: number;
}

export interface ProcessingWorker {
  id: string;
  type: string;
  status: 'idle' | 'busy' | 'error';
  currentJob?: string;
  processedJobs: number;
  totalProcessingTime: number;
  lastActivity: Date;
  errorCount: number;
}

export interface JobResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  metrics?: any;
}

/**
 * Advanced asynchronous processing service with intelligent queue management
 */
export class AsyncProcessingService extends EventEmitter {
  private jobQueue: AsyncJob[] = [];
  private processingQueue: AsyncJob[] = [];
  private completedJobs: AsyncJob[] = [];
  private workers: ProcessingWorker[] = [];
  private readonly maxConcurrentJobs: number;
  private readonly maxRetries: number;
  private readonly jobTimeout: number;
  private readonly cleanupInterval: number;
  private processingInterval?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private aiMatchingService: EnhancedAIMatchingService;
  private notificationService: NotificationService;

  constructor() {
    super();
    this.maxConcurrentJobs = config.async?.maxConcurrentJobs || 10;
    this.maxRetries = config.async?.maxRetries || 3;
    this.jobTimeout = config.async?.jobTimeout || 300000; // 5 minutes
    this.cleanupInterval = config.async?.cleanupInterval || 3600000; // 1 hour
    
    this.aiMatchingService = new EnhancedAIMatchingService();
    this.notificationService = new NotificationService();
    
    this.initializeWorkers();
    this.startProcessing();
    this.startCleanup();
  }

  /**
   * Add job to processing queue
   */
  async addJob(job: Omit<AsyncJob, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const jobId = this.generateJobId();
    
    const asyncJob: AsyncJob = {
      id: jobId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0,
      ...job
    };

    // Set default metadata
    asyncJob.metadata = {
      maxRetries: this.maxRetries,
      currentRetry: 0,
      timeout: this.jobTimeout,
      ...asyncJob.metadata
    };

    // Add to queue based on priority
    this.insertJobByPriority(asyncJob);

    // Cache job for persistence
    await advancedCacheService.set(`async_job:${jobId}`, asyncJob, {
      ttl: 86400, // 24 hours
      tags: ['async_job', job.type],
      priority: job.priority
    });

    logger.info('Job added to queue', { 
      jobId, 
      type: job.type, 
      priority: job.priority,
      queueLength: this.jobQueue.length 
    });

    this.emit('job_added', asyncJob);
    return jobId;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<AsyncJob | null> {
    // Check processing queue first
    const processingJob = this.processingQueue.find(job => job.id === jobId);
    if (processingJob) return processingJob;

    // Check pending queue
    const pendingJob = this.jobQueue.find(job => job.id === jobId);
    if (pendingJob) return pendingJob;

    // Check completed jobs
    const completedJob = this.completedJobs.find(job => job.id === jobId);
    if (completedJob) return completedJob;

    // Check cache
    const cachedJob = await advancedCacheService.get(`async_job:${jobId}`);
    return cachedJob || null;
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Remove from pending queue
    const pendingIndex = this.jobQueue.findIndex(job => job.id === jobId);
    if (pendingIndex !== -1) {
      const job = this.jobQueue[pendingIndex];
      job.status = 'cancelled';
      job.updatedAt = new Date();
      this.jobQueue.splice(pendingIndex, 1);
      
      await this.updateJobCache(job);
      this.emit('job_cancelled', job);
      return true;
    }

    // Mark processing job as cancelled
    const processingJob = this.processingQueue.find(job => job.id === jobId);
    if (processingJob) {
      processingJob.status = 'cancelled';
      processingJob.updatedAt = new Date();
      await this.updateJobCache(processingJob);
      this.emit('job_cancelled', processingJob);
      return true;
    }

    return false;
  }

  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics {
    const totalJobs = this.jobQueue.length + this.processingQueue.length + this.completedJobs.length;
    const processingTimes = this.completedJobs
      .filter(job => job.metadata.startedAt && job.metadata.completedAt)
      .map(job => job.metadata.completedAt!.getTime() - job.metadata.startedAt!.getTime());
    
    const averageProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0;

    const busyWorkers = this.workers.filter(w => w.status === 'busy').length;
    const workerUtilization = this.workers.length > 0 ? (busyWorkers / this.workers.length) * 100 : 0;

    return {
      totalJobs,
      pendingJobs: this.jobQueue.length,
      processingJobs: this.processingQueue.length,
      completedJobs: this.completedJobs.filter(job => job.status === 'completed').length,
      failedJobs: this.completedJobs.filter(job => job.status === 'failed').length,
      averageProcessingTime,
      throughput: this.calculateThroughput(),
      queueLength: this.jobQueue.length,
      workerUtilization
    };
  }

  /**
   * Process AI matching job
   */
  async processAIMatchingJob(job: AsyncJob): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing AI matching job', { jobId: job.id, payload: job.payload });
      
      const { criteria, options } = job.payload;
      const matches = await this.aiMatchingService.findMatches(criteria, options);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result: matches,
        duration,
        metrics: {
          matchesFound: matches.length,
          criteriaComplexity: Object.keys(criteria).length,
          processingTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('AI matching job failed', { jobId: job.id, error: error.message });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Process bulk data processing job
   */
  async processBulkDataProcessingJob(job: AsyncJob): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing bulk data job', { jobId: job.id, payload: job.payload });
      
      const { operation, data, batchSize = 100 } = job.payload;
      const results = [];
      
      // Process in batches
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const batchResults = await this.processBatch(operation, batch);
        results.push(...batchResults);
        
        // Update progress
        job.progress = Math.floor(((i + batchSize) / data.length) * 100);
        job.updatedAt = new Date();
        await this.updateJobCache(job);
        this.emit('job_progress', job);
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result: results,
        duration,
        metrics: {
          totalRecords: data.length,
          processedRecords: results.length,
          batchSize,
          batchCount: Math.ceil(data.length / batchSize)
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Bulk data processing job failed', { jobId: job.id, error: error.message });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Process report generation job
   */
  async processReportGenerationJob(job: AsyncJob): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing report generation job', { jobId: job.id, payload: job.payload });
      
      const { reportType, parameters, format } = job.payload;
      
      // Update progress
      job.progress = 10;
      await this.updateJobCache(job);
      this.emit('job_progress', job);
      
      // Generate report data
      const reportData = await this.generateReportData(reportType, parameters);
      
      job.progress = 70;
      await this.updateJobCache(job);
      this.emit('job_progress', job);
      
      // Format report
      const formattedReport = await this.formatReport(reportData, format);
      
      job.progress = 90;
      await this.updateJobCache(job);
      this.emit('job_progress', job);
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result: formattedReport,
        duration,
        metrics: {
          reportType,
          format,
          dataSize: JSON.stringify(reportData).length,
          generationTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Report generation job failed', { jobId: job.id, error: error.message });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Process notification batch job
   */
  async processNotificationBatchJob(job: AsyncJob): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing notification batch job', { jobId: job.id, payload: job.payload });
      
      const { notifications, batchSize = 50 } = job.payload;
      const results = [];
      
      // Process notifications in batches
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const batchResults = await this.processNotificationBatch(batch);
        results.push(...batchResults);
        
        // Update progress
        job.progress = Math.floor(((i + batchSize) / notifications.length) * 100);
        job.updatedAt = new Date();
        await this.updateJobCache(job);
        this.emit('job_progress', job);
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result: results,
        duration,
        metrics: {
          totalNotifications: notifications.length,
          successfulNotifications: results.filter(r => r.success).length,
          failedNotifications: results.filter(r => !r.success).length,
          batchSize
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Notification batch job failed', { jobId: job.id, error: error.message });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Process analytics computation job
   */
  async processAnalyticsComputationJob(job: AsyncJob): Promise<JobResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing analytics computation job', { jobId: job.id, payload: job.payload });
      
      const { computationType, parameters } = job.payload;
      
      let result;
      switch (computationType) {
        case 'business_metrics':
          result = await businessIntelligenceService.getBusinessMetrics();
          break;
        case 'industry_analytics':
          result = await businessIntelligenceService.getIndustryAnalytics();
          break;
        case 'user_behavior':
          result = await businessIntelligenceService.getUserBehaviorAnalytics();
          break;
        case 'financial_analytics':
          result = await businessIntelligenceService.getFinancialAnalytics();
          break;
        case 'predictive_analytics':
          result = await businessIntelligenceService.getPredictiveAnalytics();
          break;
        default:
          throw new Error(`Unknown computation type: ${computationType}`);
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result,
        duration,
        metrics: {
          computationType,
          dataSize: JSON.stringify(result).length,
          computationTime: duration
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Analytics computation job failed', { jobId: job.id, error: error.message });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Initialize workers
   */
  private initializeWorkers(): void {
    const workerTypes = ['ai_matching', 'bulk_data_processing', 'report_generation', 'notification_batch', 'analytics_computation'];
    
    for (let i = 0; i < this.maxConcurrentJobs; i++) {
      const workerType = workerTypes[i % workerTypes.length];
      this.workers.push({
        id: `worker-${i}`,
        type: workerType,
        status: 'idle',
        processedJobs: 0,
        totalProcessingTime: 0,
        lastActivity: new Date(),
        errorCount: 0
      });
    }
    
    logger.info('Workers initialized', { count: this.workers.length });
  }

  /**
   * Start processing jobs
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processNextJobs().catch(error => {
        logger.error('Error in processing interval', { error: error.message });
      });
    }, 1000); // Check every second
    
    logger.info('Job processing started');
  }

  /**
   * Process next available jobs
   */
  private async processNextJobs(): Promise<void> {
    const availableWorkers = this.workers.filter(w => w.status === 'idle');
    
    if (availableWorkers.length === 0 || this.jobQueue.length === 0) {
      return;
    }
    
    const jobsToProcess = Math.min(availableWorkers.length, this.jobQueue.length);
    
    for (let i = 0; i < jobsToProcess; i++) {
      const job = this.jobQueue.shift();
      const worker = availableWorkers[i];
      
      if (job && worker) {
        await this.processJob(job, worker);
      }
    }
  }

  /**
   * Process individual job
   */
  private async processJob(job: AsyncJob, worker: ProcessingWorker): Promise<void> {
    worker.status = 'busy';
    worker.currentJob = job.id;
    worker.lastActivity = new Date();
    
    job.status = 'processing';
    job.metadata.startedAt = new Date();
    job.updatedAt = new Date();
    
    this.processingQueue.push(job);
    await this.updateJobCache(job);
    
    logger.info('Processing job', { jobId: job.id, workerId: worker.id, type: job.type });
    this.emit('job_started', job);
    
    try {
      // Set timeout for job
      const timeout = setTimeout(() => {
        job.status = 'failed';
        job.error = 'Job timeout';
        job.updatedAt = new Date();
        this.emit('job_failed', job);
      }, job.metadata.timeout || this.jobTimeout);
      
      let result: JobResult;
      
      // Process job based on type
      switch (job.type) {
        case 'ai_matching':
          result = await this.processAIMatchingJob(job);
          break;
        case 'bulk_data_processing':
          result = await this.processBulkDataProcessingJob(job);
          break;
        case 'report_generation':
          result = await this.processReportGenerationJob(job);
          break;
        case 'notification_batch':
          result = await this.processNotificationBatchJob(job);
          break;
        case 'analytics_computation':
          result = await this.processAnalyticsComputationJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      clearTimeout(timeout);
      
      // Update job with result
      job.status = result.success ? 'completed' : 'failed';
      job.result = result.result;
      job.error = result.error;
      job.progress = 100;
      job.metadata.completedAt = new Date();
      job.updatedAt = new Date();
      
      // Update worker stats
      worker.processedJobs++;
      worker.totalProcessingTime += result.duration;
      if (!result.success) {
        worker.errorCount++;
      }
      
      logger.info('Job completed', { 
        jobId: job.id, 
        workerId: worker.id, 
        success: result.success,
        duration: result.duration 
      });
      
      this.emit(result.success ? 'job_completed' : 'job_failed', job);
      
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.updatedAt = new Date();
      worker.errorCount++;
      
      logger.error('Job processing failed', { 
        jobId: job.id, 
        workerId: worker.id, 
        error: error.message 
      });
      
      this.emit('job_failed', job);
      
      // Retry logic
      if (job.metadata.currentRetry! < job.metadata.maxRetries!) {
        job.metadata.currentRetry!++;
        job.status = 'pending';
        job.error = undefined;
        
        // Add back to queue with delay
        setTimeout(() => {
          this.insertJobByPriority(job);
        }, 5000 * job.metadata.currentRetry!); // Exponential backoff
        
        logger.info('Job scheduled for retry', { 
          jobId: job.id, 
          attempt: job.metadata.currentRetry,
          maxRetries: job.metadata.maxRetries
        });
      }
    } finally {
      // Clean up worker
      worker.status = 'idle';
      worker.currentJob = undefined;
      worker.lastActivity = new Date();
      
      // Move job to completed queue
      const processingIndex = this.processingQueue.findIndex(j => j.id === job.id);
      if (processingIndex !== -1) {
        this.processingQueue.splice(processingIndex, 1);
      }
      
      if (job.status === 'completed' || job.status === 'failed') {
        this.completedJobs.push(job);
        await this.updateJobCache(job);
      }
    }
  }

  /**
   * Insert job by priority
   */
  private insertJobByPriority(job: AsyncJob): void {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const jobPriority = priorityOrder[job.priority];
    
    let insertIndex = 0;
    for (let i = 0; i < this.jobQueue.length; i++) {
      if (priorityOrder[this.jobQueue[i].priority] < jobPriority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }
    
    this.jobQueue.splice(insertIndex, 0, job);
  }

  /**
   * Start cleanup process
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedJobs();
    }, this.cleanupInterval);
    
    logger.info('Cleanup process started');
  }

  /**
   * Clean up old completed jobs
   */
  private cleanupCompletedJobs(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    const initialCount = this.completedJobs.length;
    
    this.completedJobs = this.completedJobs.filter(job => 
      job.updatedAt.getTime() > cutoff
    );
    
    const cleanedCount = initialCount - this.completedJobs.length;
    if (cleanedCount > 0) {
      logger.info('Cleaned up old jobs', { count: cleanedCount });
    }
  }

  /**
   * Update job cache
   */
  private async updateJobCache(job: AsyncJob): Promise<void> {
    await advancedCacheService.set(`async_job:${job.id}`, job, {
      ttl: 86400, // 24 hours
      tags: ['async_job', job.type],
      priority: job.priority
    });
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate throughput (jobs per minute)
   */
  private calculateThroughput(): number {
    const recentJobs = this.completedJobs.filter(job => 
      Date.now() - job.updatedAt.getTime() < 60000 // Last minute
    );
    return recentJobs.length;
  }

  /**
   * Helper methods for job processing
   */
  private async processBatch(operation: string, batch: any[]): Promise<any[]> {
    // Implement batch processing logic based on operation
    return batch.map(item => ({ ...item, processed: true }));
  }

  private async generateReportData(reportType: string, parameters: any): Promise<any> {
    // Implement report data generation
    return { reportType, parameters, data: [], generatedAt: new Date() };
  }

  private async formatReport(data: any, format: string): Promise<any> {
    // Implement report formatting
    return { format, data, formattedAt: new Date() };
  }

  private async processNotificationBatch(batch: any[]): Promise<any[]> {
    // Implement notification batch processing
    return batch.map(notification => ({ ...notification, sent: true, success: true }));
  }

  /**
   * Stop processing service
   */
  async stop(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    // Wait for current jobs to complete
    while (this.processingQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info('Async processing service stopped');
  }
}

// Export singleton instance
export const asyncProcessingService = new AsyncProcessingService();