import { jobProcessor } from './JobProcessor';
import { Logger } from '../../core/logging/logger';

const logger = new Logger('JobHelpers');

/**
 * Queue an email job
 */
export async function queueEmail(
  to: string | string[],
  subject: string,
  body: string,
  options?: {
    template?: string;
    templateData?: any;
    attachments?: any[];
    priority?: number;
    delay?: number;
  }
) {
  try {
    const job = await jobProcessor.addJob('email', 'sendEmail', {
      to: Array.isArray(to) ? to : [to],
      subject,
      body,
      template: options?.template,
      templateData: options?.templateData,
      attachments: options?.attachments
    }, {
      priority: options?.priority || 0,
      delay: options?.delay
    });
    
    logger.info(`Email job queued`, {
      jobId: job.id,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue email job', error);
    throw error;
  }
}

/**
 * Queue an SMS job
 */
export async function queueSMS(
  to: string,
  message: string,
  options?: {
    priority?: number;
    delay?: number;
  }
) {
  try {
    const job = await jobProcessor.addJob('sms', 'sendSMS', {
      to,
      message
    }, {
      priority: options?.priority || 0,
      delay: options?.delay
    });
    
    logger.info(`SMS job queued`, {
      jobId: job.id,
      to
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue SMS job', error);
    throw error;
  }
}

/**
 * Queue a data export job
 */
export async function queueExport(
  type: string,
  format: 'csv' | 'excel' | 'pdf',
  userId: string,
  options?: {
    filters?: any;
    fields?: string[];
    email?: string;
  }
) {
  try {
    const job = await jobProcessor.addJob('export', 'exportData', {
      type,
      format,
      userId,
      filters: options?.filters,
      fields: options?.fields,
      notifyEmail: options?.email
    }, {
      priority: 1 // Higher priority for user-initiated exports
    });
    
    logger.info(`Export job queued`, {
      jobId: job.id,
      type,
      format,
      userId
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue export job', error);
    throw error;
  }
}

/**
 * Queue a data import job
 */
export async function queueImport(
  type: string,
  fileUrl: string,
  userId: string,
  options?: {
    mappings?: any;
    validation?: any;
    dryRun?: boolean;
  }
) {
  try {
    const job = await jobProcessor.addJob('import', 'importData', {
      type,
      fileUrl,
      userId,
      mappings: options?.mappings,
      validation: options?.validation,
      dryRun: options?.dryRun || false
    }, {
      priority: 1
    });
    
    logger.info(`Import job queued`, {
      jobId: job.id,
      type,
      fileUrl,
      userId
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue import job', error);
    throw error;
  }
}

/**
 * Queue an analytics generation job
 */
export async function queueAnalytics(
  reportType: string,
  dateRange: { start: Date; end: Date },
  options?: {
    filters?: any;
    groupBy?: string[];
    format?: string;
    schedule?: boolean;
  }
) {
  try {
    const job = await jobProcessor.addJob('analytics', 'generateAnalytics', {
      reportType,
      dateRange,
      filters: options?.filters,
      groupBy: options?.groupBy,
      format: options?.format || 'json'
    }, {
      priority: options?.schedule ? -1 : 0 // Lower priority for scheduled reports
    });
    
    logger.info(`Analytics job queued`, {
      jobId: job.id,
      reportType,
      dateRange
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue analytics job', error);
    throw error;
  }
}

/**
 * Queue an image processing job
 */
export async function queueImageProcessing(
  filename: string,
  operations: {
    buffer: Buffer;
    options?: any;
  }
) {
  try {
    const job = await jobProcessor.addJob('imageProcessing', 'processImage', {
      filename,
      operations: {
        buffer: operations.buffer.toString('base64'),
        options: operations.options
      }
    }, {
      priority: 0
    });
    
    logger.info(`Image processing job queued`, {
      jobId: job.id,
      filename
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue image processing job', error);
    throw error;
  }
}

/**
 * Queue a notification job
 */
export async function queueNotification(
  userId: string,
  notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
    channels?: ('inApp' | 'email' | 'sms' | 'push')[];
  }
) {
  try {
    const job = await jobProcessor.addJob('notifications', 'sendNotification', {
      userId,
      ...notification,
      channels: notification.channels || ['inApp']
    }, {
      priority: 2 // High priority for notifications
    });
    
    logger.info(`Notification job queued`, {
      jobId: job.id,
      userId,
      type: notification.type
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue notification job', error);
    throw error;
  }
}

/**
 * Queue a cleanup job
 */
export async function queueCleanup(
  type: 'logs' | 'temp' | 'cache' | 'old-exports',
  olderThan: Date
) {
  try {
    const job = await jobProcessor.addJob('cleanup', 'cleanup', {
      type,
      olderThan
    }, {
      priority: -5 // Very low priority
    });
    
    logger.info(`Cleanup job queued`, {
      jobId: job.id,
      type,
      olderThan
    });
    
    return job;
  } catch (error) {
    logger.error('Failed to queue cleanup job', error);
    throw error;
  }
}

/**
 * Wait for a job to complete
 */
export async function waitForJob(jobId: string, queueName: string, timeout: number = 30000): Promise<any> {
  const queue = jobProcessor['queues'].get(queueName);
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }
  
  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }
  
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Job timeout'));
    }, timeout);
    
    job.finished().then(result => {
      clearTimeout(timer);
      resolve(result);
    }).catch(error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Schedule recurring jobs
 */
export async function scheduleRecurringJobs() {
  try {
    // Daily analytics report
    await jobProcessor.scheduleRecurringJob(
      'analytics',
      'daily-analytics',
      'generateAnalytics',
      {
        reportType: 'daily-summary',
        dateRange: {
          start: new Date(Date.now() - 24 * 60 * 60 * 1000),
          end: new Date()
        }
      },
      '0 2 * * *' // 2 AM daily
    );
    
    // Weekly cleanup
    await jobProcessor.scheduleRecurringJob(
      'cleanup',
      'weekly-cleanup',
      'cleanup',
      {
        type: 'old-exports',
        olderThan: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      '0 3 * * 0' // 3 AM on Sundays
    );
    
    // Hourly cache cleanup
    await jobProcessor.scheduleRecurringJob(
      'cleanup',
      'hourly-cache-cleanup',
      'cleanup',
      {
        type: 'cache',
        olderThan: new Date(Date.now() - 60 * 60 * 1000)
      },
      '0 * * * *' // Every hour
    );
    
    logger.info('Recurring jobs scheduled');
  } catch (error) {
    logger.error('Failed to schedule recurring jobs', error);
  }
}

/**
 * Get job progress updates
 */
export function onJobProgress(callback: (event: any) => void) {
  jobProcessor.on('job:progress', callback);
  
  // Return unsubscribe function
  return () => {
    jobProcessor.off('job:progress', callback);
  };
}

/**
 * Get job completion updates
 */
export function onJobComplete(callback: (event: any) => void) {
  jobProcessor.on('job:completed', callback);
  
  // Return unsubscribe function
  return () => {
    jobProcessor.off('job:completed', callback);
  };
}

/**
 * Get job failure updates
 */
export function onJobFailed(callback: (event: any) => void) {
  jobProcessor.on('job:failed', callback);
  
  // Return unsubscribe function
  return () => {
    jobProcessor.off('job:failed', callback);
  };
}