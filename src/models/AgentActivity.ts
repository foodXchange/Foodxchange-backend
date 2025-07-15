const mongoose = require('mongoose');

const agentActivitySchema = new mongoose.Schema({
  activityId: {
    type: String,
    unique: true,
    required: true
  },
  
  // Agent Reference
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  
  // Activity Type and Details
  activity: {
    type: {
      type: String,
      enum: [
        'login', 'logout', 'profile_update', 'lead_view', 'lead_accept', 'lead_decline',
        'supplier_contact', 'buyer_contact', 'proposal_submit', 'meeting_schedule',
        'document_upload', 'commission_request', 'training_complete', 'territory_update',
        'whatsapp_message', 'email_sent', 'phone_call', 'site_visit', 'deal_closed',
        'feedback_submit', 'system_notification', 'mobile_sync', 'offline_activity'
      ],
      required: true
    },
    subType: String,
    description: String,
    category: {
      type: String,
      enum: ['system', 'lead_management', 'communication', 'business_development', 'administrative'],
      required: true
    }
  },
  
  // Related Entities
  relatedEntities: {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentLead' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' }
  },
  
  // Activity Context
  context: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'whatsapp', 'email', 'api', 'system'],
      required: true
    },
    platform: {
      type: String,
      enum: ['web_app', 'mobile_app', 'whatsapp_business', 'email_client', 'api_call'],
      required: true
    },
    userAgent: String,
    ipAddress: String,
    sessionId: String,
    deviceInfo: {
      type: String,
      os: String,
      browser: String,
      version: String,
      isMobile: Boolean
    }
  },
  
  // Location Information
  location: {
    coordinates: {
      lat: Number,
      lng: Number,
      accuracy: Number // meters
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    timezone: String,
    source: {
      type: String,
      enum: ['gps', 'network', 'manual'],
      default: 'network'
    }
  },
  
  // Activity Data
  data: {
    // For lead activities
    leadInfo: {
      leadNumber: String,
      leadTitle: String,
      leadValue: Number,
      leadStatus: String,
      timeSpent: Number // minutes
    },
    
    // For communication activities
    communication: {
      messageType: String,
      messageLength: Number,
      recipientCount: Number,
      attachmentCount: Number,
      deliveryStatus: String,
      responseTime: Number // minutes
    },
    
    // For business activities
    business: {
      dealValue: Number,
      commissionAmount: Number,
      currency: String,
      paymentTerms: String,
      deliveryDate: Date
    },
    
    // For system activities
    system: {
      previousValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      changeType: String,
      systemVersion: String
    },
    
    // Performance metrics
    performance: {
      responseTime: Number, // milliseconds
      completionTime: Number, // minutes
      successRate: Number, // percentage
      errorCount: Number,
      retryCount: Number
    },
    
    // Custom fields for specific activities
    customFields: mongoose.Schema.Types.Mixed
  },
  
  // Outcome and Results
  outcome: {
    status: {
      type: String,
      enum: ['success', 'failure', 'partial', 'pending', 'cancelled'],
      default: 'success'
    },
    result: String,
    errorMessage: String,
    errorCode: String,
    nextAction: String,
    followUpRequired: Boolean,
    followUpDate: Date
  },
  
  // Time Tracking
  timing: {
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    duration: Number, // milliseconds
    timezone: String,
    businessHours: Boolean, // was this during business hours?
    dayOfWeek: Number, // 0-6 (Sunday-Saturday)
    hourOfDay: Number // 0-23
  },
  
  // Interaction Details
  interaction: {
    participants: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: String,
      name: String,
      email: String,
      type: String // buyer, supplier, admin, etc.
    }],
    communicationMethod: String,
    subject: String,
    summary: String,
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  },
  
  // Analytics and Insights
  analytics: {
    sessionId: String,
    sessionDuration: Number, // minutes
    pageViews: Number,
    clickCount: Number,
    scrollDepth: Number,
    timeOnPage: Number,
    bounceRate: Number,
    conversionEvent: Boolean,
    experimentId: String, // for A/B testing
    variant: String
  },
  
  // Quality and Compliance
  compliance: {
    sensitiveData: Boolean,
    dataClassification: String,
    retentionPeriod: Number, // days
    encryptionLevel: String,
    accessLevel: String,
    auditRequired: Boolean,
    complianceNotes: String
  },
  
  // Synchronization (for offline capabilities)
  sync: {
    status: {
      type: String,
      enum: ['synced', 'pending', 'failed', 'conflict'],
      default: 'synced'
    },
    localTimestamp: Date,
    serverTimestamp: Date,
    syncAttempts: { type: Number, default: 0 },
    lastSyncError: String,
    conflictResolution: String,
    deviceId: String
  },
  
  // Notifications
  notifications: {
    triggered: [{
      type: String,
      recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      method: String, // email, push, whatsapp
      sentAt: Date,
      deliveryStatus: String
    }],
    suppressNotifications: Boolean,
    notificationReason: String
  },
  
  // Metadata
  metadata: {
    version: { type: Number, default: 1 },
    source: String,
    batchId: String,
    correlationId: String,
    parentActivityId: String,
    childActivities: [String],
    tags: [String],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  
  // System Fields
  archived: { type: Boolean, default: false },
  archivedAt: Date,
  deletedAt: Date,
  
  // Privacy and Security
  privacy: {
    piiData: Boolean,
    anonymized: Boolean,
    anonymizedAt: Date,
    consentGiven: Boolean,
    consentType: String,
    dataSubject: String // user who the data belongs to
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate activity ID
agentActivitySchema.pre('save', function(next) {
  if (this.isNew && !this.activityId) {
    const timestamp = Date.now().toString().slice(-8);
    this.activityId = `ACT-${timestamp}`;
  }
  
  // Set end time and calculate duration if not set
  if (!this.timing.endTime) {
    this.timing.endTime = new Date();
  }
  
  if (!this.timing.duration && this.timing.startTime && this.timing.endTime) {
    this.timing.duration = this.timing.endTime - this.timing.startTime;
  }
  
  // Set day of week and hour
  const date = new Date(this.timing.startTime);
  this.timing.dayOfWeek = date.getDay();
  this.timing.hourOfDay = date.getHours();
  
  next();
});

// Virtual for activity age
agentActivitySchema.virtual('activityAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // days
});

// Virtual for duration in minutes
agentActivitySchema.virtual('durationMinutes').get(function() {
  if (this.timing.duration) {
    return Math.floor(this.timing.duration / (1000 * 60));
  }
  return 0;
});

// Virtual for business hours check
agentActivitySchema.virtual('isBusinessHours').get(function() {
  const hour = this.timing.hourOfDay;
  const day = this.timing.dayOfWeek;
  
  // Monday-Friday, 9 AM - 6 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
});

// Static method to get activity summary
agentActivitySchema.statics.getActivitySummary = function(agentId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        agentId: new mongoose.Types.ObjectId(agentId),
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$activity.type',
        count: { $sum: 1 },
        totalDuration: { $sum: '$timing.duration' },
        averageDuration: { $avg: '$timing.duration' },
        successRate: {
          $avg: {
            $cond: [{ $eq: ['$outcome.status', 'success'] }, 1, 0]
          }
        }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Indexes for efficient queries
agentActivitySchema.index({ activityId: 1 });
agentActivitySchema.index({ agentId: 1, createdAt: -1 });
agentActivitySchema.index({ 'activity.type': 1, agentId: 1 });
agentActivitySchema.index({ 'activity.category': 1, agentId: 1 });
agentActivitySchema.index({ 'relatedEntities.leadId': 1 });
agentActivitySchema.index({ 'relatedEntities.buyerId': 1 });
agentActivitySchema.index({ 'relatedEntities.supplierId': 1 });
agentActivitySchema.index({ 'context.source': 1, 'context.platform': 1 });
agentActivitySchema.index({ 'timing.startTime': 1 });
agentActivitySchema.index({ 'timing.dayOfWeek': 1, 'timing.hourOfDay': 1 });
agentActivitySchema.index({ 'outcome.status': 1 });
agentActivitySchema.index({ 'sync.status': 1 });
agentActivitySchema.index({ 'location.coordinates': '2dsphere' });

// TTL index for automatic cleanup (keep activities for 2 years)
agentActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

// Compound indexes for analytics
agentActivitySchema.index({ agentId: 1, 'activity.type': 1, createdAt: -1 });
agentActivitySchema.index({ agentId: 1, 'activity.category': 1, 'timing.startTime': 1 });
agentActivitySchema.index({ 'relatedEntities.leadId': 1, 'activity.type': 1 });

module.exports = mongoose.model('AgentActivity', agentActivitySchema);