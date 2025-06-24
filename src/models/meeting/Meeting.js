const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['invited', 'confirmed', 'declined', 'attended'],
      default: 'invited'
    },
    joinedAt: Date,
    leftAt: Date
  }],
  type: {
    type: String,
    enum: ['discovery', 'negotiation', 'compliance', 'sampling', 'follow_up'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  scheduledAt: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 30
  },
  platform: {
    type: String,
    enum: ['foodxchange', 'zoom', 'teams', 'google_meet'],
    default: 'foodxchange'
  },
  meetingUrl: String,
  roomId: String, // for internal video calls
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  agenda: [{
    item: String,
    duration: Number,
    completed: Boolean
  }],
  recording: {
    url: String,
    duration: Number,
    size: Number
  },
  notes: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  actionItems: [{
    description: String,
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    dueDate: Date,
    completed: {
      type: Boolean,
      default: false
    }
  }],
  outcome: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    dealClosed: Boolean,
    followUpRequired: Boolean,
    nextMeetingDate: Date
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  cancelledReason: String,
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'sms', 'push']
    },
    sentAt: Date,
    status: String
  }]
}, {
  timestamps: true
});

// Indexes for performance
meetingSchema.index({ organizer: 1, scheduledAt: -1 });
meetingSchema.index({ 'participants.user': 1, status: 1 });
meetingSchema.index({ scheduledAt: 1, status: 1 });

// Virtual for meeting link
meetingSchema.virtual('joinLink').get(function() {
  if (this.platform === 'foodxchange') {
    return `${process.env.APP_URL}/meetings/${this._id}/join`;
  }
  return this.meetingUrl;
});

module.exports = mongoose.model('Meeting', meetingSchema);
