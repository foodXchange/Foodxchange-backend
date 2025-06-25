const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  type: {
    type: String,
    required: true,
    enum: [
      // RFQ notifications
      'rfq_response_received', 'rfq_deadline_approaching', 'rfq_awarded',
      
      // Order notifications
      'order_confirmed', 'order_shipped', 'order_delivered', 'order_cancelled',
      'payment_due', 'payment_received', 'payment_overdue',
      
      // Communication notifications
      'message_received', 'review_received', 'review_response',
      
      // System notifications
      'company_verified', 'company_rejected', 'document_expiring',
      'account_suspended', 'password_changed', 'login_alert',
      
      // Marketing notifications
      'system_announcement', 'feature_update', 'promotion',
      'newsletter', 'event_invitation'
    ]
  },
  
  title: { 
    type: String, 
    required: true,
    maxlength: 200
  },
  
  message: { 
    type: String, 
    required: true,
    maxlength: 1000
  },
  
  relatedTo: {
    model: String,
    id: mongoose.Schema.Types.ObjectId
  },
  
  actionUrl: String,
  
  actionButton: {
    text: String,
    url: String,
    style: {
      type: String,
      enum: ['primary', 'secondary', 'success', 'warning', 'danger'],
      default: 'primary'
    }
  },
  
  channels: {
    email: { 
      type: Boolean, 
      default: true 
    },
    sms: { 
      type: Boolean, 
      default: false 
    },
    push: { 
      type: Boolean, 
      default: true 
    },
    inApp: { 
      type: Boolean, 
      default: true 
    }
  },
  
  delivery: {
    email: {
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      opened: Boolean,
      openedAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      bounced: Boolean,
      error: String
    },
    sms: {
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      error: String
    },
    push: {
      sent: Boolean,
      sentAt: Date,
      delivered: Boolean,
      deliveredAt: Date,
      clicked: Boolean,
      clickedAt: Date,
      error: String
    },
    inApp: {
      displayed: Boolean,
      displayedAt: Date,
      read: Boolean,
      readAt: Date,
      dismissed: Boolean,
      dismissedAt: Date
    }
  },
  
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  scheduledFor: Date, // For scheduled notifications
  
  template: {
    name: String,
    version: String,
    variables: mongoose.Schema.Types.Mixed
  },
  
  batchId: String, // For bulk notifications
  
  metadata: {
    campaign: String,
    source: String,
    tags: [String],
    customData: mongoose.Schema.Types.Mixed
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for notification age
notificationSchema.virtual('ageInHours').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60));
});

// Indexes
notificationSchema.index({ recipient: 1, status: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ scheduledFor: 1, status: 1 });
notificationSchema.index({ priority: 1, status: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
