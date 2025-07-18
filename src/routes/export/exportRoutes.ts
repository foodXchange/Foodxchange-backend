import express from 'express';
import { ExportController } from '../../controllers/ExportController';
import { requireAuth } from '../../middleware/auth';
import { enforceTenantIsolation } from '../../middleware/tenantIsolation';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';
import { authorize } from '../../middleware/authorize';
import { asyncHandler } from '../../core/errors';
import multer from 'multer';
import * as path from 'path';

const router = express.Router();
const exportController = new ExportController();

// Rate limiter for export/import operations (lower limits due to resource intensity)
const exportRateLimiter = createCustomRateLimiter('export', 60, 20); // 20 requests per hour

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and JSON files are allowed.'));
    }
  }
});

// Apply middleware to all routes
router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(exportRateLimiter);

/**
 * @route GET /api/v1/export/products
 * @desc Export products to CSV, Excel, or JSON
 * @access Private
 */
router.get('/products', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.exportProducts.bind(exportController))
);

/**
 * @route GET /api/v1/export/orders
 * @desc Export orders to CSV, Excel, or JSON
 * @access Private
 */
router.get('/orders', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.exportOrders.bind(exportController))
);

/**
 * @route GET /api/v1/export/rfqs
 * @desc Export RFQs to CSV, Excel, or JSON
 * @access Private
 */
router.get('/rfqs', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.exportRFQs.bind(exportController))
);

/**
 * @route GET /api/v1/export/analytics
 * @desc Export analytics data
 * @access Private
 */
router.get('/analytics', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.exportAnalytics.bind(exportController))
);

/**
 * @route POST /api/v1/export/import/products
 * @desc Import products from CSV, Excel, or JSON
 * @access Private
 */
router.post('/import/products', 
  authorize(['admin', 'manager']),
  upload.single('file'),
  asyncHandler(exportController.importProducts.bind(exportController))
);

/**
 * @route POST /api/v1/export/import/orders
 * @desc Import orders from CSV, Excel, or JSON
 * @access Private
 */
router.post('/import/orders', 
  authorize(['admin', 'manager']),
  upload.single('file'),
  asyncHandler(exportController.importOrders.bind(exportController))
);

/**
 * @route GET /api/v1/export/template/:dataType/:format
 * @desc Get export template for data type
 * @access Private
 */
router.get('/template/:dataType/:format', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.getExportTemplate.bind(exportController))
);

/**
 * @route GET /api/v1/export/download/:fileName
 * @desc Download export file
 * @access Private
 */
router.get('/download/:fileName', 
  authorize(['admin', 'manager', 'analyst', 'user']),
  asyncHandler(exportController.downloadFile.bind(exportController))
);

/**
 * @route GET /api/v1/export/history
 * @desc Get export/import history
 * @access Private
 */
router.get('/history', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.getExportHistory.bind(exportController))
);

/**
 * @route GET /api/v1/export/options/:dataType
 * @desc Get available export options for data type
 * @access Private
 */
router.get('/options/:dataType', 
  authorize(['admin', 'manager', 'analyst']),
  asyncHandler(exportController.getExportOptions.bind(exportController))
);

export default router;