import { EventEmitter } from 'events';
import { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { redisClient } from '../utils/redis';
import { productionLogger } from '../utils/productionLogger';
import { translatorService } from './TranslatorService';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'expert' | 'client' | 'agent';
  content: string;
  type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'document' | 'system';
  timestamp: Date;
  readBy: Array<{
    userId: string;
    readAt: Date;
  }>;
  editedAt?: Date;
  deletedAt?: Date;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    url: string;
    size: number;
    mimeType: string;
  }>;
  metadata?: {
    language?: string;
    translated?: boolean;
    originalContent?: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
}

export interface Conversation {
  id: string;
  participants: Array<{
    userId: string;
    role: 'expert' | 'client' | 'agent';
    joinedAt: Date;
    lastSeen?: Date;
    isTyping?: boolean;
    isOnline?: boolean;
  }>;
  type: 'direct' | 'group' | 'support';
  title?: string;
  description?: string;
  projectId?: string;
  rfqId?: string;
  status: 'active' | 'archived' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  unreadCounts: Map<string, number>;
  settings: {
    allowFiles: boolean;
    allowVoice: boolean;
    allowVideo: boolean;
    autoTranslate: boolean;
    notificationsEnabled: boolean;
  };
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  timestamp: Date;
}

// MongoDB Schema for Message persistence
const MessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  senderRole: { type: String, enum: ['expert', 'client', 'agent'], required: true },
  content: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['text', 'file', 'image', 'video', 'audio', 'document', 'system'], 
    default: 'text' 
  },
  timestamp: { type: Date, default: Date.now },
  readBy: [{
    userId: String,
    readAt: Date
  }],
  editedAt: Date,
  deletedAt: Date,
  replyTo: String,
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String
  }],
  metadata: {
    language: String,
    translated: Boolean,
    originalContent: String,
    location: {
      latitude: Number,
      longitude: Number
    }
  }
}, {
  timestamps: true
});

MessageSchema.index({ conversationId: 1, timestamp: -1 });
MessageSchema.index({ senderId: 1, timestamp: -1 });

const MessageModel = mongoose.model('Message', MessageSchema);

// MongoDB Schema for Conversation
const ConversationSchema = new mongoose.Schema({
  participants: [{
    userId: { type: String, required: true },
    role: { type: String, enum: ['expert', 'client', 'agent'], required: true },
    joinedAt: { type: Date, default: Date.now },
    lastSeen: Date,
    isTyping: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false }
  }],
  type: { type: String, enum: ['direct', 'group', 'support'], default: 'direct' },
  title: String,
  description: String,
  projectId: String,
  rfqId: String,
  status: { type: String, enum: ['active', 'archived', 'closed'], default: 'active' },
  lastMessageAt: Date,
  unreadCounts: { type: Map, of: Number, default: new Map() },
  settings: {
    allowFiles: { type: Boolean, default: true },
    allowVoice: { type: Boolean, default: true },
    allowVideo: { type: Boolean, default: true },
    autoTranslate: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

ConversationSchema.index({ 'participants.userId': 1 });
ConversationSchema.index({ status: 1, updatedAt: -1 });
ConversationSchema.index({ projectId: 1 });
ConversationSchema.index({ rfqId: 1 });

const ConversationModel = mongoose.model('Conversation', ConversationSchema);

export class RealtimeMessagingService extends EventEmitter {
  private static instance: RealtimeMessagingService;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    super();
    this.initializeService();
  }

  static getInstance(): RealtimeMessagingService {
    if (!RealtimeMessagingService.instance) {
      RealtimeMessagingService.instance = new RealtimeMessagingService();
    }
    return RealtimeMessagingService.instance;
  }

  private async initializeService(): Promise<void> {
    productionLogger.info('Realtime messaging service initialized');
  }

  // Socket connection management
  async handleUserConnection(userId: string, socket: Socket): Promise<void> {
    // Add socket to user's socket set
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);
    this.socketUsers.set(socket.id, userId);

    // Update user's online status
    await this.updateUserOnlineStatus(userId, true);

    // Join user's conversation rooms
    const conversations = await this.getUserConversations(userId);
    for (const conversation of conversations) {
      socket.join(`conversation:${conversation.id}`);
    }

    productionLogger.info('User connected to messaging', { userId, socketId: socket.id });

    // Send pending messages
    await this.sendPendingMessages(userId, socket);
  }

  async handleUserDisconnection(socket: Socket): Promise<void> {
    const userId = this.socketUsers.get(socket.id);
    if (!userId) return;

    // Remove socket from user's socket set
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        // Update user's online status only if no other sockets
        await this.updateUserOnlineStatus(userId, false);
      }
    }

    this.socketUsers.delete(socket.id);

    productionLogger.info('User disconnected from messaging', { userId, socketId: socket.id });
  }

  // Conversation management
  async createConversation(
    participants: Array<{ userId: string; role: 'expert' | 'client' | 'agent' }>,
    type: 'direct' | 'group' | 'support' = 'direct',
    metadata?: {
      title?: string;
      description?: string;
      projectId?: string;
      rfqId?: string;
    }
  ): Promise<Conversation> {
    // Check if direct conversation already exists
    if (type === 'direct' && participants.length === 2) {
      const existingConversation = await ConversationModel.findOne({
        type: 'direct',
        'participants.userId': { $all: participants.map(p => p.userId) }
      });

      if (existingConversation) {
        return existingConversation.toObject() as Conversation;
      }
    }

    const conversation = await ConversationModel.create({
      participants,
      type,
      ...metadata,
      unreadCounts: new Map()
    });

    // Notify participants
    this.notifyParticipants(conversation.id, 'conversation:created', {
      conversation: conversation.toObject()
    });

    productionLogger.info('Conversation created', {
      conversationId: conversation.id,
      type,
      participantCount: participants.length
    });

    return conversation.toObject() as Conversation;
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: Message['type'] = 'text',
    attachments?: Message['attachments'],
    replyTo?: string
  ): Promise<Message> {
    // Get conversation
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Verify sender is participant
    const sender = conversation.participants.find(p => p.userId === senderId);
    if (!sender) {
      throw new Error('Sender not a participant in this conversation');
    }

    // Create message
    const message = await MessageModel.create({
      conversationId,
      senderId,
      senderName: sender.userId, // In production, fetch from user service
      senderRole: sender.role,
      content,
      type,
      attachments,
      replyTo,
      readBy: [{ userId: senderId, readAt: new Date() }]
    });

    // Update conversation
    conversation.lastMessageAt = new Date();
    
    // Update unread counts for other participants
    conversation.participants.forEach(participant => {
      if (participant.userId !== senderId) {
        const currentCount = conversation.unreadCounts.get(participant.userId) || 0;
        conversation.unreadCounts.set(participant.userId, currentCount + 1);
      }
    });

    await conversation.save();

    // Auto-translate if enabled
    if (conversation.settings.autoTranslate) {
      await this.translateMessageIfNeeded(message);
    }

    // Real-time notification
    this.notifyParticipants(conversationId, 'message:new', {
      message: message.toObject()
    }, senderId);

    // Push notifications for offline users
    await this.sendPushNotifications(conversation, message);

    productionLogger.info('Message sent', {
      messageId: message.id,
      conversationId,
      senderId,
      type
    });

    this.emit('message:sent', message.toObject());
    return message.toObject() as Message;
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    messageIds: string[]
  ): Promise<void> {
    // Update messages
    await MessageModel.updateMany(
      {
        _id: { $in: messageIds },
        conversationId,
        'readBy.userId': { $ne: userId }
      },
      {
        $push: {
          readBy: { userId, readAt: new Date() }
        }
      }
    );

    // Reset unread count for user
    const conversation = await ConversationModel.findById(conversationId);
    if (conversation) {
      conversation.unreadCounts.set(userId, 0);
      await conversation.save();
    }

    // Notify sender(s) about read receipts
    const messages = await MessageModel.find({ _id: { $in: messageIds } });
    const senderIds = [...new Set(messages.map(m => m.senderId))];
    
    senderIds.forEach(senderId => {
      this.notifyUser(senderId, 'messages:read', {
        conversationId,
        messageIds,
        readBy: userId,
        readAt: new Date()
      });
    });

    productionLogger.info('Messages marked as read', {
      conversationId,
      userId,
      messageCount: messageIds.length
    });
  }

  async editMessage(
    messageId: string,
    userId: string,
    newContent: string
  ): Promise<Message> {
    const message = await MessageModel.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('Can only edit own messages');
    }

    // Check if message is too old to edit (e.g., 1 hour)
    const messageAge = Date.now() - message.timestamp.getTime();
    if (messageAge > 60 * 60 * 1000) {
      throw new Error('Message too old to edit');
    }

    message.content = newContent;
    message.editedAt = new Date();
    await message.save();

    // Notify participants
    this.notifyParticipants(message.conversationId, 'message:edited', {
      message: message.toObject()
    });

    productionLogger.info('Message edited', { messageId, userId });
    return message.toObject() as Message;
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await MessageModel.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId !== userId) {
      throw new Error('Can only delete own messages');
    }

    message.deletedAt = new Date();
    message.content = '[Message deleted]';
    await message.save();

    // Notify participants
    this.notifyParticipants(message.conversationId, 'message:deleted', {
      messageId,
      deletedBy: userId,
      deletedAt: message.deletedAt
    });

    productionLogger.info('Message deleted', { messageId, userId });
  }

  async handleTypingIndicator(
    conversationId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    // Clear existing timer
    const timerKey = `${conversationId}:${userId}`;
    const existingTimer = this.typingTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.typingTimers.delete(timerKey);
    }

    if (isTyping) {
      // Set auto-clear timer (5 seconds)
      const timer = setTimeout(() => {
        this.handleTypingIndicator(conversationId, userId, false);
      }, 5000);
      this.typingTimers.set(timerKey, timer);
    }

    // Update conversation participant status
    await ConversationModel.updateOne(
      { _id: conversationId, 'participants.userId': userId },
      { $set: { 'participants.$.isTyping': isTyping } }
    );

    // Notify other participants
    this.notifyParticipants(conversationId, 'typing:update', {
      userId,
      isTyping,
      timestamp: new Date()
    }, userId);
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      before?: Date;
      after?: Date;
    } = {}
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    // Verify user is participant
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new Error('Not authorized to view this conversation');
    }

    // Build query
    const query: any = { conversationId };
    if (options.before) {
      query.timestamp = { $lt: options.before };
    }
    if (options.after) {
      query.timestamp = { ...query.timestamp, $gt: options.after };
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const messages = await MessageModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit + 1)
      .skip(offset);

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop();
    }

    return {
      messages: messages.map(m => m.toObject() as Message),
      hasMore
    };
  }

  async getUserConversations(
    userId: string,
    options: {
      status?: 'active' | 'archived' | 'closed';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Conversation[]> {
    const query: any = { 'participants.userId': userId };
    if (options.status) {
      query.status = options.status;
    }

    const conversations = await ConversationModel
      .find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(options.limit || 50)
      .skip(options.offset || 0);

    return conversations.map(c => c.toObject() as Conversation);
  }

  async searchMessages(
    userId: string,
    searchQuery: string,
    options: {
      conversationId?: string;
      limit?: number;
    } = {}
  ): Promise<Message[]> {
    // Get user's conversations
    const conversations = await this.getUserConversations(userId);
    const conversationIds = conversations.map(c => c.id);

    const query: any = {
      conversationId: options.conversationId || { $in: conversationIds },
      $text: { $search: searchQuery }
    };

    const messages = await MessageModel
      .find(query)
      .sort({ score: { $meta: 'textScore' } })
      .limit(options.limit || 50);

    return messages.map(m => m.toObject() as Message);
  }

  // Helper methods
  private async updateUserOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await ConversationModel.updateMany(
      { 'participants.userId': userId },
      { 
        $set: { 
          'participants.$.isOnline': isOnline,
          'participants.$.lastSeen': new Date()
        } 
      }
    );

    // Notify user's conversations about status change
    const conversations = await this.getUserConversations(userId);
    conversations.forEach(conversation => {
      this.notifyParticipants(conversation.id, 'participant:statusUpdate', {
        userId,
        isOnline,
        lastSeen: new Date()
      }, userId);
    });
  }

  private notifyParticipants(
    conversationId: string,
    event: string,
    data: any,
    excludeUserId?: string
  ): void {
    // Emit to Socket.io room
    this.emit('notify:room', {
      room: `conversation:${conversationId}`,
      event,
      data,
      excludeUserId
    });
  }

  private notifyUser(userId: string, event: string, data: any): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        this.emit('notify:socket', {
          socketId,
          event,
          data
        });
      });
    }
  }

  private async translateMessageIfNeeded(message: any): Promise<void> {
    try {
      // Detect language
      const detectedLanguage = await translatorService.detectLanguage(message.content);
      
      if (detectedLanguage && detectedLanguage !== 'en') {
        const translation = await translatorService.translateText(
          message.content,
          'en',
          detectedLanguage
        );

        message.metadata = {
          ...message.metadata,
          language: detectedLanguage,
          translated: true,
          originalContent: message.content
        };
        
        await message.save();
      }
    } catch (error) {
      productionLogger.error('Message translation failed', { 
        messageId: message.id, 
        error 
      });
    }
  }

  private async sendPushNotifications(conversation: any, message: any): Promise<void> {
    // Send push notifications to offline participants
    const offlineParticipants = conversation.participants.filter(
      (p: any) => p.userId !== message.senderId && !p.isOnline
    );

    for (const participant of offlineParticipants) {
      this.emit('push:notification', {
        userId: participant.userId,
        title: `New message from ${message.senderName}`,
        body: message.content.substring(0, 100),
        data: {
          conversationId: conversation.id,
          messageId: message.id
        }
      });
    }
  }

  private async sendPendingMessages(userId: string, socket: Socket): Promise<void> {
    // Get conversations with unread messages
    const conversations = await ConversationModel.find({
      'participants.userId': userId,
      [`unreadCounts.${userId}`]: { $gt: 0 }
    });

    for (const conversation of conversations) {
      const unreadCount = conversation.unreadCounts.get(userId) || 0;
      if (unreadCount > 0) {
        socket.emit('messages:pending', {
          conversationId: conversation.id,
          unreadCount
        });
      }
    }
  }

  // Create text index for message search
  async createSearchIndex(): Promise<void> {
    await MessageModel.collection.createIndex({ content: 'text' });
    productionLogger.info('Message search index created');
  }
}

export const realtimeMessagingService = RealtimeMessagingService.getInstance();