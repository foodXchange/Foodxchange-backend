const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    role: { 
      type: String, 
      enum: ['buyer', 'supplier', 'admin', 'support'] 
    },
    lastRead: { 
      type: Date, 
      default: Date.now 
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  
  type: {
    type: String,
    enum: ['rfq_inquiry', 'order_discussion', 'general', 'support', 'complaint'],
    default: 'general'
  },
  
  relatedTo: {
    model: { 
      type: String, 
      enum: ['RFQ', 'Order', 'Product', 'Company'] 
    },
    id: mongoose.Schema.Types.ObjectId
  },
  
  lastMessage: {
    content: String,
    timestamp: Date,
    sender: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }
  },
  
  status: {
    type: String,
    enum: ['active', 'closed', 'archived'],
    default: 'active'
  },
  
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  tags: [String],
  
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  metadata: {
    messageCount: { type: Number, default: 0 },
    attachmentCount: { type: Number, default: 0 },
    avgResponseTime: Number // in minutes
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for unread message count per user
conversationSchema.virtual('unreadCount').get(function() {
  // This would need to be calculated based on messages
  return 0; // Placeholder
});

// Indexes
conversationSchema.index({ 'participants.user': 1, status: 1 });
conversationSchema.index({ type: 1, status: 1 });
conversationSchema.index({ 'relatedTo.model': 1, 'relatedTo.id': 1 });

const messageSchema = new mongoose.Schema({
  conversation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    maxlength: 5000
  },
  
  messageType: {
    type: String,
    enum: ['text', 'file', 'system', 'quote', 'order_update'],
    default: 'text'
  },
  
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number,
    mimeType: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  readBy: [{
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    readAt: { 
      type: Date, 
      default: Date.now 
    }
  }],
  
  quotedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  isSystem: { 
    type: Boolean, 
    default: false 
  }, // For automated messages
  
  isEdited: {
    type: Boolean,
    default: false
  },
  
  editedAt: Date,
  editHistory: [{
    content: String,
    editedAt: { type: Date, default: Date.now }
  }],
  
  metadata: {
    ipAddress: String,
    userAgent: String,
    platform: String
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for message age
messageSchema.virtual('ageInMinutes').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60));
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = {
  Conversation: mongoose.model('Conversation', conversationSchema),
  Message: mongoose.model('Message', messageSchema)
};
