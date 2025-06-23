const router = require('express').Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);

// OAuth routes (placeholders)
router.get('/google', (req, res) => {
  // TODO: Implement Google OAuth
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_not_implemented`);
});

router.get('/linkedin', (req, res) => {
  // TODO: Implement LinkedIn OAuth
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_not_implemented`);
});

module.exports = router;
