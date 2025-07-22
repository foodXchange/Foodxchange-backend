import { Router } from 'express';
import multer from 'multer';
import { authenticate as authMiddleware } from '../middleware/auth';
import { authorizeRoles } from '../middleware/roleAuth';
import { uploadController } from '../controllers/uploadController';

const router = Router();

// Configure multer for CSV file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// CSV upload endpoints
router.post('/csv/products', 
  authMiddleware, 
  authorizeRoles(['admin', 'seller']),
  upload.single('file'),
  uploadController.uploadProductsCSV
);

router.post('/csv/users',
  authMiddleware,
  authorizeRoles(['admin']),
  upload.single('file'),
  uploadController.uploadUsersCSV
);

router.post('/csv/companies',
  authMiddleware,
  authorizeRoles(['admin']),
  upload.single('file'),
  uploadController.uploadCompaniesCSV
);

router.post('/csv/orders',
  authMiddleware,
  authorizeRoles(['admin']),
  upload.single('file'),
  uploadController.uploadOrdersCSV
);

// Get CSV templates (public access for testing)
router.get('/csv/template/:type',
  uploadController.getCSVTemplate
);

// Get upload history
router.get('/csv/history',
  authMiddleware,
  authorizeRoles(['admin']),
  uploadController.getUploadHistory
);

// Get upload status
router.get('/csv/status/:uploadId',
  authMiddleware,
  uploadController.getUploadStatus
);

export default router;