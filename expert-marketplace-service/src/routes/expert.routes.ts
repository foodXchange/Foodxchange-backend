import { Router } from 'express';
import multer from 'multer';
import { ExpertController } from '../controllers/ExpertController';
import { 
  authenticateToken,
  requireRole,
  requirePermissions,
  requireVerifiedExpert,
  requireCompleteProfile,
  requireResourceOwnership
} from '../middleware/auth.middleware';
import {
  sanitizeInput,
  preventSQLInjection,
  preventXSS,
  validationSchemas,
  handleValidationErrors,
  advancedRateLimit,
  secureFileUpload
} from '../middleware/security.middleware';
import { UserRole, ExpertPermission } from '../interfaces/auth.interface';
import { config } from '../config';

const router = Router();
const expertController = new ExpertController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.fileUpload.maxSizeMB * 1024 * 1024, // Convert MB to bytes
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = config.fileUpload.allowedTypes;
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
    
    if (fileExtension && allowedTypes.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${fileExtension} not allowed`));
    }
  }
});

// Rate limiting configurations
const generalRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req) => `expert:${req.user?.expertId || req.ip}`
});

const uploadRateLimit = advancedRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyGenerator: (req) => `upload:${req.user?.expertId || req.ip}`
});

// Apply security middleware to all routes
router.use(sanitizeInput);
router.use(preventSQLInjection);
router.use(preventXSS);

// All routes require expert authentication
router.use(authenticateToken);
router.use(requireRole(UserRole.EXPERT));

// Expert Profile Management

/**
 * @route   GET /api/v1/experts/profile/:expertId
 * @desc    Get expert profile by ID (public view)
 * @access  Private (Any authenticated expert)
 */
router.get('/profile/:expertId',
  generalRateLimit,
  expertController.getExpertProfile
);

/**
 * @route   PUT /api/v1/experts/profile
 * @desc    Update expert profile
 * @access  Private (Expert - own profile)
 */
router.put('/profile',
  generalRateLimit,
  requirePermissions(ExpertPermission.MANAGE_PROFILE),
  validationSchemas.expertProfileUpdate,
  handleValidationErrors,
  expertController.updateExpertProfile
);

/**
 * @route   POST /api/v1/experts/profile/photo
 * @desc    Upload profile photo
 * @access  Private (Expert - own profile)
 */
router.post('/profile/photo',
  uploadRateLimit,
  requirePermissions(ExpertPermission.MANAGE_PROFILE),
  upload.single('photo'),
  secureFileUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1
  }),
  expertController.uploadProfilePhoto
);

/**
 * @route   PUT /api/v1/experts/availability
 * @desc    Update expert availability
 * @access  Private (Expert - own profile)
 */
router.put('/availability',
  generalRateLimit,
  requirePermissions(ExpertPermission.UPDATE_AVAILABILITY),
  expertController.updateAvailability
);

// Dashboard and Analytics

/**
 * @route   GET /api/v1/experts/dashboard
 * @desc    Get expert dashboard data
 * @access  Private (Expert - own data)
 */
router.get('/dashboard',
  generalRateLimit,
  expertController.getDashboard
);

/**
 * @route   GET /api/v1/experts/analytics
 * @desc    Get expert analytics
 * @access  Private (Expert - own data)
 */
router.get('/analytics',
  generalRateLimit,
  requirePermissions(ExpertPermission.VIEW_ANALYTICS),
  expertController.getAnalytics
);

// Services Management

/**
 * @route   POST /api/v1/experts/services
 * @desc    Create new service
 * @access  Private (Verified Expert)
 */
router.post('/services',
  generalRateLimit,
  requireVerifiedExpert,
  requirePermissions(ExpertPermission.MANAGE_SERVICES),
  expertController.createService
);

/**
 * @route   GET /api/v1/experts/services
 * @desc    Get expert services
 * @access  Private (Expert - own services)
 */
router.get('/services',
  generalRateLimit,
  expertController.getServices
);

/**
 * @route   PUT /api/v1/experts/services/:serviceId
 * @desc    Update service
 * @access  Private (Expert - own service)
 */
router.put('/services/:serviceId',
  generalRateLimit,
  requirePermissions(ExpertPermission.MANAGE_SERVICES),
  expertController.updateService
);

/**
 * @route   DELETE /api/v1/experts/services/:serviceId
 * @desc    Delete service
 * @access  Private (Expert - own service)
 */
router.delete('/services/:serviceId',
  generalRateLimit,
  requirePermissions(ExpertPermission.MANAGE_SERVICES),
  expertController.deleteService
);

// Collaboration Management

/**
 * @route   GET /api/v1/experts/collaborations
 * @desc    Get expert collaborations
 * @access  Private (Expert - own collaborations)
 */
router.get('/collaborations',
  generalRateLimit,
  requirePermissions(ExpertPermission.VIEW_COLLABORATIONS),
  expertController.getCollaborations
);

// Verification Management

/**
 * @route   GET /api/v1/experts/verification
 * @desc    Get verification status
 * @access  Private (Expert - own verification)
 */
router.get('/verification',
  generalRateLimit,
  expertController.getVerificationStatus
);

/**
 * @route   POST /api/v1/experts/verification/documents
 * @desc    Upload verification documents
 * @access  Private (Expert - own verification)
 */
router.post('/verification/documents',
  uploadRateLimit,
  upload.array('documents', 5),
  secureFileUpload({
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  }),
  expertController.uploadVerificationDocuments
);

export default router;