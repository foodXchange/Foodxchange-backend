import express from 'express';
import { Request, Response } from 'express';
import { twoFactorAuthService } from '../../services/auth/TwoFactorAuthService';
import { protect } from '../../middleware/auth';
import { require2FAFor } from '../../middleware/twoFactorAuth';
import { validateRequest } from '../../middleware/validation';
import { body, query } from 'express-validator';
import { Logger } from '../../core/logging/logger';

const router = express.Router();
const logger = new Logger('TwoFactorAuthRoutes');

// Validation rules
const setupTOTPValidation = [
  body('token')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Token must be a 6-digit number')
];

const verifyTOTPValidation = [
  body('token')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Token must be a 6-digit number')
];

const sendSMSValidation = [
  body('phoneNumber')
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number')
];

const sendEmailValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
];

const verifyChallengeValidation = [
  body('challengeId')
    .isUUID()
    .withMessage('Invalid challenge ID'),
  body('code')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code must be a 6-digit number')
];

const verifyBackupCodeValidation = [
  body('backupCode')
    .isLength({ min: 8, max: 8 })
    .isAlphanumeric()
    .withMessage('Backup code must be 8 alphanumeric characters')
];

/**
 * @desc    Get 2FA status for current user
 * @route   GET /api/auth/2fa/status
 * @access  Private
 */
router.get('/status', protect, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const isEnabled = await twoFactorAuthService.is2FAEnabled(userId);
    
    res.json({
      success: true,
      data: {
        isEnabled,
        setupUrl: isEnabled ? null : '/api/auth/2fa/setup',
        backupCodesUrl: isEnabled ? '/api/auth/2fa/backup-codes' : null
      }
    });
  } catch (error: any) {
    logger.error('Get 2FA status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get 2FA status'
    });
  }
});

/**
 * @desc    Setup TOTP 2FA - Generate secret and QR code
 * @route   POST /api/auth/2fa/setup
 * @access  Private
 */
router.post('/setup', protect, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Check if 2FA is already enabled
    const isEnabled = await twoFactorAuthService.is2FAEnabled(userId);
    if (isEnabled) {
      return res.status(400).json({
        success: false,
        error: 'Two-factor authentication is already enabled'
      });
    }
    
    const secret = await twoFactorAuthService.generateTOTPSecret(userId);
    
    res.json({
      success: true,
      data: {
        secret: secret.secret,
        qrCode: secret.qrCode,
        backupCodes: secret.backupCodes,
        instructions: 'Scan the QR code with your authenticator app and enter the 6-digit code to complete setup'
      }
    });
  } catch (error: any) {
    logger.error('Setup 2FA error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to setup 2FA'
    });
  }
});

/**
 * @desc    Verify TOTP token and enable 2FA
 * @route   POST /api/auth/2fa/verify-setup
 * @access  Private
 */
router.post('/verify-setup', protect, setupTOTPValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { token } = req.body;
    
    const isValid = await twoFactorAuthService.verifyAndEnable2FA(userId, token);
    
    if (isValid) {
      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully',
        data: {
          isEnabled: true,
          backupCodesUrl: '/api/auth/2fa/backup-codes'
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid token. Please try again.'
      });
    }
  } catch (error: any) {
    logger.error('Verify setup 2FA error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify 2FA setup'
    });
  }
});

/**
 * @desc    Verify TOTP token for authentication
 * @route   POST /api/auth/2fa/verify
 * @access  Private
 */
router.post('/verify', protect, verifyTOTPValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { token } = req.body;
    
    // Get user's secret
    const user = await twoFactorAuthService.getUserById(userId);
    if (!user?.twoFactor?.secret) {
      return res.status(400).json({
        success: false,
        error: '2FA not enabled for this user'
      });
    }
    
    const secret = twoFactorAuthService.decryptSecret(user.twoFactor.secret);
    const isValid = await twoFactorAuthService.verifyTOTPToken(secret, token);
    
    if (isValid) {
      res.json({
        success: true,
        message: 'Token verified successfully',
        data: { verified: true }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid token'
      });
    }
  } catch (error: any) {
    logger.error('Verify 2FA token error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify 2FA token'
    });
  }
});

/**
 * @desc    Send SMS challenge
 * @route   POST /api/auth/2fa/challenge/sms
 * @access  Private
 */
router.post('/challenge/sms', protect, sendSMSValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { phoneNumber } = req.body;
    
    const challengeId = await twoFactorAuthService.sendSMSChallenge(userId, phoneNumber);
    
    res.json({
      success: true,
      data: {
        challengeId,
        expiresIn: 300, // 5 minutes
        message: 'SMS challenge sent successfully'
      }
    });
  } catch (error: any) {
    logger.error('Send SMS challenge error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send SMS challenge'
    });
  }
});

/**
 * @desc    Send email challenge
 * @route   POST /api/auth/2fa/challenge/email
 * @access  Private
 */
router.post('/challenge/email', protect, sendEmailValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { email } = req.body;
    
    const challengeId = await twoFactorAuthService.sendEmailChallenge(userId, email);
    
    res.json({
      success: true,
      data: {
        challengeId,
        expiresIn: 600, // 10 minutes
        message: 'Email challenge sent successfully'
      }
    });
  } catch (error: any) {
    logger.error('Send email challenge error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email challenge'
    });
  }
});

/**
 * @desc    Verify challenge code
 * @route   POST /api/auth/2fa/challenge/verify
 * @access  Private
 */
router.post('/challenge/verify', protect, verifyChallengeValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const { challengeId, code } = req.body;
    
    const isValid = await twoFactorAuthService.verifyChallengeCode(challengeId, code);
    
    if (isValid) {
      res.json({
        success: true,
        message: 'Challenge verified successfully',
        data: { verified: true }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid or expired challenge code'
      });
    }
  } catch (error: any) {
    logger.error('Verify challenge error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify challenge'
    });
  }
});

/**
 * @desc    Verify backup code
 * @route   POST /api/auth/2fa/backup-code/verify
 * @access  Private
 */
router.post('/backup-code/verify', protect, verifyBackupCodeValidation, validateRequest, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { backupCode } = req.body;
    
    const isValid = await twoFactorAuthService.verifyBackupCode(userId, backupCode);
    
    if (isValid) {
      res.json({
        success: true,
        message: 'Backup code verified successfully',
        data: { verified: true }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid backup code'
      });
    }
  } catch (error: any) {
    logger.error('Verify backup code error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify backup code'
    });
  }
});

/**
 * @desc    Regenerate backup codes
 * @route   POST /api/auth/2fa/backup-codes/regenerate
 * @access  Private (requires 2FA)
 */
router.post('/backup-codes/regenerate', protect, require2FAFor.twoFactorDisable, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    
    const backupCodes = await twoFactorAuthService.regenerateBackupCodes(userId);
    
    res.json({
      success: true,
      data: {
        backupCodes,
        message: 'Backup codes regenerated successfully. Please save these codes in a secure location.'
      }
    });
  } catch (error: any) {
    logger.error('Regenerate backup codes error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to regenerate backup codes'
    });
  }
});

/**
 * @desc    Disable 2FA
 * @route   DELETE /api/auth/2fa/disable
 * @access  Private (requires 2FA)
 */
router.delete('/disable', protect, require2FAFor.twoFactorDisable, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    
    await twoFactorAuthService.disable2FA(userId);
    
    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error: any) {
    logger.error('Disable 2FA error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disable 2FA'
    });
  }
});

/**
 * @desc    Get 2FA methods available
 * @route   GET /api/auth/2fa/methods
 * @access  Private
 */
router.get('/methods', protect, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const isEnabled = await twoFactorAuthService.is2FAEnabled(userId);
    
    res.json({
      success: true,
      data: {
        methods: {
          totp: {
            name: 'Authenticator App',
            description: 'Use Google Authenticator, Authy, or similar apps',
            enabled: isEnabled,
            setupUrl: isEnabled ? null : '/api/auth/2fa/setup'
          },
          sms: {
            name: 'SMS',
            description: 'Receive codes via text message',
            enabled: true,
            challengeUrl: '/api/auth/2fa/challenge/sms'
          },
          email: {
            name: 'Email',
            description: 'Receive codes via email',
            enabled: true,
            challengeUrl: '/api/auth/2fa/challenge/email'
          },
          backupCodes: {
            name: 'Backup Codes',
            description: 'Use single-use backup codes',
            enabled: isEnabled,
            verifyUrl: '/api/auth/2fa/backup-code/verify'
          }
        }
      }
    });
  } catch (error: any) {
    logger.error('Get 2FA methods error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get 2FA methods'
    });
  }
});

export default router;