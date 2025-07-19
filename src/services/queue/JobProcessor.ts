import Bull, { Queue, Job, JobOptions, QueueScheduler, Worker } from 'bull';
import { Logger } from '../../core/logging/logger';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

const logger = new Logger('JobProcessor');

interface JobData {
  type: string;
  payload: any;
  metadata?: {
    userId?: string;
    tenantId?: string;
    correlationId?: string;
    priority?: number;
  };
}

interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

interface JobMetrics {
  processed: number;
  failed: number;
  completed: number;
  active: number;
  waiting: number;
  delayed: number;
  averageProcessingTime: number;
}

type JobHandler = (job: Job<JobData>) => Promise<any>;

export class JobProcessor extends EventEmitter {
  private static instance: JobProcessor;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private schedulers: Map<string, QueueScheduler> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private metrics: Map<string, JobMetrics> = new Map();
  private redisConfig: any;

  private constructor() {
    super();
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_QUEUE_DB || '2')
    };
    
    // Initialize default queues
    this.initializeDefaultQueues();
  }

  static getInstance(): JobProcessor {
    if (!JobProcessor.instance) {
      JobProcessor.instance = new JobProcessor();
    }
    return JobProcessor.instance;
  }

  /**
   * Initialize default job queues
   */
  private initializeDefaultQueues(): void {
    const defaultQueues = [
      'email',
      'sms',
      'export',
      'import',
      'analytics',
      'notifications',
      'imageProcessing',
      'dataSync',
      'reports',
      'cleanup'
    ];

    defaultQueues.forEach(queueName => {
      this.createQueue(queueName);
    });

    // Register default handlers
    this.registerDefaultHandlers();
  }

  /**
   * Create a new queue
   */
  createQueue(name: string, options?: Bull.QueueOptions): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Bull(name, {
      redis: this.redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      },
      ...options
    });

    // Create scheduler for delayed jobs
    const scheduler = new QueueScheduler(name, {
      redis: this.redisConfig
    });

    // Create worker
    const worker = new Worker(name, async (job) => {
      return this.processJob(job);
    }, {
      redis: this.redisConfig,
      concurrency: parseInt(process.env[`QUEUE_${name.toUpperCase()}_CONCURRENCY`] || '5')
    });

    // Set up event handlers
    this.setupQueueEvents(queue, name);
    this.setupWorkerEvents(worker, name);

    this.queues.set(name, queue);
    this.workers.set(name, worker);
    this.schedulers.set(name, scheduler);
    
    // Initialize metrics
    this.metrics.set(name, {
      processed: 0,
      failed: 0,
      completed: 0,
      active: 0,
      waiting: 0,
      delayed: 0,
      averageProcessingTime: 0
    });

    logger.info(`Queue created: ${name}`);
    return queue;
  }

  /**
   * Register a job handler
   */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    logger.info(`Handler registered for job type: ${jobType}`);
  }

  /**
   * Add a job to queue
   */
  async addJob(
    queueName: string,
    jobType: string,
    payload: any,
    options?: JobOptions
  ): Promise<Job<JobData>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobData: JobData = {
      type: jobType,
      payload,
      metadata: {
        correlationId: options?.jobId || this.generateCorrelationId(),
        priority: options?.priority
      }
    };

    const job = await queue.add(jobType, jobData, {
      ...options,
      jobId: jobData.metadata?.correlationId
    });

    logger.info(`Job added to ${queueName}`, {
      jobId: job.id,
      jobType,
      correlationId: jobData.metadata?.correlationId
    });

    return job;
  }

  /**
   * Process a job
   */
  private async processJob(job: Job<JobData>): Promise<JobResult> {
    const startTime = performance.now();
    const { type, payload, metadata } = job.data;

    logger.info(`Processing job`, {
      queue: job.queue.name,
      jobId: job.id,
      type,
      correlationId: metadata?.correlationId
    });

    try {
      const handler = this.handlers.get(type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${type}`);
      }

      const result = await handler(job);
      const duration = performance.now() - startTime;

      // Update metrics
      this.updateMetrics(job.queue.name, 'completed', duration);

      logger.info(`Job completed`, {
        queue: job.queue.name,
        jobId: job.id,
        type,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        data: result,
        duration
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Update metrics
      this.updateMetrics(job.queue.name, 'failed', duration);

      logger.error(`Job failed`, error, {
        queue: job.queue.name,
        jobId: job.id,
        type,
        attempt: job.attemptsMade
      });

      throw error;
    }
  }

  /**
   * Register default job handlers
   */
  private registerDefaultHandlers(): void {
    // Email handler
    this.registerHandler('sendEmail', async (job) => {
      const { to, subject, body, template } = job.data.payload;
      // Dynamic import to avoid loading heavy dependencies
      const { emailService } = await import('../notification/EmailService');
      return emailService.send({ to, subject, body, template });
    });

    // SMS handler
    this.registerHandler('sendSMS', async (job) => {
      const { to, message } = job.data.payload;
      const { smsService } = await import('../notification/SMSService');
      return smsService.send(to, message);
    });

    // Export handler
    this.registerHandler('exportData', async (job) => {
      const { type, filters, format, userId } = job.data.payload;
      const { exportService } = await import('../export/ExportService');
      return exportService.exportData(type, filters, format, userId);
    });

    // Import handler
    this.registerHandler('importData', async (job) => {
      const { type, fileUrl, mappings, userId } = job.data.payload;
      const { importService } = await import('../import/ImportService');
      return importService.importData(type, fileUrl, mappings, userId);
    });

    // Analytics handler
    this.registerHandler('generateAnalytics', async (job) => {
      const { reportType, dateRange, filters } = job.data.payload;
      const { analyticsService } = await import('../analytics/AnalyticsService');
      return analyticsService.generateReport(reportType, dateRange, filters);
    });

    // Image processing handler
    this.registerHandler('processImage', async (job) => {
      const { filename, operations } = job.data.payload;
      const { imageOptimizationService } = await import('../optimization/ImageOptimizationService');
      
      // Update job progress
      await job.updateProgress(10);
      
      const result = await imageOptimizationService.processUploadedImage(
        Buffer.from(operations.buffer, 'base64'),
        filename,
        operations.options
      );
      
      await job.updateProgress(100);
      return result;
    });

    // Cleanup handler
    this.registerHandler('cleanup', async (job) => {
      const { type, olderThan } = job.data.payload;
      const { cleanupService } = await import('../maintenance/CleanupService');
      return cleanupService.cleanup(type, olderThan);
    });

    // Notification handler
    this.registerHandler('sendNotification', async (job) => {
      const { userId, type, title, message, data } = job.data.payload;
      const { notificationService } = await import('../notification/NotificationService');
      return notificationService.send(userId, { type, title, message, data });
    });
  }

  /**
   * Setup queue event handlers
   */
  private setupQueueEvents(queue: Queue, name: string): void {
    queue.on('error', (error) => {
      logger.error(`Queue error: ${name}`, error);
      this.emit('queue:error', { queue: name, error });
    });

    queue.on('waiting', (jobId) => {
      logger.debug(`Job waiting: ${jobId} in ${name}`);
      this.updateQueueCounts(name);
    });

    queue.on('active', (job) => {
      logger.debug(`Job active: ${job.id} in ${name}`);
      this.updateQueueCounts(name);
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job stalled: ${job.id} in ${name}`);
      this.emit('job:stalled', { queue: name, jobId: job.id });
    });

    queue.on('progress', (job, progress) => {
      logger.debug(`Job progress: ${job.id} in ${name} - ${progress}%`);
      this.emit('job:progress', { queue: name, jobId: job.id, progress });
    });
  }

  /**
   * Setup worker event handlers
   */
  private setupWorkerEvents(worker: Worker, name: string): void {
    worker.on('completed', (job, result) => {
      logger.info(`Job completed: ${job.id} in ${name}`);
      this.emit('job:completed', { 
        queue: name, 
        jobId: job.id, 
        result,
        duration: result.duration 
      });
    });

    worker.on('failed', (job, error) => {
      logger.error(`Job failed: ${job?.id} in ${name}`, error);
      this.emit('job:failed', { 
        queue: name, 
        jobId: job?.id, 
        error: error.message,
        attempt: job?.attemptsMade 
      });
    });

    worker.on('error', (error) => {
      logger.error(`Worker error: ${name}`, error);
      this.emit('worker:error', { queue: name, error });
    });
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(queueName?: string): Promise<Record<string, any>> {
    if (queueName) {
      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }
      
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);

      const metrics = this.metrics.get(queueName)!;
      
      return {
        name: queueName,
        waiting,
        active,
        completed,
        failed,
        delayed,
        processed: metrics.processed,
        averageProcessingTime: metrics.averageProcessingTime
      };
    }

    // Get metrics for all queues
    const allMetrics: Record<string, any> = {};
    
    for (const [name, queue] of this.queues) {
      allMetrics[name] = await this.getQueueMetrics(name);
    }
    
    return allMetrics;
  }

  /**
   * Clean completed/failed jobs
   */
  async cleanJobs(queueName: string, grace: number = 3600000): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, 'completed');
    await queue.clean(grace * 2, 'failed');
    
    logger.info(`Cleaned old jobs from ${queueName}`);
  }

  /**
   * Pause/resume queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs(queueName: string): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const failedJobs = await queue.getFailed();
    let retried = 0;

    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }

    logger.info(`Retried ${retried} failed jobs in ${queueName}`);
    return retried;
  }

  /**
   * Schedule recurring jobs
   */
  async scheduleRecurringJob(
    queueName: string,
    jobName: string,
    jobType: string,
    payload: any,
    cronExpression: string
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.add(
      jobType,
      {
        type: jobType,
        payload,
        metadata: { recurring: true }
      },
      {
        repeat: {
          cron: cronExpression
        },
        jobId: `recurring:${jobName}`
      }
    );

    logger.info(`Scheduled recurring job: ${jobName} in ${queueName}`);
  }

  /**
   * Start job processor
   */
  async start(): Promise<void> {
    logger.info('Starting job processor...');
    
    // Start all workers
    for (const [name, worker] of this.workers) {
      if (!worker.isRunning()) {
        await worker.run();
        logger.info(`Worker started: ${name}`);
      }
    }
    
    // Schedule cleanup jobs
    await this.scheduleCleanupJobs();
    
    logger.info('Job processor started');
  }

  /**
   * Stop job processor
   */
  async stop(): Promise<void> {
    logger.info('Stopping job processor...');
    
    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker stopped: ${name}`);
    }
    
    // Close all schedulers
    for (const [name, scheduler] of this.schedulers) {
      await scheduler.close();
      logger.info(`Scheduler stopped: ${name}`);
    }
    
    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue closed: ${name}`);
    }
    
    logger.info('Job processor stopped');
  }

  /**
   * Helper methods
   */
  
  private generateCorrelationId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateMetrics(queueName: string, status: 'completed' | 'failed', duration: number): void {
    const metrics = this.metrics.get(queueName);
    if (!metrics) return;
    
    metrics.processed++;
    if (status === 'completed') {
      metrics.completed++;
    } else {
      metrics.failed++;
    }
    
    // Update average processing time
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * (metrics.processed - 1) + duration) / metrics.processed;
  }

  private async updateQueueCounts(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) return;
    
    const metrics = this.metrics.get(queueName);
    if (!metrics) return;
    
    [metrics.waiting, metrics.active, metrics.delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount()
    ]);
  }

  private async scheduleCleanupJobs(): Promise<void> {
    // Clean completed jobs every hour
    for (const queueName of this.queues.keys()) {
      await this.scheduleRecurringJob(
        'cleanup',
        `clean-${queueName}`,
        'cleanup',
        { type: 'queue', target: queueName },
        '0 * * * *' // Every hour
      );
    }
  }
}

// Export singleton instance
export const jobProcessor = JobProcessor.getInstance();