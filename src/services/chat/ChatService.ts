import mongoose, { Document, Schema } from 'mongoose';

import { Logger } from '../../core/logging/logger';
import { getSignalRService } from '../azure/SignalRService';
import { getRealtimeEventService } from '../realtime/RealtimeEventService';

const logger = new Logger('ChatService');

export interface IChatMessage extends Document {
  fromUserId: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  tenantId: string;
  message: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  status: 'sent' | 'delivered' | 'read';

  // Context information
  orderId?: mongoose.Types.ObjectId;
  rfqId?: mongoose.Types.ObjectId;

  // Metadata
  attachments?: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
  }>;

  // Timestamps
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;

  // For editing and replies
  editedAt?: Date;
  originalMessage?: string;
  replyToMessageId?: mongoose.Types.ObjectId;

  // Soft delete
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface IChatConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  tenantId: string;

  // Conversation metadata
  title?: string;
  type: 'direct' | 'group' | 'order' | 'rfq';

  // Context
  orderId?: mongoose.Types.ObjectId;
  rfqId?: mongoose.Types.ObjectId;

  // Last message info
  lastMessageId?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;

  // Settings
  isArchived: boolean;
  isMuted: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addParticipant(userId: string): Promise<void>;
  removeParticipant(userId: string): Promise<void>;
  getMessages(page: number, limit: number): Promise<IChatMessage[]>;
  markAsRead(userId: string): Promise<void>;
}

// Chat Message Schema
const chatMessageSchema = new Schema<IChatMessage>({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },

  // Context
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  rfqId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },

  // Metadata
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number
  }],

  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  },
  deliveredAt: Date,
  readAt: Date,

  // For editing and replies
  editedAt: Date,
  originalMessage: String,
  replyToMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
chatMessageSchema.index({ tenantId: 1, fromUserId: 1, toUserId: 1, sentAt: -1 });
chatMessageSchema.index({ tenantId: 1, orderId: 1 });
chatMessageSchema.index({ tenantId: 1, rfqId: 1 });
chatMessageSchema.index({ status: 1 });

// Chat Conversation Schema
const chatConversationSchema = new Schema<IChatConversation>({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  tenantId: {
    type: String,
    required: true,
    index: true
  },

  // Conversation metadata
  title: String,
  type: {
    type: String,
    enum: ['direct', 'group', 'order', 'rfq'],
    default: 'direct'
  },

  // Context
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  rfqId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },

  // Last message info
  lastMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  },
  lastMessageAt: Date,

  // Settings
  isArchived: {
    type: Boolean,
    default: false
  },
  isMuted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
chatConversationSchema.index({ tenantId: 1, participants: 1 });
chatConversationSchema.index({ tenantId: 1, orderId: 1 });
chatConversationSchema.index({ tenantId: 1, rfqId: 1 });
chatConversationSchema.index({ lastMessageAt: -1 });

// Methods
chatConversationSchema.methods.addParticipant = async function(userId: string): Promise<void> {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    await this.save();
  }
};

chatConversationSchema.methods.removeParticipant = async function(userId: string): Promise<void> {
  this.participants = this.participants.filter(p => p.toString() !== userId);
  await this.save();
};

chatConversationSchema.methods.getMessages = async function(page: number = 1, limit: number = 50): Promise<IChatMessage[]> {
  const skip = (page - 1) * limit;

  return await ChatMessage.find({
    $or: [
      { fromUserId: { $in: this.participants } },
      { toUserId: { $in: this.participants } }
    ],
    tenantId: this.tenantId,
    isDeleted: false
  })
    .populate('fromUserId', 'name email')
    .populate('toUserId', 'name email')
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(limit);
};

chatConversationSchema.methods.markAsRead = async function(userId: string): Promise<void> {
  await ChatMessage.updateMany({
    toUserId: userId,
    tenantId: this.tenantId,
    status: { $ne: 'read' }
  }, {
    status: 'read',
    readAt: new Date()
  });
};

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
export const ChatConversation = mongoose.model<IChatConversation>('ChatConversation', chatConversationSchema);

export class ChatService {
  private readonly signalRService = getSignalRService();
  private readonly realtimeEventService = getRealtimeEventService();

  /**
   * Send a chat message
   */
  async sendMessage(
    fromUserId: string,
    toUserId: string,
    message: string,
    tenantId: string,
    options: {
      messageType?: 'text' | 'image' | 'file' | 'system';
      orderId?: string;
      rfqId?: string;
      attachments?: Array<{
        name: string;
        url: string;
        type: string;
        size: number;
      }>;
      replyToMessageId?: string;
    } = {}
  ): Promise<IChatMessage> {
    try {
      // Create message
      const chatMessage = new ChatMessage({
        fromUserId,
        toUserId,
        tenantId,
        message,
        messageType: options.messageType || 'text',
        orderId: options.orderId,
        rfqId: options.rfqId,
        attachments: options.attachments,
        replyToMessageId: options.replyToMessageId
      });

      await chatMessage.save();

      // Update or create conversation
      await this.updateConversation(fromUserId, toUserId, tenantId, chatMessage._id.toString(), options);

      // Send real-time notification
      await this.realtimeEventService.emitChatMessage(fromUserId, toUserId, tenantId, message, {
        messageId: chatMessage._id.toString(),
        messageType: options.messageType || 'text',
        orderId: options.orderId,
        rfqId: options.rfqId,
        attachments: options.attachments
      });

      // Mark message as delivered if user is online
      const isOnline = await this.signalRService.isUserConnected(toUserId);
      if (isOnline) {
        chatMessage.status = 'delivered';
        chatMessage.deliveredAt = new Date();
        await chatMessage.save();
      }

      logger.info('Chat message sent', { fromUserId, toUserId, messageId: chatMessage._id });
      return chatMessage;
    } catch (error) {
      logger.error('Failed to send chat message:', error);
      throw error;
    }
  }

  /**
   * Get conversation between two users
   */
  async getConversation(
    userId1: string,
    userId2: string,
    tenantId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{
    conversation: IChatConversation | null;
    messages: IChatMessage[];
    totalMessages: number;
  }> {
    try {
      // Find conversation
      const conversation = await ChatConversation.findOne({
        participants: { $all: [userId1, userId2] },
        tenantId,
        type: 'direct'
      });

      if (!conversation) {
        return {
          conversation: null,
          messages: [],
          totalMessages: 0
        };
      }

      // Get messages
      const skip = (page - 1) * limit;
      const messages = await ChatMessage.find({
        $or: [
          { fromUserId: userId1, toUserId: userId2 },
          { fromUserId: userId2, toUserId: userId1 }
        ],
        tenantId,
        isDeleted: false
      })
        .populate('fromUserId', 'name email')
        .populate('toUserId', 'name email')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalMessages = await ChatMessage.countDocuments({
        $or: [
          { fromUserId: userId1, toUserId: userId2 },
          { fromUserId: userId2, toUserId: userId1 }
        ],
        tenantId,
        isDeleted: false
      });

      return {
        conversation,
        messages,
        totalMessages
      };
    } catch (error) {
      logger.error('Failed to get conversation:', error);
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(
    userId: string,
    tenantId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    conversations: IChatConversation[];
    totalConversations: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const conversations = await ChatConversation.find({
        participants: userId,
        tenantId,
        isArchived: false
      })
        .populate('participants', 'name email')
        .populate('lastMessageId')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalConversations = await ChatConversation.countDocuments({
        participants: userId,
        tenantId,
        isArchived: false
      });

      return {
        conversations,
        totalConversations
      };
    } catch (error) {
      logger.error('Failed to get user conversations:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    try {
      await ChatMessage.findOneAndUpdate(
        { _id: messageId, toUserId: userId, status: { $ne: 'read' } },
        {
          status: 'read',
          readAt: new Date()
        }
      );

      logger.debug('Message marked as read', { messageId, userId });
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      throw error;
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      await ChatMessage.findOneAndUpdate(
        { _id: messageId, fromUserId: userId },
        {
          isDeleted: true,
          deletedAt: new Date()
        }
      );

      logger.info('Message deleted', { messageId, userId });
    } catch (error) {
      logger.error('Failed to delete message:', error);
      throw error;
    }
  }

  /**
   * Get messages for order/RFQ context
   */
  async getContextMessages(
    tenantId: string,
    orderId?: string,
    rfqId?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{
    messages: IChatMessage[];
    totalMessages: number;
  }> {
    try {
      const filter: any = { tenantId, isDeleted: false };

      if (orderId) {
        filter.orderId = orderId;
      }

      if (rfqId) {
        filter.rfqId = rfqId;
      }

      const skip = (page - 1) * limit;

      const messages = await ChatMessage.find(filter)
        .populate('fromUserId', 'name email')
        .populate('toUserId', 'name email')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalMessages = await ChatMessage.countDocuments(filter);

      return {
        messages,
        totalMessages
      };
    } catch (error) {
      logger.error('Failed to get context messages:', error);
      throw error;
    }
  }

  /**
   * Update or create conversation
   */
  private async updateConversation(
    fromUserId: string,
    toUserId: string,
    tenantId: string,
    messageId: string,
    options: any
  ): Promise<void> {
    try {
      let conversation = await ChatConversation.findOne({
        participants: { $all: [fromUserId, toUserId] },
        tenantId,
        type: options.orderId ? 'order' : options.rfqId ? 'rfq' : 'direct'
      });

      if (!conversation) {
        conversation = new ChatConversation({
          participants: [fromUserId, toUserId],
          tenantId,
          type: options.orderId ? 'order' : options.rfqId ? 'rfq' : 'direct',
          orderId: options.orderId,
          rfqId: options.rfqId
        });
      }

      conversation.lastMessageId = messageId;
      conversation.lastMessageAt = new Date();
      await conversation.save();
    } catch (error) {
      logger.error('Failed to update conversation:', error);
      throw error;
    }
  }
}

// Singleton instance
let chatService: ChatService;

export const getChatService = (): ChatService => {
  if (!chatService) {
    chatService = new ChatService();
  }
  return chatService;
};

export default getChatService();
