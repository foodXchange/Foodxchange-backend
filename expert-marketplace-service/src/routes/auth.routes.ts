import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { 
  authenticateToken,
  requireRole,
  requirePermissions,
  requireTwoFactor,
  rateLimitSensitive
} from '../middleware/auth.middleware';
import {
  sanitizeInput,
  preventSQLInjection,
  preventXSS,
  validationSchemas,
  handleValidationErrors,
  advancedRateLimit
} from '../middleware/security.middleware';
import { UserRole, ExpertPermission } from '../interfaces/auth.interface';

const router = Router();
const authController = new AuthController();

// Rate limiting configurations
const authRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (req) => `auth:${req.ip}`
});

const generalRateLimit = advancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req) => `general:${req.ip}`
});

// Apply security middleware to all routes
router.use(sanitizeInput);
router.use(preventSQLInjection);
router.use(preventXSS);

// Public routes (no authentication required)

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new expert
 * @access  Public
 */
router.post('/register',
  authRateLimit,
  validationSchemas.expertRegistration,
  handleValidationErrors,
  authController.registerExpert
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login expert
 * @access  Public
 */
router.post('/login',
  authRateLimit,
  validationSchemas.expertLogin,
  handleValidationErrors,
  authController.loginExpert
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh',
  generalRateLimit,
  authController.refreshToken
);

/**
 * @route   GET /api/v1/auth/verify-email/:token
 * @desc    Verify email address
 * @access  Public
 */
router.get('/verify-email/:token',
  generalRateLimit,
  authController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password',
  authRateLimit,
  authController.requestPasswordReset
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  authRateLimit,
  authController.resetPassword
);

// Protected routes (authentication required)

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout expert
 * @access  Private (Expert)
 */
router.post('/logout',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  authController.logout
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current expert profile
 * @access  Private (Expert)
 */
router.get('/me',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  authController.getCurrentExpert
);

// Two-Factor Authentication routes

/**
 * @route   POST /api/v1/auth/2fa/setup
 * @desc    Setup two-factor authentication
 * @access  Private (Expert)
 */
router.post('/2fa/setup',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  rateLimitSensitive(3, 60), // 3 attempts per hour
  authController.setupTwoFactor
);

/**
 * @route   POST /api/v1/auth/2fa/enable
 * @desc    Enable two-factor authentication
 * @access  Private (Expert)
 */
router.post('/2fa/enable',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  rateLimitSensitive(5, 60), // 5 attempts per hour
  authController.enableTwoFactor
);

/**
 * @route   POST /api/v1/auth/2fa/disable
 * @desc    Disable two-factor authentication
 * @access  Private (Expert)
 */
router.post('/2fa/disable',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  rateLimitSensitive(3, 60), // 3 attempts per hour
  authController.disableTwoFactor
);

// Password Management routes

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password
 * @access  Private (Expert)
 */
router.post('/change-password',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  rateLimitSensitive(5, 60), // 5 attempts per hour
  authController.changePassword
);

// Security Settings routes

/**
 * @route   GET /api/v1/auth/security
 * @desc    Get security settings
 * @access  Private (Expert)
 */
router.get('/security',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  authController.getSecuritySettings
);

/**
 * @route   PUT /api/v1/auth/security
 * @desc    Update security settings
 * @access  Private (Expert)
 */
router.put('/security',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  authController.updateSecuritySettings
);

/**
 * @route   GET /api/v1/auth/login-history
 * @desc    Get login history
 * @access  Private (Expert)
 */
router.get('/login-history',
  authenticateToken,
  requireRole(UserRole.EXPERT),
  authController.getLoginHistory
);

export default router;