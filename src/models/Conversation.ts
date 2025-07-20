import mongoose, { Document, Schema, Model } from 'mongoose';

// Interfaces for ConversationParticipant
export interface IConversationParticipant {
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'moderator' | 'member' | 'guest';
  permissions: {
    canSendMessages: boolean;
    canUploadFiles: boolean;
    canDeleteMessages: boolean;
    canEditMessages: boolean;
    canAddParticipants: boolean;
    canRemoveParticipants: boolean;
    canChangeSettings: boolean;
    canViewHistory: boolean;
  };
  notificationSettings: {
    enabled: boolean;
    emailNotifications: boolean;
    pushNotifications: boolean;
    soundEnabled: boolean;
    muteUntil?: Date;
  };
  joinedAt: Date;
  lastRead: Date;
  lastActivity: Date;
  isActive: boolean;
  isPinned: boolean;
  customNickname?: string;
  status?: 'online' | 'away' | 'busy' | 'offline';
}

// Interface for ConversationSettings
export interface IConversationSettings {
  privacy: {
    isPublic: boolean;
    requireApproval: boolean;
    allowGuestAccess: boolean;
    visibility: 'public' | 'private' | 'restricted';
  };
  fileUpload: {
    enabled: boolean;
    maxSizeInMB: number;
    allowedTypes: string[];
    storageLimit: number;
  };
  retention: {
    messageRetentionDays: number;
    autoDeleteEnabled: boolean;
    archiveAfterDays: number;
  };
  features: {
    threadingEnabled: boolean;
    reactionsEnabled: boolean;
    typingIndicatorsEnabled: boolean;
    readReceiptsEnabled: boolean;
    linkPreviewsEnabled: boolean;
    messageEditingEnabled: boolean;
    messageSearchEnabled: boolean;
  };
  moderation: {
    enabled: boolean;
    profanityFilter: boolean;
    requireApprovalForLinks: boolean;
    requireApprovalForFiles: boolean;
    blockedWords: string[];
  };
}

// Main Conversation interface
export interface IConversation extends Document {
  type: 'direct' | 'group' | 'channel' | 'support' | 'broadcast';
  name?: string;
  description?: string;
  avatar?: string;

  participants: IConversationParticipant[];
  settings: IConversationSettings;

  // Metadata
  metadata: {
    messageCount: number;
    attachmentCount: number;
    lastMessageAt?: Date;
    lastMessagePreview?: string;
    lastMessageSender?: mongoose.Types.ObjectId;
    pinnedMessagesCount: number;
    activeMembersCount: number;
    totalMembersCount: number;
    createdBy: mongoose.Types.ObjectId;
    tags: string[];
    category?: string;
    language?: string;
    customData?: Record<string, any>;
  };

  // Related entities
  relatedTo?: {
    model: string;
    id: mongoose.Types.ObjectId;
    context?: string;
  };

  // Status and lifecycle
  status: 'active' | 'archived' | 'deleted' | 'suspended';
  archivedAt?: Date;
  deletedAt?: Date;
  suspendedUntil?: Date;
  suspensionReason?: string;

  // Support-specific fields
  supportTicket?: {
    ticketNumber: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    category: string;
    assignedTo?: mongoose.Types.ObjectId;
    resolvedAt?: Date;
    satisfaction?: number;
  };

  // Methods
  addParticipant(userId: mongoose.Types.ObjectId, role?: string, addedBy?: mongoose.Types.ObjectId): Promise<IConversation>;
  removeParticipant(userId: mongoose.Types.ObjectId, removedBy?: mongoose.Types.ObjectId): Promise<IConversation>;
  updateParticipantRole(userId: mongoose.Types.ObjectId, newRole: string, updatedBy?: mongoose.Types.ObjectId): Promise<IConversation>;
  updateParticipantPermissions(userId: mongoose.Types.ObjectId, permissions: Partial<IConversationParticipant['permissions']>): Promise<IConversation>;
  getActiveParticipants(): IConversationParticipant[];
  isUserParticipant(userId: mongoose.Types.ObjectId): boolean;
  getUserRole(userId: mongoose.Types.ObjectId): string | null;
  archive(archivedBy?: mongoose.Types.ObjectId): Promise<IConversation>;
  unarchive(unarchivedBy?: mongoose.Types.ObjectId): Promise<IConversation>;
  markAsRead(userId: mongoose.Types.ObjectId): Promise<IConversation>;
  updateLastMessage(messageId: mongoose.Types.ObjectId, content: string, senderId: mongoose.Types.ObjectId): Promise<IConversation>;
}

// Participant Schema
const ConversationParticipantSchema = new Schema<IConversationParticipant>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'moderator', 'member', 'guest'],
    default: 'member'
  },
  permissions: {
    canSendMessages: { type: Boolean, default: true },
    canUploadFiles: { type: Boolean, default: true },
    canDeleteMessages: { type: Boolean, default: false },
    canEditMessages: { type: Boolean, default: true },
    canAddParticipants: { type: Boolean, default: false },
    canRemoveParticipants: { type: Boolean, default: false },
    canChangeSettings: { type: Boolean, default: false },
    canViewHistory: { type: Boolean, default: true }
  },
  notificationSettings: {
    enabled: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    muteUntil: Date
  },
  joinedAt: { type: Date, default: Date.now },
  lastRead: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  isPinned: { type: Boolean, default: false },
  customNickname: String,
  status: {
    type: String,
    enum: ['online', 'away', 'busy', 'offline'],
    default: 'offline'
  }
}, { _id: false });

// Settings Schema
const ConversationSettingsSchema = new Schema<IConversationSettings>({
  privacy: {
    isPublic: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false },
    allowGuestAccess: { type: Boolean, default: false },
    visibility: {
      type: String,
      enum: ['public', 'private', 'restricted'],
      default: 'private'
    }
  },
  fileUpload: {
    enabled: { type: Boolean, default: true },
    maxSizeInMB: { type: Number, default: 10 },
    allowedTypes: { type: [String], default: ['image/*', 'application/pdf', 'text/*'] },
    storageLimit: { type: Number, default: 100 } // in MB
  },
  retention: {
    messageRetentionDays: { type: Number, default: -1 }, // -1 means unlimited
    autoDeleteEnabled: { type: Boolean, default: false },
    archiveAfterDays: { type: Number, default: 365 }
  },
  features: {
    threadingEnabled: { type: Boolean, default: false },
    reactionsEnabled: { type: Boolean, default: true },
    typingIndicatorsEnabled: { type: Boolean, default: true },
    readReceiptsEnabled: { type: Boolean, default: true },
    linkPreviewsEnabled: { type: Boolean, default: true },
    messageEditingEnabled: { type: Boolean, default: true },
    messageSearchEnabled: { type: Boolean, default: true }
  },
  moderation: {
    enabled: { type: Boolean, default: false },
    profanityFilter: { type: Boolean, default: false },
    requireApprovalForLinks: { type: Boolean, default: false },
    requireApprovalForFiles: { type: Boolean, default: false },
    blockedWords: { type: [String], default: [] }
  }
}, { _id: false });

// Main Conversation Schema
const ConversationSchema = new Schema<IConversation>({
  type: {
    type: String,
    enum: ['direct', 'group', 'channel', 'support', 'broadcast'],
    required: true
  },
  name: {
    type: String,
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  avatar: String,

  participants: [ConversationParticipantSchema],
  settings: {
    type: ConversationSettingsSchema,
    default: () => ({})
  },

  metadata: {
    messageCount: { type: Number, default: 0 },
    attachmentCount: { type: Number, default: 0 },
    lastMessageAt: Date,
    lastMessagePreview: String,
    lastMessageSender: { type: Schema.Types.ObjectId, ref: 'User' },
    pinnedMessagesCount: { type: Number, default: 0 },
    activeMembersCount: { type: Number, default: 0 },
    totalMembersCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags: { type: [String], default: [] },
    category: String,
    language: String,
    customData: { type: Schema.Types.Mixed }
  },

  relatedTo: {
    model: String,
    id: Schema.Types.ObjectId,
    context: String
  },

  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'suspended'],
    default: 'active'
  },
  archivedAt: Date,
  deletedAt: Date,
  suspendedUntil: Date,
  suspensionReason: String,

  supportTicket: {
    ticketNumber: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    },
    category: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    satisfaction: { type: Number, min: 1, max: 5 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
ConversationSchema.index({ type: 1, status: 1 });
ConversationSchema.index({ 'participants.userId': 1, status: 1 });
ConversationSchema.index({ 'metadata.createdBy': 1 });
ConversationSchema.index({ 'metadata.tags': 1 });
ConversationSchema.index({ 'relatedTo.model': 1, 'relatedTo.id': 1 });
ConversationSchema.index({ 'supportTicket.ticketNumber': 1 }, { sparse: true });
ConversationSchema.index({ 'metadata.lastMessageAt': -1 });
ConversationSchema.index({ createdAt: -1 });

// Virtual properties
ConversationSchema.virtual('unreadCount').get(function(this: IConversation) {
  // This would be calculated based on messages collection
  return 0; // Placeholder - implement with message counting logic
});

ConversationSchema.virtual('isGroup').get(function(this: IConversation) {
  return this.type === 'group' || this.type === 'channel';
});

ConversationSchema.virtual('isDirect').get(function(this: IConversation) {
  return this.type === 'direct';
});

ConversationSchema.virtual('participantCount').get(function(this: IConversation) {
  return this.participants.filter(p => p.isActive).length;
});

// Instance methods
ConversationSchema.methods.addParticipant = async function(
  userId: mongoose.Types.ObjectId,
  role: string = 'member',
  addedBy?: mongoose.Types.ObjectId
): Promise<IConversation> {
  const existingParticipant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );

  if (existingParticipant) {
    if (!existingParticipant.isActive) {
      existingParticipant.isActive = true;
      existingParticipant.joinedAt = new Date();
    }
    return this.save();
  }

  const newParticipant: Partial<IConversationParticipant> = {
    userId,
    role: role as any,
    joinedAt: new Date(),
    lastRead: new Date(),
    lastActivity: new Date(),
    isActive: true
  };

  this.participants.push(newParticipant as IConversationParticipant);
  this.metadata.totalMembersCount = this.participants.length;
  this.metadata.activeMembersCount = this.participants.filter(p => p.isActive).length;

  return this.save();
};

ConversationSchema.methods.removeParticipant = async function(
  userId: mongoose.Types.ObjectId,
  removedBy?: mongoose.Types.ObjectId
): Promise<IConversation> {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );

  if (participant) {
    participant.isActive = false;
    this.metadata.activeMembersCount = this.participants.filter(p => p.isActive).length;
  }

  return this.save();
};

ConversationSchema.methods.updateParticipantRole = async function(
  userId: mongoose.Types.ObjectId,
  newRole: string,
  updatedBy?: mongoose.Types.ObjectId
): Promise<IConversation> {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );

  if (participant) {
    participant.role = newRole as any;

    // Update permissions based on role
    switch (newRole) {
      case 'owner':
      case 'admin':
        Object.assign(participant.permissions, {
          canSendMessages: true,
          canUploadFiles: true,
          canDeleteMessages: true,
          canEditMessages: true,
          canAddParticipants: true,
          canRemoveParticipants: true,
          canChangeSettings: true,
          canViewHistory: true
        });
        break;
      case 'moderator':
        Object.assign(participant.permissions, {
          canSendMessages: true,
          canUploadFiles: true,
          canDeleteMessages: true,
          canEditMessages: true,
          canAddParticipants: true,
          canRemoveParticipants: false,
          canChangeSettings: false,
          canViewHistory: true
        });
        break;
      case 'member':
        Object.assign(participant.permissions, {
          canSendMessages: true,
          canUploadFiles: true,
          canDeleteMessages: false,
          canEditMessages: true,
          canAddParticipants: false,
          canRemoveParticipants: false,
          canChangeSettings: false,
          canViewHistory: true
        });
        break;
      case 'guest':
        Object.assign(participant.permissions, {
          canSendMessages: true,
          canUploadFiles: false,
          canDeleteMessages: false,
          canEditMessages: false,
          canAddParticipants: false,
          canRemoveParticipants: false,
          canChangeSettings: false,
          canViewHistory: false
        });
        break;
    }
  }

  return this.save();
};

ConversationSchema.methods.updateParticipantPermissions = async function(
  userId: mongoose.Types.ObjectId,
  permissions: Partial<IConversationParticipant['permissions']>
): Promise<IConversation> {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );

  if (participant) {
    Object.assign(participant.permissions, permissions);
  }

  return this.save();
};

ConversationSchema.methods.getActiveParticipants = function(): IConversationParticipant[] {
  return this.participants.filter(p => p.isActive);
};

ConversationSchema.methods.isUserParticipant = function(userId: mongoose.Types.ObjectId): boolean {
  return this.participants.some(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
};

ConversationSchema.methods.getUserRole = function(userId: mongoose.Types.ObjectId): string | null {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString() && p.isActive
  );
  return participant ? participant.role : null;
};

ConversationSchema.methods.archive = async function(archivedBy?: mongoose.Types.ObjectId): Promise<IConversation> {
  this.status = 'archived';
  this.archivedAt = new Date();
  return this.save();
};

ConversationSchema.methods.unarchive = async function(unarchivedBy?: mongoose.Types.ObjectId): Promise<IConversation> {
  this.status = 'active';
  this.archivedAt = undefined;
  return this.save();
};

ConversationSchema.methods.markAsRead = async function(userId: mongoose.Types.ObjectId): Promise<IConversation> {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );

  if (participant) {
    participant.lastRead = new Date();
    participant.lastActivity = new Date();
  }

  return this.save();
};

ConversationSchema.methods.updateLastMessage = async function(
  messageId: mongoose.Types.ObjectId,
  content: string,
  senderId: mongoose.Types.ObjectId
): Promise<IConversation> {
  this.metadata.lastMessageAt = new Date();
  this.metadata.lastMessagePreview = content.substring(0, 100);
  this.metadata.lastMessageSender = senderId;
  this.metadata.messageCount += 1;

  return this.save();
};

// Static methods
ConversationSchema.statics.findByParticipant = function(
  userId: mongoose.Types.ObjectId,
  options?: {
    status?: string;
    type?: string;
    limit?: number;
    skip?: number;
  }
) {
  const query: any = {
    'participants.userId': userId,
    'participants.isActive': true
  };

  if (options?.status) {
    query.status = options.status;
  }

  if (options?.type) {
    query.type = options.type;
  }

  let queryBuilder = this.find(query)
    .populate('participants.userId', 'firstName lastName email avatar')
    .populate('metadata.createdBy', 'firstName lastName')
    .populate('metadata.lastMessageSender', 'firstName lastName')
    .sort({ 'metadata.lastMessageAt': -1 });

  if (options?.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }

  if (options?.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }

  return queryBuilder.exec();
};

ConversationSchema.statics.findDirectConversation = async function(
  userId1: mongoose.Types.ObjectId,
  userId2: mongoose.Types.ObjectId
) {
  return this.findOne({
    type: 'direct',
    status: 'active',
    $and: [
      { 'participants.userId': userId1 },
      { 'participants.userId': userId2 }
    ],
    'participants.2': { $exists: false } // Ensure only 2 participants
  }).exec();
};

ConversationSchema.statics.createDirectConversation = async function(
  userId1: mongoose.Types.ObjectId,
  userId2: mongoose.Types.ObjectId,
  createdBy: mongoose.Types.ObjectId
) {
  const conversation = new this({
    type: 'direct',
    participants: [
      {
        userId: userId1,
        role: userId1.toString() === createdBy.toString() ? 'owner' : 'member'
      },
      {
        userId: userId2,
        role: userId2.toString() === createdBy.toString() ? 'owner' : 'member'
      }
    ],
    metadata: {
      createdBy,
      totalMembersCount: 2,
      activeMembersCount: 2
    }
  });

  return conversation.save();
};

ConversationSchema.statics.searchConversations = function(
  searchOptions: {
    query?: string;
    tags?: string[];
    type?: string;
    participantId?: mongoose.Types.ObjectId;
    status?: string;
    dateRange?: { start: Date; end: Date };
  }
) {
  const query: any = {};

  if (searchOptions.query) {
    query.$or = [
      { name: { $regex: searchOptions.query, $options: 'i' } },
      { description: { $regex: searchOptions.query, $options: 'i' } },
      { 'metadata.tags': { $in: [searchOptions.query] } }
    ];
  }

  if (searchOptions.tags && searchOptions.tags.length > 0) {
    query['metadata.tags'] = { $in: searchOptions.tags };
  }

  if (searchOptions.type) {
    query.type = searchOptions.type;
  }

  if (searchOptions.participantId) {
    query['participants.userId'] = searchOptions.participantId;
    query['participants.isActive'] = true;
  }

  if (searchOptions.status) {
    query.status = searchOptions.status;
  }

  if (searchOptions.dateRange) {
    query.createdAt = {
      $gte: searchOptions.dateRange.start,
      $lte: searchOptions.dateRange.end
    };
  }

  return this.find(query)
    .populate('participants.userId', 'firstName lastName email avatar')
    .populate('metadata.createdBy', 'firstName lastName')
    .sort({ 'metadata.lastMessageAt': -1 })
    .exec();
};

// Model definition
export interface IConversationModel extends Model<IConversation> {
  findByParticipant(
    userId: mongoose.Types.ObjectId,
    options?: {
      status?: string;
      type?: string;
      limit?: number;
      skip?: number;
    }
  ): Promise<IConversation[]>;

  findDirectConversation(
    userId1: mongoose.Types.ObjectId,
    userId2: mongoose.Types.ObjectId
  ): Promise<IConversation | null>;

  createDirectConversation(
    userId1: mongoose.Types.ObjectId,
    userId2: mongoose.Types.ObjectId,
    createdBy: mongoose.Types.ObjectId
  ): Promise<IConversation>;

  searchConversations(searchOptions: {
    query?: string;
    tags?: string[];
    type?: string;
    participantId?: mongoose.Types.ObjectId;
    status?: string;
    dateRange?: { start: Date; end: Date };
  }): Promise<IConversation[]>;
}

const Conversation = mongoose.model<IConversation, IConversationModel>('Conversation', ConversationSchema);

export default Conversation;
