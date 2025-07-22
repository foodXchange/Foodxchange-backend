import { Router } from 'express';

import { Logger } from '../../../core/logging/logger';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { authenticate } from '../../../middleware/auth';
import { authorize } from '../../../middleware/authorize';
import { memoryOptimizationService } from '../../../services/optimization/MemoryOptimizationService';

const router = Router();
const logger = new Logger('MemoryRoutes');

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @route   GET /api/v1/memory/stats
 * @desc    Get current memory statistics
 * @access  Admin
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    const stats = memoryOptimizationService.getStatistics();

    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route   GET /api/v1/memory/metrics
 * @desc    Get current memory metrics
 * @access  Admin
 */
router.get('/metrics',
  asyncHandler(async (req, res) => {
    const metrics = memoryOptimizationService.getCurrentMetrics();

    res.json({
      success: true,
      data: metrics
    });
  })
);

/**
 * @route   GET /api/v1/memory/report
 * @desc    Generate comprehensive memory report
 * @access  Admin
 */
router.get('/report',
  asyncHandler(async (req, res) => {
    const report = await memoryOptimizationService.createMemoryReport();

    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route   POST /api/v1/memory/gc
 * @desc    Trigger manual garbage collection
 * @access  Admin
 */
router.post('/gc',
  asyncHandler(async (req, res) => {
    if (!global.gc) {
      return res.status(503).json({
        success: false,
        error: 'Garbage collection not available. Run with --expose-gc flag'
      });
    }

    memoryOptimizationService.performGarbageCollection();

    logger.info('Manual garbage collection triggered', {
      adminId: (req).user.id
    });

    res.json({
      success: true,
      message: 'Garbage collection completed',
      metrics: memoryOptimizationService.getCurrentMetrics()
    });
  })
);

/**
 * @route   GET /api/v1/memory/leaks
 * @desc    Detect potential memory leaks
 * @access  Admin
 */
router.get('/leaks',
  asyncHandler(async (req, res) => {
    const leakDetection = await memoryOptimizationService.detectMemoryLeaks();

    res.json({
      success: true,
      data: leakDetection
    });
  })
);

/**
 * @route   GET /api/v1/memory/recommendations
 * @desc    Get memory optimization recommendations
 * @access  Admin
 */
router.get('/recommendations',
  asyncHandler(async (req, res) => {
    const recommendations = memoryOptimizationService.getOptimizationRecommendations();

    res.json({
      success: true,
      data: {
        recommendations,
        currentMetrics: memoryOptimizationService.getCurrentMetrics()
      }
    });
  })
);

/**
 * @route   POST /api/v1/memory/optimize
 * @desc    Apply memory optimizations
 * @access  Admin
 */
router.post('/optimize',
  asyncHandler(async (req, res) => {
    memoryOptimizationService.applyOptimizations();

    logger.info('Memory optimizations applied', {
      adminId: (req).user.id
    });

    res.json({
      success: true,
      message: 'Memory optimizations applied',
      metrics: memoryOptimizationService.getCurrentMetrics()
    });
  })
);

/**
 * @route   GET /api/v1/memory/heap
 * @desc    Get V8 heap statistics
 * @access  Admin
 */
router.get('/heap',
  asyncHandler(async (req, res) => {
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    const heapSpaces = v8.getHeapSpaceStatistics();

    res.json({
      success: true,
      data: {
        statistics: heapStats,
        spaces: heapSpaces,
        snapshot: {
          totalHeapSize: formatBytes(heapStats.total_heap_size),
          heapSizeLimit: formatBytes(heapStats.heap_size_limit),
          usedHeapSize: formatBytes(heapStats.used_heap_size),
          mallocedMemory: formatBytes(heapStats.malloced_memory),
          peakMallocedMemory: formatBytes(heapStats.peak_malloced_memory),
          availableSize: formatBytes(heapStats.total_available_size)
        }
      }
    });
  })
);

/**
 * @route   GET /api/v1/memory/process
 * @desc    Get process memory information
 * @access  Admin
 */
router.get('/process',
  asyncHandler(async (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    res.json({
      success: true,
      data: {
        memory: {
          rss: formatBytes(memUsage.rss),
          heapTotal: formatBytes(memUsage.heapTotal),
          heapUsed: formatBytes(memUsage.heapUsed),
          external: formatBytes(memUsage.external),
          arrayBuffers: formatBytes(memUsage.arrayBuffers || 0)
        },
        cpu: {
          user: `${(cpuUsage.user / 1000000).toFixed(2)  }s`,
          system: `${(cpuUsage.system / 1000000).toFixed(2)  }s`
        },
        process: {
          pid: process.pid,
          ppid: process.ppid,
          uptime: process.uptime(),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      }
    });
  })
);

/**
 * @route   WebSocket /api/v1/memory/stream
 * @desc    Stream real-time memory metrics
 * @access  Admin
 */
// TODO: Implement WebSocket support with express-ws or socket.io
// router.ws('/stream', (ws, req) => {
//   const adminId = (req).user?.id;
//
//   if (!adminId) {
//     ws.close(1008, 'Unauthorized');
//     return;
//   }
//
//   logger.info('WebSocket connection for memory monitoring', { adminId });
//
//   // Send current metrics immediately
//   const currentMetrics = memoryOptimizationService.getCurrentMetrics();
//   if (currentMetrics) {
//     ws.send(JSON.stringify({
//       type: 'metrics',
//       data: currentMetrics
//     }));
//   }
//
//   // Subscribe to metrics updates
//   const metricsHandler = (metrics: any) => {
//     if (ws.readyState === ws.OPEN) {
//       ws.send(JSON.stringify({
//         type: 'metrics',
//         data: metrics
//       }));
//     }
//   };
//
//   const gcHandler = (data: any) => {
//     if (ws.readyState === ws.OPEN) {
//       ws.send(JSON.stringify({
//         type: 'gc',
//         data
//       }));
//     }
//   };
//
//   const warningHandler = (metrics: any) => {
//     if (ws.readyState === ws.OPEN) {
//       ws.send(JSON.stringify({
//         type: 'warning',
//         data: metrics
//       }));
//     }
//   };
//
//   const criticalHandler = (metrics: any) => {
//     if (ws.readyState === ws.OPEN) {
//       ws.send(JSON.stringify({
//         type: 'critical',
//         data: metrics
//       }));
//     }
//   };
//
//   // Register handlers
//   memoryOptimizationService.on('metrics', metricsHandler);
//   memoryOptimizationService.on('gc', gcHandler);
//   memoryOptimizationService.on('warning', warningHandler);
//   memoryOptimizationService.on('critical', criticalHandler);
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
//     memoryOptimizationService.off('metrics', metricsHandler);
//     memoryOptimizationService.off('gc', gcHandler);
//     memoryOptimizationService.off('warning', warningHandler);
//     memoryOptimizationService.off('critical', criticalHandler);
//     logger.info('WebSocket disconnected for memory monitoring', { adminId });
//   });
// });

// Helper function to format bytes
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = Math.abs(bytes);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)  } ${  units[unitIndex]}`;
}

export default router;
