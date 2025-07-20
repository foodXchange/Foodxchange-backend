import { Router, Request, Response } from 'express';

import { asyncHandler } from '../core/errors';
import { healthCheckService } from '../services/health/HealthCheckService';
import { prometheusMetrics } from '../services/metrics/PrometheusMetricsService';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Get system health status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System health report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, degraded]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 checks:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       healthy:
 *                         type: boolean
 *                       message:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                       responseTime:
 *                         type: number
 *                       details:
 *                         type: object
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     healthy:
 *                       type: number
 *                     unhealthy:
 *                       type: number
 *                     degraded:
 *                       type: number
 *       503:
 *         description: System is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const healthReport = await healthCheckService.runHealthChecks();

  const statusCode = healthReport.status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    success: healthReport.status === 'healthy',
    data: healthReport,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /health/quick:
 *   get:
 *     summary: Get quick health status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Quick health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 */
router.get('/health/quick', asyncHandler(async (req: Request, res: Response) => {
  const quickHealth = await healthCheckService.getQuickHealth();

  res.status(200).json({
    success: true,
    data: quickHealth,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe endpoint
 *     tags: [Health]
 *     description: Kubernetes liveness probe endpoint
 *     responses:
 *       200:
 *         description: Application is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 alive:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health/live', asyncHandler(async (req: Request, res: Response) => {
  const livenessCheck = await healthCheckService.getLivenessCheck();

  res.status(200).json({
    success: true,
    data: livenessCheck,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe endpoint
 *     tags: [Health]
 *     description: Kubernetes readiness probe endpoint
 *     responses:
 *       200:
 *         description: Application is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 details:
 *                   type: object
 *       503:
 *         description: Application is not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/health/ready', asyncHandler(async (req: Request, res: Response) => {
  const readinessCheck = await healthCheckService.getReadinessCheck();

  const statusCode = readinessCheck.ready ? 200 : 503;

  res.status(statusCode).json({
    success: readinessCheck.ready,
    data: readinessCheck,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     tags: [Health]
 *     description: Prometheus metrics in text format
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const metrics = await prometheusMetrics.getMetrics();

  res.setHeader('Content-Type', 'text/plain');
  res.send(metrics);
}));

/**
 * @swagger
 * /health/database:
 *   get:
 *     summary: Database health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 responseTime:
 *                   type: number
 *                 details:
 *                   type: object
 */
router.get('/health/database', asyncHandler(async (req: Request, res: Response) => {
  const healthReport = await healthCheckService.runHealthChecks();
  const dbHealth = healthReport.checks.database;

  const statusCode = dbHealth.healthy ? 200 : 503;

  res.status(statusCode).json({
    success: dbHealth.healthy,
    data: dbHealth,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /health/cache:
 *   get:
 *     summary: Cache health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Cache health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 responseTime:
 *                   type: number
 *                 details:
 *                   type: object
 */
router.get('/health/cache', asyncHandler(async (req: Request, res: Response) => {
  const healthReport = await healthCheckService.runHealthChecks();
  const cacheHealth = healthReport.checks.cache;

  const statusCode = cacheHealth.healthy ? 200 : 503;

  res.status(statusCode).json({
    success: cacheHealth.healthy,
    data: cacheHealth,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

/**
 * @swagger
 * /health/memory:
 *   get:
 *     summary: Memory health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Memory health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 responseTime:
 *                   type: number
 *                 details:
 *                   type: object
 */
router.get('/health/memory', asyncHandler(async (req: Request, res: Response) => {
  const healthReport = await healthCheckService.runHealthChecks();
  const memoryHealth = healthReport.checks.memory;

  const statusCode = memoryHealth.healthy ? 200 : 503;

  res.status(statusCode).json({
    success: memoryHealth.healthy,
    data: memoryHealth,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.id
    }
  });
}));

export default router;
