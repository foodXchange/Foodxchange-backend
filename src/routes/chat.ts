import { Router } from 'express';

import { chatController } from '../controllers/ChatController';
import { authenticateToken } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimiting';
import { validateRequest } from '../middleware/validation';
import { chatValidationRules } from '../validators/chatValidators';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Rate limiting for chat operations
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many chat requests. Please try again later.'
});

const messagingRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Too many messages. Please slow down.'
});

// Conversation management routes
router.post('/conversations',
  chatRateLimit,
  validateRequest(chatValidationRules.createConversation),
  chatController.createConversation
);

router.get('/conversations',
  validateRequest(chatValidationRules.getConversations),
  chatController.getConversations
);

router.get('/conversations/:conversationId',
  validateRequest(chatValidationRules.conversationId),
  chatController.getConversation
);

router.get('/conversations/:conversationId/stats',
  validateRequest(chatValidationRules.conversationId),
  chatController.getConversationStats
);

router.put('/conversations/:conversationId/settings',
  chatRateLimit,
  validateRequest(chatValidationRules.updateConversationSettings),
  chatController.updateConversationSettings
);

// Message routes
router.post('/conversations/:conversationId/messages',
  messagingRateLimit,
  validateRequest(chatValidationRules.sendMessage),
  chatController.sendMessage
);

router.get('/conversations/:conversationId/messages',
  validateRequest(chatValidationRules.getMessages),
  chatController.getMessages
);

router.post('/conversations/:conversationId/messages/read',
  validateRequest(chatValidationRules.markAsRead),
  chatController.markAsRead
);

// Participant management routes
router.post('/conversations/:conversationId/participants',
  chatRateLimit,
  validateRequest(chatValidationRules.addParticipant),
  chatController.addParticipant
);

router.delete('/conversations/:conversationId/participants/:participantId',
  chatRateLimit,
  validateRequest(chatValidationRules.removeParticipant),
  chatController.removeParticipant
);

// Typing indicators
router.post('/conversations/:conversationId/typing/start',
  validateRequest(chatValidationRules.conversationId),
  chatController.startTyping
);

router.post('/conversations/:conversationId/typing/stop',
  validateRequest(chatValidationRules.conversationId),
  chatController.stopTyping
);

// Search
router.get('/search/messages',
  validateRequest(chatValidationRules.searchMessages),
  chatController.searchMessages
);

// User status
router.post('/status',
  validateRequest(chatValidationRules.setOnlineStatus),
  chatController.setOnlineStatus
);

export default router;
