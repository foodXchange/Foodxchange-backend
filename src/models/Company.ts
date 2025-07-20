import mongoose, { Document, Schema } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  description?: string;
  type: 'manufacturer' | 'distributor' | 'retailer' | 'supplier' | 'service_provider';
  industry: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  contact: {
    email?: string;
    phone?: string;
    website?: string;
  };

  // Multi-tenant subscription fields
  domain?: string;
  subscriptionTier: 'basic' | 'standard' | 'premium' | 'enterprise';
  features: string[];
  limits: {
    maxUsers: number;
    maxProducts: number;
    maxOrders: number;
    apiCallsPerMinute: number;
  };

  // Subscription management
  subscriptionId?: string;
  subscriptionStatus: 'active' | 'inactive' | 'suspended' | 'cancelled';
  subscriptionStartDate?: Date;
  subscriptionEndDate?: Date;
  billingCycle: 'monthly' | 'yearly';

  // Tenant settings
  tenantSettings: {
    customBranding?: boolean;
    customDomain?: string;
    ssoEnabled?: boolean;
    apiAccessEnabled?: boolean;
    webhookEndpoints?: string[];
  };

  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  type: {
    type: String,
    enum: ['manufacturer', 'distributor', 'retailer', 'supplier', 'service_provider'],
    required: true
  },
  industry: {
    type: String,
    enum: ['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods', 'organic', 'kosher', 'halal'],
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  contact: {
    email: String,
    phone: String,
    website: String
  },
  certifications: [{
    name: String,
    authority: String,
    number: String,
    validFrom: Date,
    validUntil: Date,
    document: String, // URL to certificate
    verified: { type: Boolean, default: false }
  }],
  businessInfo: {
    registrationNumber: String,
    taxId: String,
    yearEstablished: Number,
    employeeCount: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+']
    },
    annualRevenue: {
      type: String,
      enum: ['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+']
    }
  },
  capabilities: {
    minOrderValue: Number,
    maxOrderValue: Number,
    shippingMethods: [String],
    paymentTerms: [String],
    leadTime: {
      min: Number,
      max: Number,
      unit: { type: String, enum: ['days', 'weeks'], default: 'days' }
    }
  },
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    notes: String
  },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true },

  // Multi-tenant subscription fields
  domain: String,
  subscriptionTier: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'enterprise'],
    default: 'basic'
  },
  features: [{
    type: String,
    default: []
  }],
  limits: {
    maxUsers: { type: Number, default: 10 },
    maxProducts: { type: Number, default: 100 },
    maxOrders: { type: Number, default: 50 },
    apiCallsPerMinute: { type: Number, default: 100 }
  },

  // Subscription management
  subscriptionId: String,
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'cancelled'],
    default: 'active'
  },
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },

  // Tenant settings
  tenantSettings: {
    customBranding: { type: Boolean, default: false },
    customDomain: String,
    ssoEnabled: { type: Boolean, default: false },
    apiAccessEnabled: { type: Boolean, default: false },
    webhookEndpoints: [String]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for geospatial queries
companySchema.index({ 'address.coordinates': '2dsphere' });

// Index for multi-tenant queries
companySchema.index({ domain: 1 });
companySchema.index({ subscriptionTier: 1 });
companySchema.index({ subscriptionStatus: 1 });

export const Company = mongoose.model<ICompany>('Company', companySchema);
export default Company;
