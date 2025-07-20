import { body, param, query } from 'express-validator';

export const chatValidationRules = {
  conversationId: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters')
  ],

  createConversation: [
    body('participantIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Participant IDs must be an array with 1-50 participants'),

    body('participantIds.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each participant ID must be between 1 and 100 characters'),

    body('type')
      .optional()
      .isIn(['direct', 'group', 'channel', 'support'])
      .withMessage('Type must be one of: direct, group, channel, support'),

    body('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Name must be between 1 and 200 characters'),

    body('description')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description cannot exceed 1000 characters'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),

    body('metadata.rfqId')
      .optional()
      .isString()
      .trim()
      .withMessage('RFQ ID must be a string'),

    body('metadata.orderId')
      .optional()
      .isString()
      .trim()
      .withMessage('Order ID must be a string'),

    body('metadata.priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),

    body('metadata.tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),

    body('metadata.tags.*')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Each tag must be between 1 and 50 characters'),

    body('settings')
      .optional()
      .isObject()
      .withMessage('Settings must be an object'),

    body('settings.isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),

    body('settings.allowFileUploads')
      .optional()
      .isBoolean()
      .withMessage('allowFileUploads must be a boolean'),

    body('settings.maxFileSize')
      .optional()
      .isInt({ min: 1, max: 104857600 }) // 100MB max
      .withMessage('maxFileSize must be between 1 byte and 100MB'),

    body('settings.messageRetentionDays')
      .optional()
      .isInt({ min: 1, max: 3650 })
      .withMessage('messageRetentionDays must be between 1 and 3650 days')
  ],

  getConversations: [
    query('type')
      .optional()
      .isIn(['direct', 'group', 'channel', 'support'])
      .withMessage('Type must be one of: direct, group, channel, support'),

    query('archived')
      .optional()
      .isBoolean()
      .withMessage('Archived must be a boolean'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer')
  ],

  sendMessage: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    body('content')
      .isString()
      .trim()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Message content must be between 1 and 10,000 characters'),

    body('type')
      .optional()
      .isIn(['text', 'image', 'file', 'system'])
      .withMessage('Message type must be one of: text, image, file, system'),

    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),

    body('metadata.fileName')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('File name must be between 1 and 255 characters'),

    body('metadata.fileSize')
      .optional()
      .isInt({ min: 1, max: 104857600 })
      .withMessage('File size must be between 1 byte and 100MB'),

    body('metadata.mimeType')
      .optional()
      .isString()
      .trim()
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*$/)
      .withMessage('MIME type must be valid'),

    body('metadata.mentions')
      .optional()
      .isArray()
      .withMessage('Mentions must be an array'),

    body('metadata.mentions.*')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each mention must be between 1 and 100 characters')
  ],

  getMessages: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),

    query('before')
      .optional()
      .isISO8601()
      .withMessage('Before must be a valid ISO date'),

    query('after')
      .optional()
      .isISO8601()
      .withMessage('After must be a valid ISO date'),

    query('messageType')
      .optional()
      .isIn(['text', 'image', 'file', 'system'])
      .withMessage('Message type must be one of: text, image, file, system')
  ],

  addParticipant: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    body('participantId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Participant ID must be between 1 and 100 characters'),

    body('role')
      .optional()
      .isIn(['admin', 'moderator', 'member'])
      .withMessage('Role must be one of: admin, moderator, member')
  ],

  removeParticipant: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    param('participantId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Participant ID must be between 1 and 100 characters')
  ],

  markAsRead: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    body('messageIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('Message IDs must be an array with 1-100 items'),

    body('messageIds.*')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each message ID must be between 1 and 100 characters')
  ],

  searchMessages: [
    query('query')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Search query must be between 1 and 200 characters'),

    query('conversationId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),

    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be a non-negative integer'),

    query('type')
      .optional()
      .isIn(['text', 'image', 'file', 'system'])
      .withMessage('Message type must be one of: text, image, file, system')
  ],

  setOnlineStatus: [
    body('status')
      .isIn(['online', 'away', 'busy', 'offline'])
      .withMessage('Status must be one of: online, away, busy, offline')
  ],

  updateConversationSettings: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    body('settings')
      .isObject()
      .withMessage('Settings must be an object'),

    body('settings.isPrivate')
      .optional()
      .isBoolean()
      .withMessage('isPrivate must be a boolean'),

    body('settings.allowFileUploads')
      .optional()
      .isBoolean()
      .withMessage('allowFileUploads must be a boolean'),

    body('settings.maxFileSize')
      .optional()
      .isInt({ min: 1, max: 104857600 })
      .withMessage('maxFileSize must be between 1 byte and 100MB'),

    body('settings.allowedFileTypes')
      .optional()
      .isArray()
      .withMessage('allowedFileTypes must be an array'),

    body('settings.allowedFileTypes.*')
      .optional()
      .isString()
      .trim()
      .withMessage('Each file type must be a string'),

    body('settings.messageRetentionDays')
      .optional()
      .isInt({ min: 1, max: 3650 })
      .withMessage('messageRetentionDays must be between 1 and 3650 days'),

    body('settings.typingIndicators')
      .optional()
      .isBoolean()
      .withMessage('typingIndicators must be a boolean'),

    body('settings.readReceipts')
      .optional()
      .isBoolean()
      .withMessage('readReceipts must be a boolean'),

    body('settings.autoDeleteEnabled')
      .optional()
      .isBoolean()
      .withMessage('autoDeleteEnabled must be a boolean'),

    body('settings.autoDeleteAfterDays')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('autoDeleteAfterDays must be between 1 and 365 days')
  ],

  // Advanced validation rules
  bulkOperations: [
    body('operations')
      .isArray({ min: 1, max: 10 })
      .withMessage('Operations must be an array with 1-10 items'),

    body('operations.*.type')
      .isIn(['add_participant', 'remove_participant', 'send_message', 'mark_read'])
      .withMessage('Operation type must be one of: add_participant, remove_participant, send_message, mark_read'),

    body('operations.*.conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Each operation conversation ID must be between 1 and 100 characters'),

    body('operations.*.data')
      .isObject()
      .withMessage('Operation data must be an object')
  ],

  messageReactions: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    param('messageId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Message ID must be between 1 and 100 characters'),

    body('emoji')
      .isString()
      .trim()
      .isLength({ min: 1, max: 10 })
      .withMessage('Emoji must be between 1 and 10 characters')
  ],

  conversationFilter: [
    query('name')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Name filter must be between 1 and 200 characters'),

    query('participantId')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Participant ID must be between 1 and 100 characters'),

    query('hasUnread')
      .optional()
      .isBoolean()
      .withMessage('hasUnread must be a boolean'),

    query('lastActivityAfter')
      .optional()
      .isISO8601()
      .withMessage('lastActivityAfter must be a valid ISO date'),

    query('lastActivityBefore')
      .optional()
      .isISO8601()
      .withMessage('lastActivityBefore must be a valid ISO date'),

    query('tags')
      .optional()
      .isString()
      .withMessage('Tags must be a comma-separated string'),

    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent')
  ],

  conversationAnalytics: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    query('timeframe')
      .optional()
      .isIn(['1h', '6h', '24h', '7d', '30d'])
      .withMessage('Timeframe must be one of: 1h, 6h, 24h, 7d, 30d'),

    query('metrics')
      .optional()
      .isString()
      .withMessage('Metrics must be a comma-separated string')
  ]
};

// Composite validation rules for complex operations
export const compositeChatValidationRules = {
  createGroupConversation: [
    ...chatValidationRules.createConversation,
    body('type')
      .equals('group')
      .withMessage('Type must be group for group conversations'),

    body('participantIds')
      .isArray({ min: 2, max: 50 })
      .withMessage('Group conversations must have 2-50 participants'),

    body('name')
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Group name is required and must be between 1 and 200 characters')
  ],

  createDirectConversation: [
    body('participantIds')
      .isArray({ min: 1, max: 1 })
      .withMessage('Direct conversations must have exactly 1 other participant'),

    body('type')
      .equals('direct')
      .withMessage('Type must be direct for direct conversations')
  ],

  fileUpload: [
    param('conversationId')
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Conversation ID must be between 1 and 100 characters'),

    body('fileName')
      .isString()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('File name must be between 1 and 255 characters'),

    body('fileSize')
      .isInt({ min: 1, max: 104857600 })
      .withMessage('File size must be between 1 byte and 100MB'),

    body('mimeType')
      .isString()
      .trim()
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*$/)
      .withMessage('MIME type must be valid'),

    body('content')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('File caption cannot exceed 1000 characters')
  ]
};
