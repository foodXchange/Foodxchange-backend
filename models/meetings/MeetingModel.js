const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['host', 'attendee', 'optional'] },
    status: { 
      type: String, 
      enum: ['invited', 'accepted', 'declined', 'tentative', 'attended'],
      default: 'invited'
    }
  }],
  type: {
    type: String,
    enum: ['discovery', 'negotiation', 'compliance', 'follow_up', 'contract'],
    required: true
  },
  title: { type: String, required: true },
  description: String,
  scheduledAt: { type: Date, required: true },
  duration: { type: Number, default: 30 }, // minutes
  platform: {
    type: String,
    enum: ['foodxchange', 'zoom', 'teams', 'phone', 'in_person'],
    default: 'foodxchange'
  },
  meetingUrl: String,
  agenda: [{
    topic: String,
    duration: Number,
    presenter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  relatedRFQ: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ'
  },
  notes: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  recordings: [{
    url: String,
    duration: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  actionItems: [{
    description: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dueDate: Date,
    completed: { type: Boolean, default: false }
  }],
  outcome: {
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    nextSteps: String,
    dealProgress: {
      type: String,
      enum: ['no_progress', 'interest_shown', 'negotiating', 'deal_closed', 'deal_lost']
    }
  },
  reminders: [{
    time: Date,
    sent: { type: Boolean, default: false }
  }],
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled'
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for efficient querying
meetingSchema.index({ scheduledAt: 1 });
meetingSchema.index({ organizer: 1, scheduledAt: -1 });
meetingSchema.index({ 'participants.user': 1, scheduledAt: -1 });

module.exports = mongoose.model('Meeting', meetingSchema);
