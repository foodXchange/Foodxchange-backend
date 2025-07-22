import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  reviewerType: {
    type: String,
    enum: ['buyer', 'supplier'],
    required: true
  },

  rating: {
    overall: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    delivery: {
      type: Number,
      min: 1,
      max: 5
    },
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    value: {
      type: Number,
      min: 1,
      max: 5
    },
    compliance: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  title: {
    type: String,
    maxlength: 100
  },
  comment: {
    type: String,
    maxlength: 1000
  },

  pros: [String],
  cons: [String],

  wouldRecommend: Boolean,
  wouldOrderAgain: Boolean,

  images: [{
    url: String,
    caption: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  response: {
    comment: String,
    respondedAt: Date,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },

  moderation: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged'],
      default: 'pending'
    },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    reason: String
  },

  helpfulVotes: {
    type: Number,
    default: 0
  },

  votedHelpfulBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  isVerified: {
    type: Boolean,
    default: true
  }, // Since it's from actual order

  isVisible: {
    type: Boolean,
    default: true
  },

  tags: [String], // For categorization

  language: {
    type: String,
    default: 'en'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for review age
reviewSchema.virtual('ageInDays').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24));
});

// Indexes
reviewSchema.index({ reviewee: 1, 'moderation.status': 1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ order: 1 });
reviewSchema.index({ 'rating.overall': -1 });

export default mongoose.model('Review', reviewSchema);
