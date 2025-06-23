// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  type: {
    type: String,
    required: true,
    enum: [
      'project_invitation',
      'proposal_received',
      'proposal_accepted',
      'proposal_rejected',
      'project_awarded',
      'project_cancelled',
      'message_received',
      'project_expiring',
      'payment_received',
      'review_received'
    ]
  },
  
  title: {
    type: String,
    required: true
  },
  
  message: {
    type: String,
    required: true
  },
  
  data: {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    additionalInfo: mongoose.Schema.Types.Mixed
  },
  
  status: {
    type: String,
    enum: ['unread', 'read', 'archived'],
    default: 'unread'
  },
  
  readAt: Date,
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  emailSent: {
    type: Boolean,
    default: false
  },
  
  pushSent: {
    type: Boolean,
    default: false
  }
  
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, status: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1 });

// Statics
notificationSchema.statics.notify = async function(recipient, type, title, message, data = {}) {
  const notification = await this.create({
    recipient,
    type,
    title,
    message,
    data
  });
  
  // TODO: Send email/push notification here
  // Example: await emailService.sendNotification(notification);
  
  return notification;
};

notificationSchema.statics.notifyMultiple = async function(recipients, type, title, message, data = {}) {
  const notifications = recipients.map(recipient => ({
    recipient,
    type,
    title,
    message,
    data
  }));
  
  return this.insertMany(notifications);
};

notificationSchema.statics.getUnreadCount = async function(userId) {
  return this.countDocuments({ recipient: userId, status: 'unread' });
};

// Methods
notificationSchema.methods.markAsRead = function() {
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);