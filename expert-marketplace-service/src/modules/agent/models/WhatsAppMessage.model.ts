import { Schema, model } from 'mongoose';
import { IWhatsAppMessage } from '../interfaces/agent.interface';

const whatsAppMessageSchema = new Schema<IWhatsAppMessage>({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  agentId: {
    type: Schema.Types.ObjectId,
    ref: 'AgentProfile',
    required: true,
    index: true
  },
  leadId: {
    type: Schema.Types.ObjectId,
    ref: 'Lead',
    index: true
  },
  to: {
    type: String,
    required: true,
    index: true
  },
  from: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'document', 'template', 'interactive'],
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true
  },
  templateName: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
    default: 'queued',
    required: true,
    index: true
  },
  deliveredAt: {
    type: Date,
    index: true
  },
  readAt: {
    type: Date
  },
  failureReason: {
    type: String
  },
  campaignId: {
    type: String,
    index: true
  },
  isAutomated: {
    type: Boolean,
    default: false,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
whatsAppMessageSchema.index({ agentId: 1, createdAt: -1 });
whatsAppMessageSchema.index({ leadId: 1, createdAt: -1 });
whatsAppMessageSchema.index({ to: 1, createdAt: -1 });
whatsAppMessageSchema.index({ status: 1, createdAt: -1 });
whatsAppMessageSchema.index({ campaignId: 1 });
whatsAppMessageSchema.index({ templateName: 1, createdAt: -1 });

// Virtual for delivery time
whatsAppMessageSchema.virtual('deliveryTime').get(function() {
  if (!this.deliveredAt || !this.createdAt) return null;
  return this.deliveredAt.getTime() - this.createdAt.getTime();
});

// Virtual for read time
whatsAppMessageSchema.virtual('readTime').get(function() {
  if (!this.readAt || !this.deliveredAt) return null;
  return this.readAt.getTime() - this.deliveredAt.getTime();
});

// Virtual for is successful
whatsAppMessageSchema.virtual('isSuccessful').get(function() {
  return ['sent', 'delivered', 'read'].includes(this.status);
});

// Pre-save middleware
whatsAppMessageSchema.pre('save', function(next) {
  // Generate message ID if not exists
  if (!this.messageId) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.messageId = `WA${timestamp}${random}`;
  }

  // Set delivery time when status changes to delivered
  if (this.isModified('status') && this.status === 'delivered' && !this.deliveredAt) {
    this.deliveredAt = new Date();
  }

  // Set read time when status changes to read
  if (this.isModified('status') && this.status === 'read' && !this.readAt) {
    this.readAt = new Date();
  }

  next();
});

// Method to mark as sent
whatsAppMessageSchema.methods.markAsSent = async function() {
  this.status = 'sent';
  await this.save();
};

// Method to mark as delivered
whatsAppMessageSchema.methods.markAsDelivered = async function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  await this.save();
};

// Method to mark as read
whatsAppMessageSchema.methods.markAsRead = async function() {
  this.status = 'read';
  this.readAt = new Date();
  await this.save();
};

// Method to mark as failed
whatsAppMessageSchema.methods.markAsFailed = async function(reason: string) {
  this.status = 'failed';
  this.failureReason = reason;
  await this.save();
};

// Static method to get message analytics
whatsAppMessageSchema.statics.getMessageAnalytics = async function(
  agentId?: string,
  startDate?: Date,
  endDate?: Date
) {
  const matchQuery: any = {};
  
  if (agentId) {
    matchQuery.agentId = agentId;
  }
  
  if (startDate && endDate) {
    matchQuery.createdAt = { $gte: startDate, $lte: endDate };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        sentMessages: {
          $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0] }
        },
        deliveredMessages: {
          $sum: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] }
        },
        readMessages: {
          $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] }
        },
        failedMessages: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        automatedMessages: {
          $sum: { $cond: ['$isAutomated', 1, 0] }
        },
        manualMessages: {
          $sum: { $cond: [{ $not: '$isAutomated' }, 1, 0] }
        },
        avgDeliveryTime: { $avg: '$deliveryTime' },
        avgReadTime: { $avg: '$readTime' }
      }
    },
    {
      $addFields: {
        deliveryRate: {
          $cond: [
            { $gt: ['$totalMessages', 0] },
            { $multiply: [{ $divide: ['$deliveredMessages', '$totalMessages'] }, 100] },
            0
          ]
        },
        readRate: {
          $cond: [
            { $gt: ['$deliveredMessages', 0] },
            { $multiply: [{ $divide: ['$readMessages', '$deliveredMessages'] }, 100] },
            0
          ]
        },
        failureRate: {
          $cond: [
            { $gt: ['$totalMessages', 0] },
            { $multiply: [{ $divide: ['$failedMessages', '$totalMessages'] }, 100] },
            0
          ]
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalMessages: 0,
    sentMessages: 0,
    deliveredMessages: 0,
    readMessages: 0,
    failedMessages: 0,
    automatedMessages: 0,
    manualMessages: 0,
    deliveryRate: 0,
    readRate: 0,
    failureRate: 0,
    avgDeliveryTime: 0,
    avgReadTime: 0
  };
};

// Static method to get pending messages
whatsAppMessageSchema.statics.getPendingMessages = function(limit: number = 100) {
  return this.find({
    status: 'queued'
  })
  .sort({ createdAt: 1 })
  .limit(limit)
  .populate('agentId', 'firstName lastName')
  .populate('leadId', 'companyName contactPerson');
};

// Static method to get failed messages
whatsAppMessageSchema.statics.getFailedMessages = function(agentId?: string) {
  const query: any = { status: 'failed' };
  if (agentId) {
    query.agentId = agentId;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .populate('agentId', 'firstName lastName')
    .populate('leadId', 'companyName contactPerson');
};

// Static method to get message history for a lead
whatsAppMessageSchema.statics.getLeadMessageHistory = function(leadId: string) {
  return this.find({ leadId })
    .sort({ createdAt: 1 })
    .populate('agentId', 'firstName lastName');
};

// Static method to get agent message stats
whatsAppMessageSchema.statics.getAgentMessageStats = async function(agentId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const pipeline = [
    {
      $match: {
        agentId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalMessages: { $sum: 1 },
        successfulMessages: {
          $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0] }
        },
        readMessages: {
          $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] }
        }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ];

  return this.aggregate(pipeline);
};

export const WhatsAppMessage = model<IWhatsAppMessage>('WhatsAppMessage', whatsAppMessageSchema);