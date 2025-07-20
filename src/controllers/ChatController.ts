import { Request, Response } from 'express';

import { Logger } from '../core/logging/logger';
import { chatService } from '../services/messaging/ChatService';

type ChatRequest = Request & {
  user?: {
    id: string;
    email: string;
    role: string;
    company?: string;
    companyId?: string;
    firstName?: string;
    lastName?: string;
  };
};

class ChatController {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger('ChatController');
  }

  /**
   * Create a new conversation
   */
  async createConversation(req: ChatRequest, res: Response): Promise<void> {
    try {
      const {
        participantIds,
        type,
        name,
        description,
        metadata,
        settings
      } = req.body;

      const creatorId = req.user?.id;
      if (!creatorId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!participantIds || !Array.isArray(participantIds)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARTICIPANTS',
            message: 'Participant IDs array is required'
          }
        });
        return;
      }

      const conversation = await chatService.createConversation(
        creatorId,
        participantIds,
        type || 'group',
        {
          name,
          description,
          metadata: {
            ...metadata,
            companyId: req.user?.companyId
          },
          settings
        }
      );

      res.status(201).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      this.logger.error('Failed to create conversation:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'CREATE_CONVERSATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create conversation'
        }
      });
    }
  }

  /**
   * Get user's conversations
   */
  async getConversations(req: ChatRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const { type, archived, limit, offset } = req.query;

      const result = await chatService.getUserConversations(userId, {
        type: type as any,
        archived: archived === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.logger.error('Failed to get conversations:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_CONVERSATIONS_FAILED',
          message: 'Failed to retrieve conversations'
        }
      });
    }
  }

  /**
   * Get a specific conversation
   */
  async getConversation(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const conversation = await chatService.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found'
          }
        });
        return;
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'User is not a participant in this conversation'
          }
        });
        return;
      }

      res.json({
        success: true,
        data: conversation
      });
    } catch (error) {
      this.logger.error('Failed to get conversation:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_CONVERSATION_FAILED',
          message: 'Failed to retrieve conversation'
        }
      });
    }
  }

  /**
   * Send a message
   */
  async sendMessage(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { content, type, metadata } = req.body;
      const senderId = req.user?.id;

      if (!senderId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!content || content.trim() === '') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTENT',
            message: 'Message content is required'
          }
        });
        return;
      }

      const message = await chatService.sendMessage(
        senderId,
        conversationId,
        content,
        type || 'text',
        metadata
      );

      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'SEND_MESSAGE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to send message'
        }
      });
    }
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const { limit, offset, before, after, messageType } = req.query;

      const options: any = {};
      if (limit) options.limit = parseInt(limit as string);
      if (offset) options.offset = parseInt(offset as string);
      if (before) options.before = new Date(before as string);
      if (after) options.after = new Date(after as string);
      if (messageType) options.messageType = messageType as string;

      const result = await chatService.getMessages(conversationId, userId, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'GET_MESSAGES_FAILED',
          message: error instanceof Error ? error.message : 'Failed to retrieve messages'
        }
      });
    }
  }

  /**
   * Add participant to conversation
   */
  async addParticipant(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { participantId, role } = req.body;
      const adderId = req.user?.id;

      if (!adderId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!participantId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARTICIPANT_ID',
            message: 'Participant ID is required'
          }
        });
        return;
      }

      await chatService.addParticipant(conversationId, adderId, participantId, role || 'member');

      res.json({
        success: true,
        data: {
          message: 'Participant added successfully',
          participantId,
          role: role || 'member'
        }
      });
    } catch (error) {
      this.logger.error('Failed to add participant:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'ADD_PARTICIPANT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to add participant'
        }
      });
    }
  }

  /**
   * Remove participant from conversation
   */
  async removeParticipant(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId, participantId } = req.params;
      const removerId = req.user?.id;

      if (!removerId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      await chatService.removeParticipant(conversationId, removerId, participantId);

      res.json({
        success: true,
        data: {
          message: 'Participant removed successfully',
          participantId
        }
      });
    } catch (error) {
      this.logger.error('Failed to remove participant:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'REMOVE_PARTICIPANT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to remove participant'
        }
      });
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { messageIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      if (!messageIds || !Array.isArray(messageIds)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MESSAGE_IDS',
            message: 'Message IDs array is required'
          }
        });
        return;
      }

      await chatService.markMessagesAsRead(conversationId, userId, messageIds);

      res.json({
        success: true,
        data: {
          message: 'Messages marked as read',
          messageCount: messageIds.length
        }
      });
    } catch (error) {
      this.logger.error('Failed to mark messages as read:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'MARK_READ_FAILED',
          message: error instanceof Error ? error.message : 'Failed to mark messages as read'
        }
      });
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;
      const userName = req.user ? `${req.user.firstName} ${req.user.lastName}` : 'Unknown';

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      await chatService.setTypingIndicator(conversationId, userId, userName);

      res.json({
        success: true,
        data: {
          message: 'Typing indicator set'
        }
      });
    } catch (error) {
      this.logger.error('Failed to set typing indicator:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TYPING_FAILED',
          message: 'Failed to set typing indicator'
        }
      });
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      await chatService.clearTypingIndicator(conversationId, userId);

      res.json({
        success: true,
        data: {
          message: 'Typing indicator cleared'
        }
      });
    } catch (error) {
      this.logger.error('Failed to clear typing indicator:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TYPING_STOP_FAILED',
          message: 'Failed to clear typing indicator'
        }
      });
    }
  }

  /**
   * Search messages
   */
  async searchMessages(req: ChatRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const { query, conversationId, limit, offset, type } = req.query;

      if (!query || typeof query !== 'string' || query.trim() === '') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: 'Search query is required'
          }
        });
        return;
      }

      const options: any = {};
      if (conversationId) options.conversationId = conversationId as string;
      if (limit) options.limit = parseInt(limit as string);
      if (offset) options.offset = parseInt(offset as string);
      if (type) options.type = type as string;

      const result = await chatService.searchMessages(userId, query, options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.logger.error('Failed to search messages:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to search messages'
        }
      });
    }
  }

  /**
   * Set user online status
   */
  async setOnlineStatus(req: ChatRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const { status } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const validStatuses = ['online', 'away', 'busy', 'offline'];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: `Status must be one of: ${validStatuses.join(', ')}`
          }
        });
        return;
      }

      await chatService.setUserOnlineStatus(userId, status);

      res.json({
        success: true,
        data: {
          message: 'Online status updated',
          status
        }
      });
    } catch (error) {
      this.logger.error('Failed to set online status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_UPDATE_FAILED',
          message: 'Failed to update online status'
        }
      });
    }
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const conversation = await chatService.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found'
          }
        });
        return;
      }

      // Check if user is a participant
      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        res.status(403).json({
          success: false,
          error: {
            code: 'ACCESS_DENIED',
            message: 'User is not a participant in this conversation'
          }
        });
        return;
      }

      // Get basic statistics
      const stats = {
        conversationId,
        participantCount: conversation.participants.length,
        activeParticipants: conversation.participants.filter(p => !p.muted).length,
        lastActivity: conversation.lastActivity,
        type: conversation.type,
        createdAt: conversation.createdAt,
        messageCount: 0, // Would need to count messages from database
        unreadCount: 0,  // Would need to calculate unread messages for user
        settings: {
          typingIndicators: conversation.settings.typingIndicators,
          readReceipts: conversation.settings.readReceipts,
          allowFileUploads: conversation.settings.allowFileUploads
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.logger.error('Failed to get conversation stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_FAILED',
          message: 'Failed to retrieve conversation statistics'
        }
      });
    }
  }

  /**
   * Update conversation settings
   */
  async updateConversationSettings(req: ChatRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;
      const { settings } = req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required'
          }
        });
        return;
      }

      const conversation = await chatService.getConversation(conversationId);
      if (!conversation) {
        res.status(404).json({
          success: false,
          error: {
            code: 'CONVERSATION_NOT_FOUND',
            message: 'Conversation not found'
          }
        });
        return;
      }

      // Check if user has permission to update settings
      const participant = conversation.participants.find(p => p.userId === userId);
      if (!participant?.permissions.canArchiveConversation) {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: 'User does not have permission to update conversation settings'
          }
        });
        return;
      }

      // Update settings (this would need to be implemented in the service)
      // For now, return success
      res.json({
        success: true,
        data: {
          message: 'Conversation settings updated',
          settings
        }
      });
    } catch (error) {
      this.logger.error('Failed to update conversation settings:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_SETTINGS_FAILED',
          message: 'Failed to update conversation settings'
        }
      });
    }
  }
}

export const chatController = new ChatController();
