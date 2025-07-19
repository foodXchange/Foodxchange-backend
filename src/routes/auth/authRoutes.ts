import { Router } from 'express';
import { asyncHandler } from '../../core/errors';
import { authController } from '../../controllers/auth/AuthController';
import { authenticate } from '../../middleware/auth';
import { validateRequest } from '../../middleware/validation';
import { body } from 'express-validator';

const router = Router();

// Health check
router.get('/health', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Auth service is healthy',
    timestamp: new Date().toISOString()
  });
}));

// Register
router.post('/register', 
  validateRequest([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('role').optional().isIn(['buyer', 'seller', 'agent']).withMessage('Invalid role'),
    body('company').optional().trim(),
    body('phone').optional().isMobilePhone('any'),
    body('acceptTerms').optional().isBoolean()
  ]),
  asyncHandler(authController.register.bind(authController))
);

// Login
router.post('/login', 
  validateRequest([
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    body('rememberMe').optional().isBoolean()
  ]),
  asyncHandler(authController.login.bind(authController))
);

// Two-Factor Authentication
router.post('/2fa/verify', 
  validateRequest([
    body('challengeId').notEmpty(),
    body('code').notEmpty(),
    body('userId').notEmpty()
  ]),
  asyncHandler(authController.verifyTwoFactor.bind(authController))
);

router.post('/2fa/enable', 
  authenticate,
  asyncHandler(authController.enableTwoFactor.bind(authController))
);

router.post('/2fa/confirm', 
  authenticate,
  validateRequest([
    body('token').notEmpty()
  ]),
  asyncHandler(authController.confirmTwoFactor.bind(authController))
);

router.post('/2fa/disable', 
  authenticate,
  asyncHandler(authController.disableTwoFactor.bind(authController))
);

// Password Management
router.post('/forgot-password', 
  validateRequest([
    body('email').isEmail().normalizeEmail()
  ]),
  asyncHandler(authController.forgotPassword.bind(authController))
);

router.post('/reset-password', 
  validateRequest([
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ]),
  asyncHandler(authController.resetPassword.bind(authController))
);

router.post('/change-password', 
  authenticate,
  validateRequest([
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  ]),
  asyncHandler(authController.updatePassword.bind(authController))
);

// Email Verification
router.post('/verify-email', 
  validateRequest([
    body('token').notEmpty()
  ]),
  asyncHandler(authController.verifyEmail.bind(authController))
);

// Token Management
router.post('/refresh-token', 
  validateRequest([
    body('refreshToken').notEmpty()
  ]),
  asyncHandler(authController.refreshToken.bind(authController))
);

// Profile Management
router.get('/me', 
  authenticate,
  asyncHandler(authController.getMe.bind(authController))
);

router.put('/profile', 
  authenticate,
  validateRequest([
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('phone').optional().isMobilePhone('any'),
    body('preferences').optional().isObject()
  ]),
  asyncHandler(authController.updateProfile.bind(authController))
);

// Logout
router.post('/logout', 
  authenticate,
  asyncHandler(authController.logout.bind(authController))
);

router.post('/logout-all', 
  authenticate,
  asyncHandler(authController.logoutAll.bind(authController))
);

// Social Authentication
router.get('/google', asyncHandler(authController.googleLogin.bind(authController)));
router.get('/google/callback', asyncHandler(authController.googleCallback.bind(authController)));

export default router;