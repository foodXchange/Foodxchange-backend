import { Schema, model } from 'mongoose';
import { IExpertService } from '../interfaces/expert.interface';

const expertServiceSchema = new Schema<IExpertService>({
  expertId: {
    type: Schema.Types.ObjectId,
    ref: 'ExpertProfile',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  subcategory: {
    type: String,
    required: true,
    index: true
  },
  deliverables: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one deliverable is required'
    }
  },
  duration: {
    min: { type: Number, required: true, min: 1 },
    max: { type: Number, required: true, min: 1 },
    unit: {
      type: String,
      enum: ['hours', 'days', 'weeks', 'months'],
      required: true
    }
  },
  pricing: {
    type: {
      type: String,
      enum: ['fixed', 'hourly', 'custom'],
      required: true
    },
    fixedPrice: {
      type: Number,
      min: 0,
      required: function() { 
        return this.pricing.type === 'fixed'; 
      }
    },
    hourlyRate: {
      type: Number,
      min: 0,
      required: function() { 
        return this.pricing.type === 'hourly'; 
      }
    },
    currency: {
      type: String,
      default: 'USD',
      required: true
    }
  },
  tags: {
    type: [String],
    index: true
  },
  requirements: [String],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  bookingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for search and filtering
expertServiceSchema.index({ title: 'text', description: 'text', tags: 'text' });
expertServiceSchema.index({ 'pricing.fixedPrice': 1 });
expertServiceSchema.index({ 'pricing.hourlyRate': 1 });
expertServiceSchema.index({ 'rating.average': -1 });
expertServiceSchema.index({ viewCount: -1 });
expertServiceSchema.index({ bookingCount: -1 });
expertServiceSchema.index({ createdAt: -1 });

// Virtual for popularity score
expertServiceSchema.virtual('popularityScore').get(function() {
  const viewWeight = 0.3;
  const bookingWeight = 0.5;
  const ratingWeight = 0.2;
  
  const normalizedViews = Math.min(this.viewCount / 1000, 1);
  const normalizedBookings = Math.min(this.bookingCount / 100, 1);
  const normalizedRating = this.rating.average / 5;
  
  return (normalizedViews * viewWeight) + 
         (normalizedBookings * bookingWeight) + 
         (normalizedRating * ratingWeight);
});

// Pre-save middleware
expertServiceSchema.pre('save', function(next) {
  // Validate duration
  if (this.duration.max < this.duration.min) {
    next(new Error('Maximum duration must be greater than or equal to minimum duration'));
    return;
  }

  // Validate pricing
  if (this.pricing.type === 'fixed' && !this.pricing.fixedPrice) {
    next(new Error('Fixed price is required for fixed pricing type'));
    return;
  }

  if (this.pricing.type === 'hourly' && !this.pricing.hourlyRate) {
    next(new Error('Hourly rate is required for hourly pricing type'));
    return;
  }

  next();
});

// Method to increment view count
expertServiceSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save();
};

// Method to update rating
expertServiceSchema.methods.updateRating = async function(newRating: number) {
  const currentTotal = this.rating.average * this.rating.count;
  this.rating.count += 1;
  this.rating.average = (currentTotal + newRating) / this.rating.count;
  await this.save();
};

export const ExpertService = model<IExpertService>('ExpertService', expertServiceSchema);