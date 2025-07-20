import { Server as SocketIOServer } from 'socket.io';

import { Logger } from '../../core/logging/logger';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  type: 'text' | 'image' | 'file' | 'system' | 'typing' | 'read_receipt';
  content: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    thumbnailUrl?: string;
    originalUrl?: string;
    mentions?: string[];
    links?: string[];
    reactions?: Record<string, string[]>; // emoji -> userIds
  };
  timestamp: Date;
  edited?: boolean;
  editedAt?: Date;
  deleted?: boolean;
  deletedAt?: Date;
  delivered: boolean;
  read: boolean;
  readBy?: Array<{ userId: string; readAt: Date }>;
}

interface ChatConversation {
  id: string;
  type: 'direct' | 'group' | 'channel' | 'support';
  name?: string;
  description?: string;
  participants: ConversationParticipant[];
  settings: ConversationSettings;
  lastMessage?: ChatMessage;
  lastActivity: Date;
  createdBy: string;
  createdAt: Date;
  archived: boolean;
  metadata?: {
    rfqId?: string;
    orderId?: string;
    companyId?: string;
    tags?: string[];
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  };
}

interface ConversationParticipant {
  userId: string;
  role: 'admin' | 'moderator' | 'member';
  permissions: {
    canSendMessages: boolean;
    canDeleteMessages: boolean;
    canEditMessages: boolean;
    canAddParticipants: boolean;
    canRemoveParticipants: boolean;
    canArchiveConversation: boolean;
  };
  joinedAt: Date;
  lastSeen?: Date;
  muted: boolean;
  notificationSettings: {
    mentions: boolean;
    allMessages: boolean;
    keywordAlerts: string[];
  };
}

interface ConversationSettings {
  isPrivate: boolean;
  allowFileUploads: boolean;
  maxFileSize: number;
  allowedFileTypes: string[];
  messageRetentionDays: number;
  typingIndicators: boolean;
  readReceipts: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays?: number;
}

interface TypingIndicator {
  userId: string;
  userName: string;
  conversationId: string;
  timestamp: Date;
}

interface OnlineStatus {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastSeen: Date;
  socketId?: string;
}

export class ChatService {
  private readonly logger: Logger;
  private io: SocketIOServer | null = null;
  private readonly onlineUsers: Map<string, OnlineStatus> = new Map();
  private readonly typingIndicators: Map<string, TypingIndicator[]> = new Map(); // conversationId -> typing users
  private readonly userSockets: Map<string, string[]> = new Map(); // userId -> socketIds

  constructor() {
    this.logger = new Logger('ChatService');
    this.startCleanupInterval();
  }

  /**
   * Initialize Socket.IO server
   */
  setSocketServer(io: SocketIOServer): void {
    this.io = io;
    this.setupSocketHandlers();
    this.logger.info('Chat service initialized with Socket.IO');
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    creatorId: string,
    participantIds: string[],
    type: ChatConversation['type'],
    options: {
      name?: string;
      description?: string;
      metadata?: ChatConversation['metadata'];
      settings?: Partial<ConversationSettings>;
    } = {}
  ): Promise<ChatConversation> {
    try {
      const conversationId = this.generateId();

      // Build participants list
      const participants: ConversationParticipant[] = [
        // Creator gets admin role
        {
          userId: creatorId,
          role: 'admin',
          permissions: this.getDefaultPermissions('admin'),
          joinedAt: new Date(),
          muted: false,
          notificationSettings: {
            mentions: true,
            allMessages: true,
            keywordAlerts: []
          }
        },
        // Other participants get member role
        ...participantIds.map(userId => ({
          userId,
          role: 'member' as const,
          permissions: this.getDefaultPermissions('member'),
          joinedAt: new Date(),
          muted: false,
          notificationSettings: {
            mentions: true,
            allMessages: type === 'direct',
            keywordAlerts: []
          }
        }))
      ];

      const conversation: ChatConversation = {
        id: conversationId,
        type,
        name: options.name || (type === 'direct' ? undefined : `${type} conversation`),
        description: options.description,
        participants,
        settings: {
          isPrivate: type === 'direct' || type === 'support',
          allowFileUploads: true,
          maxFileSize: 10485760, // 10MB
          allowedFileTypes: ['image/*', 'application/pdf', 'text/*'],
          messageRetentionDays: 365,
          typingIndicators: true,
          readReceipts: true,
          autoDeleteEnabled: false,
          ...options.settings
        },
        lastActivity: new Date(),
        createdBy: creatorId,
        createdAt: new Date(),
        archived: false,
        metadata: options.metadata
      };

      // Save to database
      const conversationDoc = new Conversation(conversation);
      await conversationDoc.save();

      // Cache conversation
      await this.cacheConversation(conversation);

      // Notify participants
      await this.notifyParticipants(conversation, {
        type: 'conversation_created',
        conversation
      });

      this.logger.info(`Conversation created: ${conversationId} (${type})`);
      return conversation;
    } catch (error) {
      this.logger.error('Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    content: string,
    type: ChatMessage['type'] = 'text',
    metadata?: ChatMessage['metadata']
  ): Promise<ChatMessage> {
    try {
      // Verify conversation exists and user has permission
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const participant = conversation.participants.find(p => p.userId === senderId);
      if (!participant) {
        throw new Error('User not in conversation');
      }

      if (!participant.permissions.canSendMessages) {
        throw new Error('User does not have permission to send messages');
      }

      // Get sender info
      const sender = await User.findById(senderId);
      if (!sender) {
        throw new Error('Sender not found');
      }

      const messageId = this.generateId();
      const message: ChatMessage = {
        id: messageId,
        conversationId,
        senderId,
        senderName: `${sender.firstName  } ${  sender.lastName}`,
        senderRole: sender.role,
        type,
        content,
        metadata,
        timestamp: new Date(),
        delivered: false,
        read: false,
        readBy: []
      };

      // Save to database
      const messageDoc = new Message(message);
      await messageDoc.save();

      // Update conversation last activity
      await this.updateConversationActivity(conversationId, message);

      // Cache message
      await this.cacheMessage(message);

      // Clear typing indicator for sender
      await this.clearTypingIndicator(conversationId, senderId);

      // Send real-time notification
      await this.broadcastMessage(conversation, message);

      // Mark as delivered
      message.delivered = true;
      await messageDoc.updateOne({ delivered: true });

      this.logger.debug(`Message sent: ${messageId} in conversation ${conversationId}`);
      return message;
    } catch (error) {
      this.logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Get conversation messages
   */
  async getMessages(
    conversationId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      before?: Date;
      after?: Date;
      messageType?: ChatMessage['type'];
    } = {}
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean; total: number }> {
    try {
      // Verify user has access to conversation
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const participant = conversation.participants.find(p => p.userId === userId);
      if (!participant) {
        throw new Error('User not in conversation');
      }

      const query: any = { conversationId, deleted: { $ne: true } };

      if (options.before) {
        query.timestamp = { $lt: options.before };
      }

      if (options.after) {
        query.timestamp = { $gt: options.after };
      }

      if (options.messageType) {
        query.type = options.messageType;
      }

      const limit = Math.min(options.limit || 50, 100);
      const offset = options.offset || 0;

      const [messages, total] = await Promise.all([
        Message.find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        Message.countDocuments(query)
      ]);

      // Mark messages as read
      await this.markMessagesAsRead(conversationId, userId, messages.map(m => m._id.toString()));

      return {
        messages: messages.reverse(), // Return in chronological order
        hasMore: offset + messages.length < total,
        total
      };
    } catch (error) {
      this.logger.error('Failed to get messages:', error);
      throw error;
    }
  }

  /**
   * Get user conversations
   */
  async getUserConversations(
    userId: string,
    options: {
      type?: ChatConversation['type'];
      archived?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ conversations: ChatConversation[]; total: number }> {
    try {
      const query: any = {
        'participants.userId': userId,
        archived: options.archived || false
      };

      if (options.type) {
        query.type = options.type;
      }

      const limit = Math.min(options.limit || 20, 100);
      const offset = options.offset || 0;

      const [conversations, total] = await Promise.all([
        Conversation.find(query)
          .sort({ lastActivity: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        Conversation.countDocuments(query)
      ]);

      return { conversations, total };
    } catch (error) {
      this.logger.error('Failed to get user conversations:', error);
      throw error;
    }
  }

  /**
   * Add user to conversation
   */
  async addParticipant(
    conversationId: string,
    adderId: string,
    newParticipantId: string,
    role: ConversationParticipant['role'] = 'member'
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const adder = conversation.participants.find(p => p.userId === adderId);
      if (!adder?.permissions.canAddParticipants) {
        throw new Error('User does not have permission to add participants');
      }

      // Check if user is already in conversation
      const existingParticipant = conversation.participants.find(p => p.userId === newParticipantId);
      if (existingParticipant) {
        throw new Error('User is already in conversation');
      }

      const newParticipant: ConversationParticipant = {
        userId: newParticipantId,
        role,
        permissions: this.getDefaultPermissions(role),
        joinedAt: new Date(),
        muted: false,
        notificationSettings: {
          mentions: true,
          allMessages: conversation.type === 'direct',
          keywordAlerts: []
        }
      };

      conversation.participants.push(newParticipant);

      // Update database
      await Conversation.findByIdAndUpdate(conversationId, {
        participants: conversation.participants,
        lastActivity: new Date()
      });

      // Update cache
      await this.cacheConversation(conversation);

      // Send system message
      await this.sendSystemMessage(conversationId, 'User added to conversation', {
        adderId,
        newParticipantId,
        action: 'participant_added'
      });

      // Notify participants
      await this.notifyParticipants(conversation, {
        type: 'participant_added',
        participantId: newParticipantId,
        addedBy: adderId
      });

      this.logger.info(`Participant added to conversation: ${newParticipantId} -> ${conversationId}`);
    } catch (error) {
      this.logger.error('Failed to add participant:', error);
      throw error;
    }
  }

  /**
   * Remove user from conversation
   */
  async removeParticipant(
    conversationId: string,
    removerId: string,
    participantId: string
  ): Promise<void> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const remover = conversation.participants.find(p => p.userId === removerId);
      if (!remover?.permissions.canRemoveParticipants) {
        throw new Error('User does not have permission to remove participants');
      }

      const participantIndex = conversation.participants.findIndex(p => p.userId === participantId);
      if (participantIndex === -1) {
        throw new Error('User not in conversation');
      }

      // Remove participant
      conversation.participants.splice(participantIndex, 1);

      // Update database
      await Conversation.findByIdAndUpdate(conversationId, {
        participants: conversation.participants,
        lastActivity: new Date()
      });

      // Update cache
      await this.cacheConversation(conversation);

      // Send system message
      await this.sendSystemMessage(conversationId, 'User removed from conversation', {
        removerId,
        participantId,
        action: 'participant_removed'
      });

      // Notify participants
      await this.notifyParticipants(conversation, {
        type: 'participant_removed',
        participantId,
        removedBy: removerId
      });

      this.logger.info(`Participant removed from conversation: ${participantId} -> ${conversationId}`);
    } catch (error) {
      this.logger.error('Failed to remove participant:', error);
      throw error;
    }
  }

  /**
   * Set typing indicator
   */
  async setTypingIndicator(conversationId: string, userId: string, userName: string): Promise<void> {
    try {
      const indicators = this.typingIndicators.get(conversationId) || [];

      // Remove existing indicator for this user
      const filteredIndicators = indicators.filter(i => i.userId !== userId);

      // Add new indicator
      filteredIndicators.push({
        userId,
        userName,
        conversationId,
        timestamp: new Date()
      });

      this.typingIndicators.set(conversationId, filteredIndicators);

      // Broadcast to conversation participants (except sender)
      if (this.io) {
        this.io.to(`conversation_${conversationId}`).emit('typing_start', {
          conversationId,
          userId,
          userName,
          timestamp: new Date()
        });
      }

      // Auto-clear after 5 seconds
      setTimeout(() => {
        this.clearTypingIndicator(conversationId, userId);
      }, 5000);

    } catch (error) {
      this.logger.error('Failed to set typing indicator:', error);
    }
  }

  /**
   * Clear typing indicator
   */
  async clearTypingIndicator(conversationId: string, userId: string): Promise<void> {
    try {
      const indicators = this.typingIndicators.get(conversationId) || [];
      const filteredIndicators = indicators.filter(i => i.userId !== userId);

      if (filteredIndicators.length !== indicators.length) {
        this.typingIndicators.set(conversationId, filteredIndicators);

        // Broadcast stop typing
        if (this.io) {
          this.io.to(`conversation_${conversationId}`).emit('typing_stop', {
            conversationId,
            userId,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to clear typing indicator:', error);
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(conversationId: string, userId: string, messageIds: string[]): Promise<void> {
    try {
      const readAt = new Date();

      // Update messages in database
      await Message.updateMany(
        {
          _id: { $in: messageIds },
          conversationId,
          senderId: { $ne: userId } // Don't mark own messages as read
        },
        {
          $addToSet: {
            readBy: { userId, readAt }
          }
        }
      );

      // Broadcast read receipts
      if (this.io) {
        this.io.to(`conversation_${conversationId}`).emit('messages_read', {
          conversationId,
          userId,
          messageIds,
          readAt
        });
      }

      this.logger.debug(`Messages marked as read: ${messageIds.length} messages by ${userId}`);
    } catch (error) {
      this.logger.error('Failed to mark messages as read:', error);
      throw error;
    }
  }

  /**
   * Set user online status
   */
  async setUserOnlineStatus(userId: string, status: OnlineStatus['status'], socketId?: string): Promise<void> {
    try {
      const onlineStatus: OnlineStatus = {
        userId,
        status,
        lastSeen: new Date(),
        socketId
      };

      this.onlineUsers.set(userId, onlineStatus);

      // Update socket mapping
      if (socketId) {
        const userSockets = this.userSockets.get(userId) || [];
        if (!userSockets.includes(socketId)) {
          userSockets.push(socketId);
          this.userSockets.set(userId, userSockets);
        }
      }

      // Cache status
      await optimizedCache.set(`user_status:${userId}`, onlineStatus, 300); // 5 minutes

      // Broadcast status to user's conversations
      await this.broadcastUserStatus(userId, onlineStatus);

      this.logger.debug(`User status updated: ${userId} -> ${status}`);
    } catch (error) {
      this.logger.error('Failed to set user online status:', error);
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<ChatConversation | null> {
    try {
      // Check cache first
      const cached = await optimizedCache.get(`conversation:${conversationId}`);
      if (cached) {
        return cached;
      }

      // Get from database
      const conversation = await Conversation.findById(conversationId).lean();
      if (conversation) {
        await this.cacheConversation(conversation);
        return conversation;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get conversation:', error);
      return null;
    }
  }

  /**
   * Search messages
   */
  async searchMessages(
    userId: string,
    query: string,
    options: {
      conversationId?: string;
      limit?: number;
      offset?: number;
      type?: ChatMessage['type'];
    } = {}
  ): Promise<{ messages: ChatMessage[]; total: number }> {
    try {
      const searchQuery: any = {
        $text: { $search: query },
        deleted: { $ne: true }
      };

      if (options.conversationId) {
        searchQuery.conversationId = options.conversationId;
      } else {
        // Get user's conversation IDs
        const userConversations = await this.getUserConversations(userId);
        const conversationIds = userConversations.conversations.map(c => c.id);
        searchQuery.conversationId = { $in: conversationIds };
      }

      if (options.type) {
        searchQuery.type = options.type;
      }

      const limit = Math.min(options.limit || 20, 100);
      const offset = options.offset || 0;

      const [messages, total] = await Promise.all([
        Message.find(searchQuery)
          .sort({ score: { $meta: 'textScore' }, timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean(),
        Message.countDocuments(searchQuery)
      ]);

      return { messages, total };
    } catch (error) {
      this.logger.error('Failed to search messages:', error);
      throw error;
    }
  }

  // Private methods

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      this.logger.debug(`Socket connected: ${socket.id}`);

      // Handle user authentication
      socket.on('authenticate', async (data: { userId: string; token: string }) => {
        try {
          // Validate token and get user
          // In a real implementation, verify the JWT token
          const {userId} = data;

          // Join user to their conversation rooms
          const userConversations = await this.getUserConversations(userId);
          for (const conversation of userConversations.conversations) {
            socket.join(`conversation_${conversation.id}`);
          }

          // Set user online
          await this.setUserOnlineStatus(userId, 'online', socket.id);

          socket.emit('authenticated', { success: true });
          this.logger.debug(`User authenticated: ${userId}`);
        } catch (error) {
          socket.emit('authentication_error', { error: error instanceof Error ? error.message : 'Authentication failed' });
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data: { conversationId: string; userId: string; userName: string }) => {
        this.setTypingIndicator(data.conversationId, data.userId, data.userName);
      });

      socket.on('typing_stop', (data: { conversationId: string; userId: string }) => {
        this.clearTypingIndicator(data.conversationId, data.userId);
      });

      // Handle message reading
      socket.on('mark_read', (data: { conversationId: string; userId: string; messageIds: string[] }) => {
        this.markMessagesAsRead(data.conversationId, data.userId, data.messageIds);
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        this.logger.debug(`Socket disconnected: ${socket.id}`);

        // Find user by socket and set offline
        for (const [userId, status] of this.onlineUsers.entries()) {
          if (status.socketId === socket.id) {
            await this.setUserOnlineStatus(userId, 'offline');
            break;
          }
        }
      });
    });
  }

  private async broadcastMessage(conversation: ChatConversation, message: ChatMessage): Promise<void> {
    if (!this.io) return;

    this.io.to(`conversation_${conversation.id}`).emit('new_message', {
      conversation: conversation.id,
      message
    });
  }

  private async broadcastUserStatus(userId: string, status: OnlineStatus): Promise<void> {
    if (!this.io) return;

    // Get user's conversations and broadcast to those rooms
    const userConversations = await this.getUserConversations(userId);
    for (const conversation of userConversations.conversations) {
      this.io.to(`conversation_${conversation.id}`).emit('user_status_changed', {
        userId,
        status: status.status,
        lastSeen: status.lastSeen
      });
    }
  }

  private async notifyParticipants(conversation: ChatConversation, notification: any): Promise<void> {
    if (!this.io) return;

    this.io.to(`conversation_${conversation.id}`).emit('conversation_update', notification);
  }

  private async sendSystemMessage(conversationId: string, content: string, metadata?: any): Promise<void> {
    const systemMessage: ChatMessage = {
      id: this.generateId(),
      conversationId,
      senderId: 'system',
      senderName: 'System',
      senderRole: 'system',
      type: 'system',
      content,
      metadata,
      timestamp: new Date(),
      delivered: true,
      read: false
    };

    const messageDoc = new Message(systemMessage);
    await messageDoc.save();

    if (this.io) {
      this.io.to(`conversation_${conversationId}`).emit('new_message', {
        conversation: conversationId,
        message: systemMessage
      });
    }
  }

  private async updateConversationActivity(conversationId: string, lastMessage: ChatMessage): Promise<void> {
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage,
      lastActivity: new Date()
    });

    // Update cache
    const conversation = await this.getConversation(conversationId);
    if (conversation) {
      conversation.lastMessage = lastMessage;
      conversation.lastActivity = new Date();
      await this.cacheConversation(conversation);
    }
  }

  private async cacheConversation(conversation: ChatConversation): Promise<void> {
    await optimizedCache.set(`conversation:${conversation.id}`, conversation, 3600); // 1 hour
  }

  private async cacheMessage(message: ChatMessage): Promise<void> {
    await optimizedCache.set(`message:${message.id}`, message, 1800); // 30 minutes
  }

  private getDefaultPermissions(role: ConversationParticipant['role']): ConversationParticipant['permissions'] {
    switch (role) {
      case 'admin':
        return {
          canSendMessages: true,
          canDeleteMessages: true,
          canEditMessages: true,
          canAddParticipants: true,
          canRemoveParticipants: true,
          canArchiveConversation: true
        };
      case 'moderator':
        return {
          canSendMessages: true,
          canDeleteMessages: true,
          canEditMessages: false,
          canAddParticipants: true,
          canRemoveParticipants: false,
          canArchiveConversation: false
        };
      case 'member':
      default:
        return {
          canSendMessages: true,
          canDeleteMessages: false,
          canEditMessages: false,
          canAddParticipants: false,
          canRemoveParticipants: false,
          canArchiveConversation: false
        };
    }
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startCleanupInterval(): void {
    // Clean up old typing indicators every 30 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [conversationId, indicators] of this.typingIndicators.entries()) {
        const validIndicators = indicators.filter(i =>
          now - i.timestamp.getTime() < 10000 // 10 seconds
        );

        if (validIndicators.length !== indicators.length) {
          this.typingIndicators.set(conversationId, validIndicators);
        }
      }
    }, 30000);

    // Clean up offline users every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [userId, status] of this.onlineUsers.entries()) {
        if (status.status === 'offline' && now - status.lastSeen.getTime() > 300000) { // 5 minutes
          this.onlineUsers.delete(userId);
          this.userSockets.delete(userId);
        }
      }
    }, 300000);
  }
}

// Singleton instance
export const chatService = new ChatService();
