const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    required: true,
    enum: [
      // User events
      'user_registration', 'user_login', 'user_logout', 'profile_updated',

      // Product events
      'product_view', 'product_search', 'product_added', 'product_updated',

      // RFQ events
      'rfq_created', 'rfq_viewed', 'rfq_published', 'proposal_submitted',
      'proposal_viewed', 'rfq_awarded', 'rfq_cancelled',

      // Order events
      'order_placed', 'order_confirmed', 'order_shipped', 'order_delivered',
      'order_cancelled', 'payment_completed', 'payment_failed',

      // Communication events
      'message_sent', 'conversation_started', 'review_submitted',

      // System events
      'company_verified', 'document_uploaded', 'search_performed',
      'export_generated', 'report_viewed'
    ]
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },

  sessionId: String,

  metadata: {
    ipAddress: String,
    userAgent: String,
    referer: String,
    page: String,
    action: String,
    browser: String,
    os: String,
    device: String,
    country: String,
    city: String,
    value: mongoose.Schema.Types.Mixed // Flexible data storage
  },

  relatedTo: {
    model: String,
    id: mongoose.Schema.Types.ObjectId
  },

  timestamp: {
    type: Date,
    default: Date.now
  },

  processed: {
    type: Boolean,
    default: false
  },

  source: {
    type: String,
    enum: ['web', 'mobile', 'api', 'system'],
    default: 'web'
  },

  duration: Number, // For events that have duration (page views, etc.)

  conversion: {
    isConversion: Boolean,
    conversionType: String,
    value: Number,
    currency: String
  }
});

// Indexes for efficient querying
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ user: 1, timestamp: -1 });
analyticsEventSchema.index({ company: 1, timestamp: -1 });
analyticsEventSchema.index({ sessionId: 1 });
analyticsEventSchema.index({ processed: 1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
