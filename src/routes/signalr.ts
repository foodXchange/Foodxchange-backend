import express from 'express';
import { SignalRController } from '../controllers/SignalRController';
import { authMiddleware } from '../middleware/auth';
import { enforceTenantIsolation } from '../middleware/tenantIsolation';
import { createCustomRateLimiter } from '../middleware/rateLimiter';
import { authorize } from '../middleware/authorize';
import { asyncHandler } from '../core/errors';

const router = express.Router();
const signalRController = new SignalRController();

// Rate limiter for SignalR operations
const signalRRateLimiter = createCustomRateLimiter('signalr', 1, 60); // 60 requests per minute

// Apply middleware to all routes
router.use(authMiddleware);
router.use(enforceTenantIsolation);
router.use(signalRRateLimiter);

/**
 * @route GET /api/v1/signalr/connection
 * @desc Get SignalR connection info
 * @access Private
 */
router.get('/connection', 
  asyncHandler(signalRController.getConnectionInfo.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/message/user
 * @desc Send message to specific user
 * @access Private
 */
router.post('/message/user', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.sendMessageToUser.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/message/group
 * @desc Send message to group (tenant)
 * @access Private
 */
router.post('/message/group', 
  authorize(['admin', 'manager']),
  asyncHandler(signalRController.sendMessageToGroup.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/chat/message
 * @desc Send chat message
 * @access Private
 */
router.post('/chat/message', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.sendChatMessage.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/chat/typing
 * @desc Send typing indicator
 * @access Private
 */
router.post('/chat/typing', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.sendTypingIndicator.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/group/join
 * @desc Join user to group
 * @access Private
 */
router.post('/group/join', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.joinGroup.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/group/leave
 * @desc Leave group
 * @access Private
 */
router.post('/group/leave', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.leaveGroup.bind(signalRController))
);

/**
 * @route GET /api/v1/signalr/users/online/count
 * @desc Get online users count
 * @access Private
 */
router.get('/users/online/count', 
  authorize(['admin', 'manager']),
  asyncHandler(signalRController.getOnlineUsersCount.bind(signalRController))
);

/**
 * @route GET /api/v1/signalr/users/:userId/online
 * @desc Check if user is online
 * @access Private
 */
router.get('/users/:userId/online', 
  authorize(['buyer', 'supplier', 'admin', 'manager']),
  asyncHandler(signalRController.checkUserOnline.bind(signalRController))
);

/**
 * @route POST /api/v1/signalr/notification/system
 * @desc Send system notification
 * @access Private
 */
router.post('/notification/system', 
  authorize(['admin', 'manager']),
  asyncHandler(signalRController.sendSystemNotification.bind(signalRController))
);

/**
 * @route GET /api/v1/signalr/health
 * @desc Get SignalR service health
 * @access Private
 */
router.get('/health', 
  authorize(['admin', 'manager']),
  asyncHandler(signalRController.getHealth.bind(signalRController))
);

export default router;