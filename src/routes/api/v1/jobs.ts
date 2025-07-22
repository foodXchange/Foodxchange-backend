import { Router } from 'express';
import { body, param, query } from 'express-validator';

import { Logger } from '../../../core/logging/logger';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { validateRequest } from '../../../middleware/validateRequest';
import { jobProcessor } from '../../../services/queue/JobProcessor';


const router = Router();
const logger = new Logger('JobRoutes');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/jobs/queues
 * @desc    Get all queue metrics
 * @access  Private
 */
router.get('/queues',
  asyncHandler(async (req, res) => {
    const metrics = await jobProcessor.getQueueMetrics();

    res.json({
      success: true,
      data: metrics
    });
  })
);

/**
 * @route   GET /api/v1/jobs/queues/:name
 * @desc    Get specific queue metrics
 * @access  Private
 */
router.get('/queues/:name',
  validateRequest([
    param('name').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const metrics = await jobProcessor.getQueueMetrics(name);

    res.json({
      success: true,
      data: metrics
    });
  })
);

/**
 * @route   POST /api/v1/jobs
 * @desc    Add a job to queue
 * @access  Private
 */
router.post('/',
  validateRequest([
    body('queue').notEmpty().withMessage('Queue name is required'),
    body('type').notEmpty().withMessage('Job type is required'),
    body('payload').isObject().withMessage('Payload must be an object'),
    body('options').optional().isObject()
  ]),
  asyncHandler(async (req, res) => {
    const { queue, type, payload, options } = req.body;
    const userId = (req).user.id;

    // Add user context to payload
    const enrichedPayload = {
      ...payload,
      _context: {
        userId,
        tenantId: (req).user?.tenantId || (req).user?.company,
        requestId: (req as any).correlationId
      }
    };

    const job = await jobProcessor.addJob(queue, type, enrichedPayload, options);

    logger.info('Job created by user', {
      userId,
      queue,
      type,
      jobId: job.id
    });

    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        queue: job.queue.name,
        type,
        status: await job.getState(),
        createdAt: new Date(job.timestamp),
        options: job.opts
      }
    });
  })
);

/**
 * @route   GET /api/v1/jobs/:jobId
 * @desc    Get job status
 * @access  Private
 */
router.get('/:jobId',
  validateRequest([
    param('jobId').notEmpty(),
    query('queue').notEmpty().withMessage('Queue name is required')
  ]),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const { queue: queueName } = req.query;

    const queue = jobProcessor['queues'].get(queueName as string);
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found'
      });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const [state, progress, failedReason, result] = await Promise.all([
      job.getState(),
      job.progress(),
      job.failedReason,
      job.returnvalue
    ]);

    res.json({
      success: true,
      data: {
        id: job.id,
        queue: queueName,
        type: job.data.type,
        state,
        progress,
        attemptsMade: job.attemptsMade,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : null,
        completedAt: job.finishedOn ? new Date(job.finishedOn) : null,
        failedReason,
        result: state === 'completed' ? result : null
      }
    });
  })
);

/**
 * @route   POST /api/v1/jobs/:jobId/retry
 * @desc    Retry a failed job
 * @access  Private
 */
router.post('/:jobId/retry',
  authorize('admin'),
  validateRequest([
    param('jobId').notEmpty(),
    body('queue').notEmpty().withMessage('Queue name is required')
  ]),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const { queue: queueName } = req.body;

    const queue = jobProcessor['queues'].get(queueName);
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found'
      });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const state = await job.getState();
    if (state !== 'failed') {
      return res.status(400).json({
        success: false,
        error: `Cannot retry job in ${state} state`
      });
    }

    await job.retry();

    logger.info('Job retried by admin', {
      adminId: (req).user.id,
      jobId,
      queue: queueName
    });

    res.json({
      success: true,
      message: 'Job queued for retry'
    });
  })
);

/**
 * @route   DELETE /api/v1/jobs/:jobId
 * @desc    Remove a job
 * @access  Admin
 */
router.delete('/:jobId',
  authorize('admin'),
  validateRequest([
    param('jobId').notEmpty(),
    query('queue').notEmpty().withMessage('Queue name is required')
  ]),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const { queue: queueName } = req.query;

    const queue = jobProcessor['queues'].get(queueName as string);
    if (!queue) {
      return res.status(404).json({
        success: false,
        error: 'Queue not found'
      });
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    await job.remove();

    logger.info('Job removed by admin', {
      adminId: (req).user.id,
      jobId,
      queue: queueName
    });

    res.json({
      success: true,
      message: 'Job removed'
    });
  })
);

/**
 * @route   POST /api/v1/jobs/queues/:name/pause
 * @desc    Pause a queue
 * @access  Admin
 */
router.post('/queues/:name/pause',
  authorize('admin'),
  validateRequest([
    param('name').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { name } = req.params;

    await jobProcessor.pauseQueue(name);

    logger.warn('Queue paused by admin', {
      adminId: (req).user.id,
      queue: name
    });

    res.json({
      success: true,
      message: `Queue ${name} paused`
    });
  })
);

/**
 * @route   POST /api/v1/jobs/queues/:name/resume
 * @desc    Resume a queue
 * @access  Admin
 */
router.post('/queues/:name/resume',
  authorize('admin'),
  validateRequest([
    param('name').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { name } = req.params;

    await jobProcessor.resumeQueue(name);

    logger.info('Queue resumed by admin', {
      adminId: (req).user.id,
      queue: name
    });

    res.json({
      success: true,
      message: `Queue ${name} resumed`
    });
  })
);

/**
 * @route   POST /api/v1/jobs/queues/:name/retry-failed
 * @desc    Retry all failed jobs in a queue
 * @access  Admin
 */
router.post('/queues/:name/retry-failed',
  authorize('admin'),
  validateRequest([
    param('name').notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { name } = req.params;

    const count = await jobProcessor.retryFailedJobs(name);

    logger.info('Failed jobs retried by admin', {
      adminId: (req).user.id,
      queue: name,
      count
    });

    res.json({
      success: true,
      data: {
        retriedCount: count,
        message: `${count} failed jobs queued for retry`
      }
    });
  })
);

/**
 * @route   POST /api/v1/jobs/queues/:name/clean
 * @desc    Clean old jobs from queue
 * @access  Admin
 */
router.post('/queues/:name/clean',
  authorize('admin'),
  validateRequest([
    param('name').notEmpty(),
    body('grace').optional().isInt({ min: 0 }).withMessage('Grace period must be positive')
  ]),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { grace } = req.body;

    await jobProcessor.cleanJobs(name, grace);

    logger.info('Queue cleaned by admin', {
      adminId: (req).user.id,
      queue: name,
      grace
    });

    res.json({
      success: true,
      message: `Old jobs cleaned from ${name}`
    });
  })
);

/**
 * @route   POST /api/v1/jobs/schedule
 * @desc    Schedule a recurring job
 * @access  Admin
 */
router.post('/schedule',
  authorize('admin'),
  validateRequest([
    body('queue').notEmpty().withMessage('Queue name is required'),
    body('jobName').notEmpty().withMessage('Job name is required'),
    body('jobType').notEmpty().withMessage('Job type is required'),
    body('payload').isObject().withMessage('Payload must be an object'),
    body('cron').notEmpty().withMessage('Cron expression is required')
      .matches(/^[\d\*\/\-,\s]+$/).withMessage('Invalid cron expression')
  ]),
  asyncHandler(async (req, res) => {
    const { queue, jobName, jobType, payload, cron } = req.body;

    await jobProcessor.scheduleRecurringJob(queue, jobName, jobType, payload, cron);

    logger.info('Recurring job scheduled by admin', {
      adminId: (req).user.id,
      queue,
      jobName,
      jobType,
      cron
    });

    res.json({
      success: true,
      data: {
        jobName,
        queue,
        type: jobType,
        schedule: cron,
        message: 'Recurring job scheduled successfully'
      }
    });
  })
);

/**
 * @route   GET /api/v1/jobs/types
 * @desc    Get available job types
 * @access  Private
 */
router.get('/types',
  asyncHandler(async (req, res) => {
    const jobTypes = [
      {
        type: 'sendEmail',
        queue: 'email',
        description: 'Send email notification',
        requiredFields: ['to', 'subject', 'body'],
        optionalFields: ['template', 'attachments']
      },
      {
        type: 'sendSMS',
        queue: 'sms',
        description: 'Send SMS notification',
        requiredFields: ['to', 'message']
      },
      {
        type: 'exportData',
        queue: 'export',
        description: 'Export data to file',
        requiredFields: ['type', 'format'],
        optionalFields: ['filters', 'fields']
      },
      {
        type: 'importData',
        queue: 'import',
        description: 'Import data from file',
        requiredFields: ['type', 'fileUrl'],
        optionalFields: ['mappings', 'validation']
      },
      {
        type: 'generateAnalytics',
        queue: 'analytics',
        description: 'Generate analytics report',
        requiredFields: ['reportType', 'dateRange'],
        optionalFields: ['filters', 'groupBy']
      },
      {
        type: 'processImage',
        queue: 'imageProcessing',
        description: 'Process and optimize image',
        requiredFields: ['filename', 'operations'],
        optionalFields: ['format', 'quality']
      },
      {
        type: 'sendNotification',
        queue: 'notifications',
        description: 'Send in-app notification',
        requiredFields: ['userId', 'type', 'title', 'message'],
        optionalFields: ['data', 'actions']
      }
    ];

    res.json({
      success: true,
      data: jobTypes
    });
  })
);

// WebSocket support for real-time job updates
// TODO: Implement WebSocket support with express-ws or socket.io
// router.ws('/stream', (ws, req) => {
//   const userId = (req).user?.id;
//
//   if (!userId) {
//     ws.close(1008, 'Unauthorized');
//     return;
//   }
//
//   logger.info('WebSocket connection for job updates', { userId });

//   // Subscribe to job events
//   const handlers = {
//     'job:completed': (event: any) => {
//       ws.send(JSON.stringify({ type: 'job:completed', ...event }));
//     },
//     'job:failed': (event: any) => {
//       ws.send(JSON.stringify({ type: 'job:failed', ...event }));
//     },
//     'job:progress': (event: any) => {
//       ws.send(JSON.stringify({ type: 'job:progress', ...event }));
//     }
//   };
//
//   // Register event handlers
//   Object.entries(handlers).forEach(([event, handler]) => {
//     jobProcessor.on(event, handler);
//   });
//
//   // Ping to keep connection alive
//   const pingInterval = setInterval(() => {
//     if (ws.readyState === ws.OPEN) {
//       ws.ping();
//     }
//   }, 30000);
//
//   // Cleanup on disconnect
//   ws.on('close', () => {
//     clearInterval(pingInterval);
//     Object.entries(handlers).forEach(([event, handler]) => {
//       jobProcessor.off(event, handler);
//     });
//     logger.info('WebSocket disconnected for job updates', { userId });
//   });
// });

export default router;
