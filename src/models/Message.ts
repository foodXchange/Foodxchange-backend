import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
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
    reactions?: Record<string, string[]>;
  };
  timestamp: Date;
  edited?: boolean;
  editedAt?: Date;
  deleted?: boolean;
  deletedAt?: Date;
  delivered: boolean;
  read: boolean;
  readBy?: Array<{
    userId: string;
    readAt: Date;
  }>;
}

const MessageSchema: Schema = new Schema({
  conversationId: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: String,
    required: true,
    index: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'typing', 'read_receipt'],
    default: 'text',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  metadata: {
    fileName: String,
    fileSize: Number,
    mimeType: String,
    thumbnailUrl: String,
    originalUrl: String,
    mentions: [String],
    links: [String],
    reactions: {
      type: Map,
      of: [String]
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  delivered: {
    type: Boolean,
    default: false
  },
  read: {
    type: Boolean,
    default: false
  },
  readBy: [{
    userId: {
      type: String,
      required: true
    },
    readAt: {
      type: Date,
      required: true
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
MessageSchema.index({ conversationId: 1, timestamp: -1 });
MessageSchema.index({ senderId: 1, timestamp: -1 });
MessageSchema.index({ content: 'text' }); // Text search index
MessageSchema.index({ type: 1, timestamp: -1 });
MessageSchema.index({ 'readBy.userId': 1 });

// Pre-save middleware
MessageSchema.pre('save', function(next) {
  if (this.isModified('content') && !this.isNew) {
    this.edited = true;
    this.editedAt = new Date();
  }
  next();
});

// Virtual for read status
MessageSchema.virtual('isRead').get(function() {
  return this.readBy && this.readBy.length > 0;
});

// Method to check if message is read by specific user
MessageSchema.methods.isReadBy = function(userId: string): boolean {
  return this.readBy?.some((read: any) => read.userId === userId) || false;
};

// Method to add reaction
MessageSchema.methods.addReaction = function(emoji: string, userId: string) {
  if (!this.metadata) {
    this.metadata = {};
  }
  if (!this.metadata.reactions) {
    this.metadata.reactions = {};
  }
  if (!this.metadata.reactions[emoji]) {
    this.metadata.reactions[emoji] = [];
  }

  const userReactions = this.metadata.reactions[emoji];
  if (!userReactions.includes(userId)) {
    userReactions.push(userId);
  }
};

// Method to remove reaction
MessageSchema.methods.removeReaction = function(emoji: string, userId: string) {
  if (this.metadata?.reactions?.[emoji]) {
    const index = this.metadata.reactions[emoji].indexOf(userId);
    if (index > -1) {
      this.metadata.reactions[emoji].splice(index, 1);
      if (this.metadata.reactions[emoji].length === 0) {
        delete this.metadata.reactions[emoji];
      }
    }
  }
};

// Static method to find messages in conversation
MessageSchema.statics.findInConversation = function(conversationId: string, options: any = {}) {
  const query = { conversationId, deleted: { $ne: true } };

  if (options.before) {
    query.timestamp = { $lt: options.before };
  }

  if (options.after) {
    query.timestamp = { $gt: options.after };
  }

  if (options.type) {
    query.type = options.type;
  }

  return this.find(query)
    .sort({ timestamp: options.order === 'asc' ? 1 : -1 })
    .limit(options.limit || 50)
    .skip(options.offset || 0);
};

// Static method for text search
MessageSchema.statics.searchMessages = function(searchTerm: string, conversationIds: string[], options: any = {}) {
  const query = {
    $text: { $search: searchTerm },
    conversationId: { $in: conversationIds },
    deleted: { $ne: true }
  };

  if (options.type) {
    query.type = options.type;
  }

  return this.find(query, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, timestamp: -1 })
    .limit(options.limit || 20)
    .skip(options.offset || 0);
};

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
