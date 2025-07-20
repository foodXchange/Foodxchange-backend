const mongoose = require('mongoose');

const agentCommunicationSchema = new mongoose.Schema({
  communicationId: {
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

  // Communication Type
  type: {
    type: String,
    enum: ['whatsapp', 'email', 'sms', 'push_notification', 'in_app', 'phone_call', 'video_call'],
    required: true
  },

  // Message Direction
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    required: true
  },

  // Participants
  participants: {
    sender: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      name: String,
      email: String,
      phone: String,
      whatsappNumber: String,
      role: { type: String, enum: ['agent', 'buyer', 'supplier', 'admin', 'system'] }
    },

    recipients: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      name: String,
      email: String,
      phone: String,
      whatsappNumber: String,
      role: { type: String, enum: ['agent', 'buyer', 'supplier', 'admin', 'system'] },
      deliveryStatus: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending'
      },
      deliveredAt: Date,
      readAt: Date,
      failureReason: String
    }]
  },

  // Message Content
  content: {
    // Text content
    text: String,
    subject: String,

    // Rich content
    html: String,
    markdown: String,

    // Media attachments
    attachments: [{
      type: {
        type: String,
        enum: ['image', 'document', 'video', 'audio', 'location', 'contact', 'product']
      },
      url: String,
      filename: String,
      size: Number,
      mimeType: String,
      caption: String,
      thumbnail: String,
      duration: Number, // for audio/video
      coordinates: { // for location
        lat: Number,
        lng: Number
      }
    }],

    // Interactive elements
    interactive: {
      type: {
        type: String,
        enum: ['button', 'list', 'quick_reply', 'carousel', 'form']
      },
      buttons: [{
        id: String,
        text: String,
        action: String,
        url: String
      }],
      listItems: [{
        id: String,
        title: String,
        description: String,
        action: String
      }],
      quickReplies: [String],
      formFields: [{
        name: String,
        label: String,
        type: String,
        required: Boolean,
        options: [String]
      }]
    },

    // Templates
    template: {
      type: String,
      templateName: String,
      templateId: String,
      parameters: mongoose.Schema.Types.Mixed,
      language: String,
      category: String
    }
  },

  // Related Context
  context: {
    // Related entities
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentLead' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rfqId: { type: mongoose.Schema.Types.ObjectId, ref: 'RFQ' },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },

    // Thread information
    threadId: String,
    conversationId: String,
    parentMessageId: String,
    isReply: { type: Boolean, default: false },

    // Business context
    businessContext: {
      type: String,
      enum: ['lead_followup', 'proposal_discussion', 'order_update', 'payment_reminder',
        'support_request', 'onboarding', 'training', 'general_inquiry'],
      default: 'general_inquiry'
    },

    // Urgency and priority
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },

    // Tags for categorization
    tags: [String],

    // Customer journey stage
    journeyStage: {
      type: String,
      enum: ['awareness', 'consideration', 'decision', 'purchase', 'retention', 'advocacy']
    }
  },

  // Channel-Specific Data
  channelData: {
    // WhatsApp specific
    whatsapp: {
      messageId: String,
      businessAccountId: String,
      phoneNumberId: String,
      contactId: String,
      conversationId: String,
      messageType: String,
      contextInfo: mongoose.Schema.Types.Mixed,
      forwardedInfo: mongoose.Schema.Types.Mixed,
      quotedMessage: mongoose.Schema.Types.Mixed,
      reactionInfo: mongoose.Schema.Types.Mixed
    },

    // Email specific
    email: {
      messageId: String,
      threadId: String,
      subject: String,
      fromAddress: String,
      toAddresses: [String],
      ccAddresses: [String],
      bccAddresses: [String],
      replyToAddress: String,
      headers: mongoose.Schema.Types.Mixed,
      isHtml: Boolean,
      textVersion: String,
      htmlVersion: String,
      bounceInfo: mongoose.Schema.Types.Mixed,
      spamScore: Number
    },

    // SMS specific
    sms: {
      messageId: String,
      fromNumber: String,
      toNumber: String,
      segments: Number,
      encoding: String,
      deliveryReportUrl: String,
      shortCode: String,
      keyword: String
    },

    // Push notification specific
    push: {
      notificationId: String,
      deviceToken: String,
      platform: String, // ios, android, web
      title: String,
      body: String,
      icon: String,
      image: String,
      clickAction: String,
      badge: Number,
      sound: String,
      category: String,
      collapseKey: String,
      priority: String,
      timeToLive: Number
    },

    // Voice call specific
    voice: {
      callId: String,
      callDirection: String,
      callDuration: Number,
      callStatus: String,
      callQuality: String,
      recordingUrl: String,
      transcription: String,
      callCost: Number,
      dialedNumber: String,
      callerNumber: String,
      callStartTime: Date,
      callEndTime: Date,
      hangupReason: String
    }
  },

  // Delivery and Status
  delivery: {
    status: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'delivered', 'read', 'failed', 'expired'],
      default: 'pending'
    },

    // Timestamps
    queuedAt: Date,
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failedAt: Date,
    expiredAt: Date,

    // Delivery attempts
    attempts: [{
      attemptNumber: Number,
      attemptedAt: Date,
      status: String,
      errorCode: String,
      errorMessage: String,
      retryAfter: Date
    }],

    // Delivery metrics
    metrics: {
      processingTime: Number, // milliseconds
      deliveryTime: Number, // milliseconds
      totalTime: Number, // milliseconds
      retryCount: Number,
      finalAttempt: Boolean
    },

    // Failure information
    failure: {
      errorCode: String,
      errorMessage: String,
      errorType: String,
      category: String,
      retryable: Boolean,
      permanentFailure: Boolean,
      providerError: String
    }
  },

  // Automation and AI
  automation: {
    // Automated message flag
    isAutomated: { type: Boolean, default: false },

    // Automation triggers
    trigger: {
      type: String,
      enum: ['scheduled', 'event_based', 'rule_based', 'ai_suggested', 'user_initiated'],
      eventType: String,
      ruleName: String,
      scheduleId: String,
      aiModelVersion: String
    },

    // AI processing
    ai: {
      processed: { type: Boolean, default: false },
      sentiment: {
        score: Number, // -1 to 1
        label: String, // positive, negative, neutral
        confidence: Number
      },
      intent: {
        detected: String,
        confidence: Number,
        entities: [mongoose.Schema.Types.Mixed]
      },
      languageDetection: {
        language: String,
        confidence: Number
      },
      urgencyClassification: {
        level: String,
        confidence: Number
      },
      responseGenerated: {
        suggested: Boolean,
        suggestedResponse: String,
        confidence: Number,
        usedSuggestion: Boolean
      }
    },

    // Workflow integration
    workflow: {
      workflowId: String,
      stepId: String,
      actionId: String,
      workflowStatus: String,
      nextStep: String,
      completedActions: [String],
      pendingActions: [String]
    }
  },

  // Analytics and Insights
  analytics: {
    // Engagement metrics
    engagement: {
      opened: Boolean,
      clicked: Boolean,
      replied: Boolean,
      forwarded: Boolean,
      openedAt: Date,
      clickedAt: Date,
      repliedAt: Date,
      forwardedAt: Date,
      clickedLinks: [String],
      timeSpentReading: Number // seconds
    },

    // Performance metrics
    performance: {
      responseTime: Number, // minutes from previous message
      resolutionTime: Number, // minutes to resolve issue
      customerSatisfaction: Number, // 1-5 scale
      conversionValue: Number, // business value generated
      leadProgression: Boolean,
      dealClosure: Boolean
    },

    // Campaign tracking
    campaign: {
      campaignId: String,
      campaignName: String,
      campaignType: String,
      segmentId: String,
      segmentName: String,
      abTestVariant: String,
      personalizedContent: Boolean
    },

    // Attribution
    attribution: {
      source: String,
      medium: String,
      campaign: String,
      content: String,
      term: String,
      referrer: String,
      landingPage: String,
      userAgent: String,
      ipAddress: String,
      geolocation: {
        country: String,
        city: String,
        region: String,
        coordinates: {
          lat: Number,
          lng: Number
        }
      }
    }
  },

  // Compliance and Privacy
  compliance: {
    // Consent management
    consent: {
      given: Boolean,
      consentType: String,
      consentDate: Date,
      consentVersion: String,
      consentSource: String,
      optOut: Boolean,
      optOutDate: Date,
      privacyPolicyVersion: String
    },

    // Data retention
    retention: {
      retentionPeriod: Number, // days
      retentionReason: String,
      deleteAfter: Date,
      archived: Boolean,
      archivedAt: Date,
      purgeEligible: Boolean
    },

    // Security
    security: {
      encrypted: Boolean,
      encryptionMethod: String,
      encryptionKey: String,
      hashValue: String,
      digitalSignature: String,
      certificateThumbprint: String
    },

    // Compliance flags
    flags: {
      sensitiveData: Boolean,
      personalData: Boolean,
      financialData: Boolean,
      healthData: Boolean,
      childData: Boolean,
      requiresApproval: Boolean,
      auditRequired: Boolean,
      restrictedContent: Boolean
    }
  },

  // System metadata
  metadata: {
    version: { type: Number, default: 1 },
    source: String,
    platform: String,
    clientVersion: String,
    serverVersion: String,
    apiVersion: String,
    requestId: String,
    sessionId: String,
    traceId: String,

    // Processing information
    processing: {
      processingNode: String,
      processingTime: Number,
      retryCount: Number,
      lastRetryAt: Date,
      processingErrors: [String],
      processingWarnings: [String]
    },

    // Integration metadata
    integration: {
      providerId: String,
      providerName: String,
      providerVersion: String,
      providerMessageId: String,
      providerStatus: String,
      providerResponse: mongoose.Schema.Types.Mixed,
      webhookId: String,
      callbackUrl: String
    }
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  scheduledFor: Date,
  expiresAt: Date,

  // System fields
  archived: { type: Boolean, default: false },
  archivedAt: Date,
  deletedAt: Date,

  // Cost tracking
  cost: {
    amount: Number,
    currency: String,
    provider: String,
    rateType: String,
    billingUnit: String,
    billingQuantity: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate communication ID
agentCommunicationSchema.pre('save', function(next) {
  if (this.isNew && !this.communicationId) {
    const timestamp = Date.now().toString().slice(-6);
    this.communicationId = `MSG-${timestamp}`;
  }
  next();
});

// Virtual for response time
agentCommunicationSchema.virtual('responseTime').get(function() {
  if (this.direction === 'outbound' && this.context.parentMessageId) {
    // Calculate response time based on parent message
    // This would need to be calculated when the parent message is available
    return this.analytics.performance.responseTime;
  }
  return null;
});

// Virtual for message age
agentCommunicationSchema.virtual('messageAge').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // days
});

// Virtual for delivery success rate
agentCommunicationSchema.virtual('deliverySuccessRate').get(function() {
  const totalRecipients = this.participants.recipients.length;
  if (totalRecipients === 0) return 0;

  const successfulDeliveries = this.participants.recipients.filter(
    recipient => recipient.deliveryStatus === 'delivered' || recipient.deliveryStatus === 'read'
  ).length;

  return (successfulDeliveries / totalRecipients) * 100;
});

// Static method to get communication summary
agentCommunicationSchema.statics.getCommunicationSummary = function(agentId, startDate, endDate) {
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
        _id: '$type',
        count: { $sum: 1 },
        successful: {
          $sum: {
            $cond: [
              { $eq: ['$delivery.status', 'delivered'] },
              1,
              0
            ]
          }
        },
        failed: {
          $sum: {
            $cond: [
              { $eq: ['$delivery.status', 'failed'] },
              1,
              0
            ]
          }
        },
        averageResponseTime: { $avg: '$analytics.performance.responseTime' },
        totalCost: { $sum: '$cost.amount' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Static method to get conversation thread
agentCommunicationSchema.statics.getConversationThread = function(threadId) {
  return this.find({ 'context.threadId': threadId })
    .sort({ createdAt: 1 })
    .populate('participants.sender.userId', 'profile.firstName profile.lastName email')
    .populate('participants.recipients.userId', 'profile.firstName profile.lastName email');
};

// Indexes for efficient queries
agentCommunicationSchema.index({ communicationId: 1 });
agentCommunicationSchema.index({ agentId: 1, createdAt: -1 });
agentCommunicationSchema.index({ type: 1, direction: 1 });
agentCommunicationSchema.index({ 'delivery.status': 1 });
agentCommunicationSchema.index({ 'context.threadId': 1 });
agentCommunicationSchema.index({ 'context.conversationId': 1 });
agentCommunicationSchema.index({ 'context.leadId': 1 });
agentCommunicationSchema.index({ 'context.orderId': 1 });
agentCommunicationSchema.index({ 'context.businessContext': 1 });
agentCommunicationSchema.index({ 'participants.sender.userId': 1 });
agentCommunicationSchema.index({ 'participants.recipients.userId': 1 });
agentCommunicationSchema.index({ 'channelData.whatsapp.messageId': 1 });
agentCommunicationSchema.index({ 'channelData.email.messageId': 1 });
agentCommunicationSchema.index({ 'channelData.sms.messageId': 1 });
agentCommunicationSchema.index({ scheduledFor: 1 });
agentCommunicationSchema.index({ expiresAt: 1 });

// TTL index for automatic cleanup (keep communications for 5 years)
agentCommunicationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 157680000 });

// Compound indexes for analytics
agentCommunicationSchema.index({ agentId: 1, type: 1, createdAt: -1 });
agentCommunicationSchema.index({ agentId: 1, 'context.businessContext': 1, 'delivery.status': 1 });
agentCommunicationSchema.index({ 'context.leadId': 1, direction: 1, createdAt: 1 });

// Text search index
agentCommunicationSchema.index({
  'content.text': 'text',
  'content.subject': 'text',
  'participants.sender.name': 'text',
  'participants.recipients.name': 'text'
});

module.exports = mongoose.model('AgentCommunication', agentCommunicationSchema);
