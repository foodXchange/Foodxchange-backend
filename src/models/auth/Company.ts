/**
 * Company Model
 * Represents company entities in the authentication context
 */

import { Schema, model, Document } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  businessType: 'manufacturer' | 'distributor' | 'wholesaler' | 'retailer' | 'restaurant' | 'other';
  registrationNumber?: string;
  vatNumber?: string;
  website?: string;
  description?: string;
  logo?: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  contact: {
    phone: string;
    email: string;
    contactPerson: string;
  };
  establishedYear?: number;
  employeeCount?: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  annualRevenue?: string;
  certifications: Array<{
    name: string;
    issuingBody: string;
    certificateNumber: string;
    issueDate: Date;
    expiryDate: Date;
    documentUrl?: string;
    status: 'active' | 'expired' | 'pending';
  }>;
  licenses: Array<{
    type: string;
    number: string;
    issuingAuthority: string;
    issueDate: Date;
    expiryDate: Date;
    documentUrl?: string;
  }>;
  insurances: Array<{
    type: string;
    provider: string;
    policyNumber: string;
    coverageAmount: number;
    currency: string;
    validFrom: Date;
    validUntil: Date;
    documentUrl?: string;
  }>;
  verified: boolean;
  verificationDate?: Date;
  verifiedBy?: Schema.Types.ObjectId;
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  rating: {
    average: number;
    count: number;
    distribution: {
      1: number;
      2: number;
      3: number;
      4: number;
      5: number;
    };
  };
  tenantId?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  businessType: {
    type: String,
    required: true,
    enum: ['manufacturer', 'distributor', 'wholesaler', 'retailer', 'restaurant', 'other']
  },
  registrationNumber: {
    type: String,
    sparse: true,
    trim: true
  },
  vatNumber: {
    type: String,
    sparse: true,
    trim: true
  },
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Website must be a valid URL'
    }
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  logo: {
    type: String,
    trim: true
  },
  address: {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 }
    }
  },
  contact: {
    phone: { type: String, required: true, trim: true },
    email: { 
      type: String, 
      required: true, 
      trim: true, 
      lowercase: true,
      validate: {
        validator: function(v: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format'
      }
    },
    contactPerson: { type: String, required: true, trim: true }
  },
  establishedYear: {
    type: Number,
    min: 1800,
    max: new Date().getFullYear()
  },
  employeeCount: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '500+']
  },
  annualRevenue: {
    type: String,
    trim: true
  },
  certifications: [{
    name: { type: String, required: true, trim: true },
    issuingBody: { type: String, required: true, trim: true },
    certificateNumber: { type: String, required: true, trim: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    documentUrl: String,
    status: {
      type: String,
      enum: ['active', 'expired', 'pending'],
      default: 'pending'
    }
  }],
  licenses: [{
    type: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    issuingAuthority: { type: String, required: true, trim: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    documentUrl: String
  }],
  insurances: [{
    type: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    coverageAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, length: 3 },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    documentUrl: String
  }],
  verified: {
    type: Boolean,
    default: false
  },
  verificationDate: Date,
  verifiedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending'
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 },
    distribution: {
      1: { type: Number, default: 0, min: 0 },
      2: { type: Number, default: 0, min: 0 },
      3: { type: Number, default: 0, min: 0 },
      4: { type: Number, default: 0, min: 0 },
      5: { type: Number, default: 0, min: 0 }
    }
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
companySchema.index({ name: 'text', description: 'text' });
companySchema.index({ businessType: 1 });
companySchema.index({ 'address.country': 1 });
companySchema.index({ 'address.city': 1 });
companySchema.index({ verified: 1, status: 1 });
companySchema.index({ tenantId: 1 });
companySchema.index({ 'rating.average': -1 });

// Virtual fields
companySchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}${addr.state ? ', ' + addr.state : ''}, ${addr.postalCode}, ${addr.country}`;
});

// Methods
companySchema.methods.updateRating = function(newRating: number) {
  const rating = this.rating;
  const oldAverage = rating.average;
  const oldCount = rating.count;
  
  // Update distribution
  rating.distribution[newRating as keyof typeof rating.distribution]++;
  
  // Update count and average
  rating.count = oldCount + 1;
  rating.average = ((oldAverage * oldCount) + newRating) / rating.count;
  
  return this.save();
};

companySchema.methods.isVerified = function() {
  return this.verified && this.status === 'active';
};

// Static methods
companySchema.statics.findByBusinessType = function(businessType: string) {
  return this.find({ businessType, status: 'active' });
};

companySchema.statics.findVerified = function() {
  return this.find({ verified: true, status: 'active' });
};

export const Company = model<ICompany>('Company', companySchema);