import { Schema, model } from 'mongoose';
import { IExpertProfile, ExpertStatus, ExpertiseLevel, VerificationStatus } from '../interfaces/expert.interface';

const expertiseSchema = new Schema({
  category: { type: String, required: true },
  subcategories: [{ type: String }],
  level: { 
    type: String, 
    enum: Object.values(ExpertiseLevel),
    required: true 
  },
  yearsOfExperience: { type: Number, required: true, min: 0 },
  certifications: [{ type: String }]
}, { _id: false });

const availabilitySlotSchema = new Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
  endTime: { type: String, required: true, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
  timezone: { type: String, required: true }
}, { _id: false });

const expertProfileSchema = new Schema<IExpertProfile>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true,
    index: true 
  },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    lowercase: true,
    trim: true,
    index: true 
  },
  phone: { type: String, trim: true },
  profilePhoto: { type: String },
  bio: { type: String, required: true, maxlength: 2000 },
  headline: { type: String, required: true, maxlength: 200 },
  status: {
    type: String,
    enum: Object.values(ExpertStatus),
    default: ExpertStatus.PENDING,
    index: true
  },
  verificationStatus: {
    type: String,
    enum: Object.values(VerificationStatus),
    default: VerificationStatus.UNVERIFIED,
    index: true
  },
  verificationDate: { type: Date },
  verificationExpiryDate: { type: Date },
  expertise: {
    type: [expertiseSchema],
    required: true,
    validate: {
      validator: function(v: any[]) {
        return v && v.length > 0;
      },
      message: 'At least one expertise is required'
    }
  },
  languages: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one language is required'
    }
  },
  location: {
    country: { type: String, required: true },
    state: { type: String },
    city: { type: String },
    timezone: { type: String, required: true }
  },
  hourlyRate: {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'USD' }
  },
  availability: [availabilitySlotSchema],
  responseTime: { type: Number, default: 24 }, // in hours
  completedProjects: { type: Number, default: 0, min: 0 },
  totalEarnings: { type: Number, default: 0, min: 0 },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 }
  },
  documents: [{
    type: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false }
  }],
  linkedinUrl: { type: String },
  websiteUrl: { type: String },
  isActive: { type: Boolean, default: true, index: true },
  lastActiveAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for search and filtering
expertProfileSchema.index({ 'expertise.category': 1, 'expertise.subcategories': 1 });
expertProfileSchema.index({ 'location.country': 1, 'location.city': 1 });
expertProfileSchema.index({ 'hourlyRate.min': 1, 'hourlyRate.max': 1 });
expertProfileSchema.index({ 'rating.average': -1 });
expertProfileSchema.index({ completedProjects: -1 });
expertProfileSchema.index({ lastActiveAt: -1 });
expertProfileSchema.index({ 
  firstName: 'text', 
  lastName: 'text', 
  bio: 'text', 
  headline: 'text',
  'expertise.category': 'text',
  'expertise.subcategories': 'text'
});

// Virtual for full name
expertProfileSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for verification validity
expertProfileSchema.virtual('isVerificationValid').get(function() {
  if (this.verificationStatus !== VerificationStatus.VERIFIED) {
    return false;
  }
  if (!this.verificationExpiryDate) {
    return true;
  }
  return this.verificationExpiryDate > new Date();
});

// Pre-save middleware
expertProfileSchema.pre('save', function(next) {
  // Validate hourly rate
  if (this.hourlyRate.max < this.hourlyRate.min) {
    next(new Error('Maximum hourly rate must be greater than or equal to minimum hourly rate'));
    return;
  }

  // Update verification status if expired
  if (this.verificationExpiryDate && this.verificationExpiryDate <= new Date()) {
    this.verificationStatus = VerificationStatus.EXPIRED;
  }

  next();
});

export const ExpertProfile = model<IExpertProfile>('ExpertProfile', expertProfileSchema);