import express from 'express';
import { body, param, query } from 'express-validator';

import { Logger } from '../core/logging/logger';
import { auth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { mobilePushNotificationService } from '../services/notifications/MobilePushNotificationService';
import { notificationEventHandler } from '../services/notifications/NotificationEventHandler';

const router = express.Router();
const logger = new Logger('NotificationRoutes');

// Rate limiting for notifications
const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many notification requests'
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 device registrations per hour
  message: 'Too many device registration requests'
});

router.use(notificationLimiter);

/**
 * @route   POST /api/notifications/devices/register
 * @desc    Register device token for push notifications
 * @access  Private
 */
router.post('/devices/register',
  auth,
  registrationLimiter,
  [
    body('platform').isIn(['ios', 'android', 'web']).withMessage('Invalid platform'),
    body('token').notEmpty().withMessage('Token is required'),
    body('appVersion').optional().isString().withMessage('App version must be string'),
    body('deviceModel').optional().isString().withMessage('Device model must be string'),
    body('osVersion').optional().isString().withMessage('OS version must be string')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const { platform, token, appVersion, deviceModel, osVersion } = req.body;

      await mobilePushNotificationService.registerDeviceToken(
        req.user.id,
        platform,
        token,
        { appVersion, deviceModel, osVersion }
      );

      logger.info('Device token registered', {
        userId: req.user.id,
        platform,
        tokenLength: token.length
      });

      res.json({
        success: true,
        message: 'Device token registered successfully'
      });

    } catch (error) {
      logger.error('Failed to register device token', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register device token'
      });
    }
  }
);

/**
 * @route   DELETE /api/notifications/devices/unregister
 * @desc    Unregister device token
 * @access  Private
 */
router.delete('/devices/unregister',
  auth,
  [
    body('token').notEmpty().withMessage('Token is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const { token } = req.body;

      await mobilePushNotificationService.unregisterDeviceToken(req.user.id, token);

      logger.info('Device token unregistered', {
        userId: req.user.id,
        tokenLength: token.length
      });

      res.json({
        success: true,
        message: 'Device token unregistered successfully'
      });

    } catch (error) {
      logger.error('Failed to unregister device token', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unregister device token'
      });
    }
  }
);

/**
 * @route   POST /api/notifications/send
 * @desc    Send push notification (Admin only)
 * @access  Private (Admin)
 */
router.post('/send',
  auth,
  [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('body').notEmpty().withMessage('Body is required'),
    body('priority').optional().isIn(['low', 'normal', 'high']).withMessage('Invalid priority'),
    body('category').optional().isString().withMessage('Category must be string'),
    body('data').optional().isObject().withMessage('Data must be object'),
    body('scheduledAt').optional().isISO8601().withMessage('Invalid scheduled date')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { userId, title, body, priority, category, data, scheduledAt } = req.body;

      const notification = {
        id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        title,
        body,
        priority: priority || 'normal',
        category,
        data
      };

      let result;
      if (scheduledAt) {
        const scheduleId = await mobilePushNotificationService.scheduleNotification(
          notification,
          new Date(scheduledAt)
        );
        result = { scheduled: true, scheduleId };
      } else {
        result = await mobilePushNotificationService.sendNotification(notification);
      }

      logger.info('Manual notification sent', {
        adminId: req.user.id,
        targetUserId: userId,
        scheduled: !!scheduledAt
      });

      res.json({
        success: true,
        data: result,
        message: scheduledAt ? 'Notification scheduled successfully' : 'Notification sent successfully'
      });

    } catch (error) {
      logger.error('Failed to send notification', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send notification'
      });
    }
  }
);

/**
 * @route   POST /api/notifications/bulk-send
 * @desc    Send bulk notifications (Admin only)
 * @access  Private (Admin)
 */
router.post('/bulk-send',
  auth,
  [
    body('userIds').isArray().withMessage('User IDs must be array'),
    body('templateId').notEmpty().withMessage('Template ID is required'),
    body('variables').optional().isObject().withMessage('Variables must be object')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { userIds, templateId, variables } = req.body;

      if (userIds.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 1000 users per bulk send'
        });
      }

      const result = await mobilePushNotificationService.sendBulkNotification(
        userIds,
        templateId,
        variables || {}
      );

      logger.info('Bulk notification sent', {
        adminId: req.user.id,
        templateId,
        totalUsers: userIds.length,
        sentCount: result.totalSent
      });

      res.json({
        success: true,
        data: result,
        message: 'Bulk notification sent successfully'
      });

    } catch (error) {
      logger.error('Failed to send bulk notification', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send bulk notification'
      });
    }
  }
);

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get user notification preferences
 * @access  Private
 */
router.get('/preferences',
  auth,
  async (req: any, res: any) => {
    try {
      const preferences = await mobilePushNotificationService.getUserNotificationPreferences(req.user.id);

      res.json({
        success: true,
        data: preferences
      });

    } catch (error) {
      logger.error('Failed to get notification preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification preferences'
      });
    }
  }
);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update user notification preferences
 * @access  Private
 */
router.put('/preferences',
  auth,
  [
    body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
    body('categories').optional().isObject().withMessage('Categories must be object'),
    body('quietHours').optional().isObject().withMessage('Quiet hours must be object'),
    body('quietHours.start').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid start time format'),
    body('quietHours.end').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid end time format'),
    body('timezone').optional().isString().withMessage('Timezone must be string')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      const preferences = req.body;

      await mobilePushNotificationService.updateUserNotificationPreferences(
        req.user.id,
        preferences
      );

      logger.info('Notification preferences updated', {
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Notification preferences updated successfully'
      });

    } catch (error) {
      logger.error('Failed to update notification preferences', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update notification preferences'
      });
    }
  }
);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get notification statistics (Admin only)
 * @access  Private (Admin)
 */
router.get('/stats',
  auth,
  [
    query('days').optional().isInt({ min: 1, max: 90 }).withMessage('Days must be 1-90')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const days = parseInt(req.query.days) || 7;
      const stats = await mobilePushNotificationService.getNotificationStats(days);

      res.json({
        success: true,
        data: {
          ...stats,
          period: `${days} days`,
          generatedAt: new Date()
        }
      });

    } catch (error) {
      logger.error('Failed to get notification stats', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification stats'
      });
    }
  }
);

/**
 * @route   DELETE /api/notifications/scheduled/:scheduleId
 * @desc    Cancel scheduled notification
 * @access  Private (Admin)
 */
router.delete('/scheduled/:scheduleId',
  auth,
  [
    param('scheduleId').notEmpty().withMessage('Schedule ID is required')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const cancelled = await mobilePushNotificationService.cancelScheduledNotification(
        req.params.scheduleId
      );

      if (cancelled) {
        logger.info('Scheduled notification cancelled', {
          adminId: req.user.id,
          scheduleId: req.params.scheduleId
        });

        res.json({
          success: true,
          message: 'Scheduled notification cancelled successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Scheduled notification not found'
        });
      }

    } catch (error) {
      logger.error('Failed to cancel scheduled notification', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel scheduled notification'
      });
    }
  }
);

/**
 * @route   POST /api/notifications/test
 * @desc    Send test notification to current user
 * @access  Private
 */
router.post('/test',
  auth,
  async (req: any, res: any) => {
    try {
      const testNotification = {
        id: `test_${Date.now()}`,
        userId: req.user.id,
        title: 'Test Notification',
        body: 'This is a test notification from Foodxchange.',
        priority: 'normal' as const,
        category: 'test',
        data: { type: 'test' }
      };

      const result = await mobilePushNotificationService.sendNotification(testNotification);

      logger.info('Test notification sent', {
        userId: req.user.id,
        success: result.success
      });

      res.json({
        success: true,
        data: result,
        message: 'Test notification sent'
      });

    } catch (error) {
      logger.error('Failed to send test notification', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send test notification'
      });
    }
  }
);

/**
 * @route   GET /api/notifications/templates
 * @desc    Get notification templates (Admin only)
 * @access  Private (Admin)
 */
router.get('/templates',
  auth,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      // Access templates from service (would need to expose this method)
      const templates = Array.from(mobilePushNotificationService['templates'].values());

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      logger.error('Failed to get notification templates', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification templates'
      });
    }
  }
);

/**
 * @route   GET /api/notifications/rules
 * @desc    Get notification rules (Admin only)
 * @access  Private (Admin)
 */
router.get('/rules',
  auth,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const rules = notificationEventHandler.getNotificationRules();

      res.json({
        success: true,
        data: rules
      });

    } catch (error) {
      logger.error('Failed to get notification rules', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get notification rules'
      });
    }
  }
);

/**
 * @route   PUT /api/notifications/rules/:eventType/:templateId/toggle
 * @desc    Enable/disable notification rule (Admin only)
 * @access  Private (Admin)
 */
router.put('/rules/:eventType/:templateId/toggle',
  auth,
  [
    param('eventType').notEmpty().withMessage('Event type is required'),
    param('templateId').notEmpty().withMessage('Template ID is required'),
    body('enabled').isBoolean().withMessage('Enabled must be boolean')
  ],
  validate,
  async (req: any, res: any) => {
    try {
      // Check admin access
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { eventType, templateId } = req.params;
      const { enabled } = req.body;

      const success = enabled ?
        notificationEventHandler.enableNotificationRule(eventType, templateId) :
        notificationEventHandler.disableNotificationRule(eventType, templateId);

      if (success) {
        logger.info('Notification rule toggled', {
          adminId: req.user.id,
          eventType,
          templateId,
          enabled
        });

        res.json({
          success: true,
          message: `Notification rule ${enabled ? 'enabled' : 'disabled'} successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Notification rule not found'
        });
      }

    } catch (error) {
      logger.error('Failed to toggle notification rule', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle notification rule'
      });
    }
  }
);

export default router;
