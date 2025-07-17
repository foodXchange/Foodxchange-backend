import express from 'express';
import { HACCPController } from '../../controllers/HACCPController';
import { authMiddleware } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../core/errors';

const router = express.Router();
const haccpController = new HACCPController();

// Rate limiter for HACCP operations
const haccpRateLimiter = createCustomRateLimiter('haccp', 60, 200); // 200 requests per hour

// Apply middleware to all routes
router.use(authMiddleware);
router.use(enforceTenantIsolation);
router.use(haccpRateLimiter);

/**
 * @route GET /api/v1/compliance/haccp/dashboard
 * @desc Get HACCP dashboard data
 * @access Private
 */
router.get('/dashboard', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.getDashboard.bind(haccpController))
);

/**
 * @route POST /api/v1/compliance/haccp/ccp
 * @desc Create a new Critical Control Point
 * @access Private
 */
router.post('/ccp', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.createCCP.bind(haccpController))
);

/**
 * @route POST /api/v1/compliance/haccp/measurements
 * @desc Record a CCP measurement
 * @access Private
 */
router.post('/measurements', 
  authorize(['admin', 'manager', 'compliance', 'operator']),
  asyncHandler(haccpController.recordMeasurement.bind(haccpController))
);

/**
 * @route GET /api/v1/compliance/haccp/measurements
 * @desc Get CCP measurements
 * @access Private
 */
router.get('/measurements', 
  authorize(['admin', 'manager', 'compliance', 'operator']),
  asyncHandler(haccpController.getMeasurements.bind(haccpController))
);

/**
 * @route GET /api/v1/compliance/haccp/alerts
 * @desc Get compliance alerts
 * @access Private
 */
router.get('/alerts', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.getAlerts.bind(haccpController))
);

/**
 * @route POST /api/v1/compliance/haccp/alerts/:id/acknowledge
 * @desc Acknowledge compliance alert
 * @access Private
 */
router.post('/alerts/:id/acknowledge', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.acknowledgeAlert.bind(haccpController))
);

/**
 * @route POST /api/v1/compliance/haccp/alerts/:id/resolve
 * @desc Resolve compliance alert
 * @access Private
 */
router.post('/alerts/:id/resolve', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.resolveAlert.bind(haccpController))
);

/**
 * @route GET /api/v1/compliance/haccp/reports
 * @desc Generate compliance report
 * @access Private
 */
router.get('/reports', 
  authorize(['admin', 'manager', 'compliance']),
  asyncHandler(haccpController.generateReport.bind(haccpController))
);

export default router;