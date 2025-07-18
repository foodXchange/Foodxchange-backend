import express from 'express';
import { authController } from '../controllers/auth/authController';
import { protect } from '../middleware/auth';
import { validateRequest } from '../middleware/advancedValidation';
import { body } from 'express-validator';

const router = express.Router();

// Validation rules
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('role')
    .isIn(['buyer', 'seller', 'admin', 'contractor', 'agent'])
    .withMessage('Invalid role specified')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const updatePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

// Public routes
router.post('/register', registerValidation, validateRequest, (req, res) => authController.register(req, res));
router.post('/login', loginValidation, validateRequest, (req, res) => authController.login(req, res));
router.post('/refresh', refreshTokenValidation, validateRequest, (req, res) => authController.refreshToken(req, res));

// Protected routes
router.get('/me', protect, (req, res) => authController.getMe(req, res));
router.put('/update-password', protect, updatePasswordValidation, validateRequest, (req, res) => authController.updatePassword(req, res));
router.post('/logout', protect, (req, res) => authController.logout(req, res));
router.post('/logout-all', protect, (req, res) => authController.logoutAll(req, res));

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    message: 'Auth service is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      refresh: 'POST /api/auth/refresh',
      me: 'GET /api/auth/me',
      updatePassword: 'PUT /api/auth/update-password',
      logout: 'POST /api/auth/logout',
      logoutAll: 'POST /api/auth/logout-all'
    }
  });
});

export default router;