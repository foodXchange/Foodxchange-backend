import { Schema, model } from 'mongoose';
import { IExpertReview } from '../interfaces/expert.interface';

const expertReviewSchema = new Schema<IExpertReview>({
  expertId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertProfile',
    required: true,
    index: true
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  collaborationId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertCollaboration',
    required: true,
    index: true
  },
  serviceId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertService'
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    maxlength: 2000
  },
  aspects: {
    expertise: { type: Number, required: true, min: 1, max: 5 },
    communication: { type: Number, required: true, min: 1, max: 5 },
    timeliness: { type: Number, required: true, min: 1, max: 5 },
    value: { type: Number, required: true, min: 1, max: 5 }
  },
  wouldRecommend: {
    type: Boolean,
    required: true
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  },
  response: {
    comment: { type: String, maxlength: 1000 },
    respondedAt: { type: Date }
  },
  helpfulVotes: {
    type: Number,
    default: 0,
    min: 0
  },
  reportCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isVisible: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
expertReviewSchema.index({ rating: -1 });
expertReviewSchema.index({ helpfulVotes: -1 });
expertReviewSchema.index({ createdAt: -1 });
expertReviewSchema.index({ 'aspects.expertise': -1 });
expertReviewSchema.index({ 'aspects.communication': -1 });
expertReviewSchema.index({ 'aspects.timeliness': -1 });
expertReviewSchema.index({ 'aspects.value': -1 });

// Compound index for preventing duplicate reviews
expertReviewSchema.index({ expertId: 1, clientId: 1, collaborationId: 1 }, { unique: true });

// Virtual for overall aspect average
expertReviewSchema.virtual('aspectAverage').get(function() {
  const aspects = this.aspects;
  const sum = aspects.expertise + aspects.communication + aspects.timeliness + aspects.value;
  return sum / 4;
});

// Virtual for helpfulness ratio
expertReviewSchema.virtual('helpfulnessRatio').get(function() {
  // Assuming we track both helpful and total votes elsewhere
  // For now, just return the helpful votes
  return this.helpfulVotes;
});

// Pre-save middleware
expertReviewSchema.pre('save', function(next) {
  // Auto-hide review if reported too many times
  if (this.reportCount >= 5 && this.isVisible) {
    this.isVisible = false;
  }

  // Validate that rating matches aspect average roughly
  const aspectAvg = this.aspectAverage;
  const ratingDiff = Math.abs(this.rating - aspectAvg);
  if (ratingDiff > 2) {
    next(new Error('Overall rating should be consistent with aspect ratings'));
    return;
  }

  next();
});

// Static method to calculate expert's average ratings
expertReviewSchema.statics.calculateExpertAverages = async function(expertId: string) {
  const result = await this.aggregate([
    { $match: { expertId, isVisible: true } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: '$rating' },
        avgExpertise: { $avg: '$aspects.expertise' },
        avgCommunication: { $avg: '$aspects.communication' },
        avgTimeliness: { $avg: '$aspects.timeliness' },
        avgValue: { $avg: '$aspects.value' },
        totalReviews: { $sum: 1 },
        recommendationRate: {
          $avg: { $cond: [{ $eq: ['$wouldRecommend', true] }, 1, 0] }
        }
      }
    }
  ]);

  return result[0] || {
    avgRating: 0,
    avgExpertise: 0,
    avgCommunication: 0,
    avgTimeliness: 0,
    avgValue: 0,
    totalReviews: 0,
    recommendationRate: 0
  };
};

// Method to add expert response
expertReviewSchema.methods.addResponse = async function(comment: string) {
  this.response = {
    comment,
    respondedAt: new Date()
  };
  await this.save();
};

// Method to mark as helpful
expertReviewSchema.methods.markAsHelpful = async function() {
  this.helpfulVotes += 1;
  await this.save();
};

// Method to report review
expertReviewSchema.methods.report = async function() {
  this.reportCount += 1;
  await this.save();
};

export const ExpertReview = model<IExpertReview>('ExpertReview', expertReviewSchema);