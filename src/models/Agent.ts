import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAgent extends Document {
  userId: Types.ObjectId;
  agentNumber: string;
  
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    whatsapp?: string;
    dateOfBirth?: Date;
    address?: {
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
    avatar?: string;
    bio?: string;
    languages?: string[];
  };
  
  professionalInfo?: {
    companyName?: string;
    businessRegistration?: string;
    taxId?: string;
    businessAddress?: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    };
    yearsOfExperience?: number;
    previousRoles?: string[];
    linkedinProfile?: string;
    website?: string;
  };
  
  expertise?: {
    categories?: Types.ObjectId[];
    specializations?: string[];
    skills?: string[];
    certifications?: Array<{
      name: string;
      issuer: string;
      number: string;
      issueDate: Date;
      expiryDate: Date;
      documentUrl: string;
      verified: boolean;
    }>;
    industryExperience?: Array<{
      industry: string;
      years: number;
      description: string;
    }>;
  };
  
  territory?: {
    type: 'geographic' | 'category' | 'hybrid';
    geographic?: {
      regions?: string[];
      cities?: string[];
      states?: string[];
      countries?: string[];
      radius?: {
        distance: number;
        unit: 'km' | 'miles';
        center: {
          lat: number;
          lng: number;
        };
      };
    };
    categories?: Types.ObjectId[];
    exclusivity: 'exclusive' | 'shared' | 'competitive';
  };
  
  performance: {
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    rating: {
      average: number;
      count: number;
    };
    stats: {
      totalLeads: number;
      acceptedLeads: number;
      closedDeals: number;
      totalRevenue: number;
      averageResponseTime: number;
      conversionRate: number;
      customerSatisfaction: number;
    };
    metrics?: {
      lastLoginAt?: Date;
      totalLogins: number;
      activeHours?: {
        [key: string]: string[];
      };
      responseMetrics?: {
        averageFirstResponse?: number;
        averageResolution?: number;
        totalMessages: number;
      };
    };
  };
  
  commission: {
    structure: 'percentage' | 'fixed' | 'hybrid';
    baseRate: {
      percentage: number;
      fixedAmount: number;
    };
    tierBonuses: {
      silver: number;
      gold: number;
      platinum: number;
    };
    specialBonuses: {
      newSupplier: number;
      newBuyer: number;
      firstDeal: number;
      monthlyTarget: number;
    };
    recurringCommission: {
      enabled: boolean;
      rate: number;
      duration: number;
    };
    paymentTerms: {
      frequency: 'weekly' | 'bi-weekly' | 'monthly';
      minimumPayout: number;
      method: 'bank_transfer' | 'check' | 'paypal' | 'stripe';
    };
  };
  
  banking?: {
    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    routingNumber?: string;
    iban?: string;
    swiftCode?: string;
    paypalEmail?: string;
    stripeAccountId?: string;
    taxForms?: Array<{
      type: string;
      filePath: string;
      uploadedAt: Date;
    }>;
  };
  
  status: 'pending' | 'under_review' | 'approved' | 'active' | 'suspended' | 'inactive' | 'terminated';
  
  verification: {
    identity: {
      status: 'pending' | 'verified' | 'rejected';
      documents?: Array<{
        type: string;
        url: string;
        uploadedAt: Date;
      }>;
      verifiedAt?: Date;
      verifiedBy?: Types.ObjectId;
    };
    business: {
      status: 'pending' | 'verified' | 'rejected';
      documents?: Array<{
        type: string;
        url: string;
        uploadedAt: Date;
      }>;
      verifiedAt?: Date;
      verifiedBy?: Types.ObjectId;
    };
    background: {
      status: 'pending' | 'verified' | 'rejected';
      checkType?: string;
      result?: string;
      completedAt?: Date;
    };
  };
  
  communication: {
    preferredMethod: 'whatsapp' | 'email' | 'phone' | 'app';
    notifications: {
      newLeads: boolean;
      leadUpdates: boolean;
      commissionUpdates: boolean;
      systemAnnouncements: boolean;
      marketingEmails: boolean;
    };
    contactHours: {
      start: string;
      end: string;
      timezone: string;
    };
  };
  
  onboarding: {
    step: 'personal_info' | 'professional_info' | 'expertise' | 'territory' | 'verification' | 'banking' | 'training' | 'completed';
    completedSteps: string[];
    startedAt: Date;
    completedAt?: Date;
    trainingCompleted: boolean;
    agreementSigned: boolean;
    agreementSignedAt?: Date;
  };
  
  internal?: {
    notes?: string[];
    tags?: string[];
    assignedManager?: Types.ObjectId;
    riskLevel: 'low' | 'medium' | 'high';
    contractDetails?: {
      signedAt?: Date;
      expiresAt?: Date;
      autoRenewal: boolean;
      terminationNotice: number;
    };
  };
  
  lastActivity: Date;
  isActive: boolean;
  terminatedAt?: Date;
  terminationReason?: string;
  
  // Virtual properties
  fullName?: string;
  tierMultiplier?: number;
  acceptanceRate?: number;
  conversionRate?: number;
  
  createdAt: Date;
  updatedAt: Date;
}

const agentSchema = new Schema<IAgent>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  agentNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  personalInfo: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    whatsapp: String,
    dateOfBirth: Date,
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
    avatar: String,
    bio: String,
    languages: [String]
  },
  
  professionalInfo: {
    companyName: String,
    businessRegistration: String,
    taxId: String,
    businessAddress: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    },
    yearsOfExperience: Number,
    previousRoles: [String],
    linkedinProfile: String,
    website: String
  },
  
  expertise: {
    categories: [{
      type: Schema.Types.ObjectId,
      ref: 'Category'
    }],
    specializations: [{
      type: String,
      enum: ['produce', 'dairy', 'meat', 'seafood', 'packaged-goods', 'beverages', 'organic', 'kosher', 'halal', 'gluten-free']
    }],
    skills: [String],
    certifications: [{
      name: String,
      issuer: String,
      number: String,
      issueDate: Date,
      expiryDate: Date,
      documentUrl: String,
      verified: { type: Boolean, default: false }
    }],
    industryExperience: [{
      industry: String,
      years: Number,
      description: String
    }]
  },
  
  territory: {
    type: {
      type: String,
      enum: ['geographic', 'category', 'hybrid'],
      default: 'geographic'
    },
    geographic: {
      regions: [String],
      cities: [String],
      states: [String],
      countries: [String],
      radius: {
        distance: Number,
        unit: { type: String, enum: ['km', 'miles'], default: 'km' },
        center: {
          lat: Number,
          lng: Number
        }
      }
    },
    categories: [{
      type: Schema.Types.ObjectId,
      ref: 'Category'
    }],
    exclusivity: {
      type: String,
      enum: ['exclusive', 'shared', 'competitive'],
      default: 'shared'
    }
  },
  
  performance: {
    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      default: 'bronze'
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 }
    },
    stats: {
      totalLeads: { type: Number, default: 0 },
      acceptedLeads: { type: Number, default: 0 },
      closedDeals: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      customerSatisfaction: { type: Number, default: 0 }
    },
    metrics: {
      lastLoginAt: Date,
      totalLogins: { type: Number, default: 0 },
      activeHours: {
        monday: [String],
        tuesday: [String],
        wednesday: [String],
        thursday: [String],
        friday: [String],
        saturday: [String],
        sunday: [String]
      },
      responseMetrics: {
        averageFirstResponse: Number,
        averageResolution: Number,
        totalMessages: { type: Number, default: 0 }
      }
    }
  },
  
  commission: {
    structure: {
      type: String,
      enum: ['percentage', 'fixed', 'hybrid'],
      default: 'percentage'
    },
    baseRate: {
      percentage: { type: Number, default: 1.5, min: 0, max: 10 },
      fixedAmount: { type: Number, default: 0 }
    },
    tierBonuses: {
      silver: { type: Number, default: 0.2 },
      gold: { type: Number, default: 0.5 },
      platinum: { type: Number, default: 1.0 }
    },
    specialBonuses: {
      newSupplier: { type: Number, default: 500 },
      newBuyer: { type: Number, default: 300 },
      firstDeal: { type: Number, default: 100 },
      monthlyTarget: { type: Number, default: 1000 }
    },
    recurringCommission: {
      enabled: { type: Boolean, default: true },
      rate: { type: Number, default: 0.5 },
      duration: { type: Number, default: 12 }
    },
    paymentTerms: {
      frequency: {
        type: String,
        enum: ['weekly', 'bi-weekly', 'monthly'],
        default: 'monthly'
      },
      minimumPayout: { type: Number, default: 50 },
      method: {
        type: String,
        enum: ['bank_transfer', 'check', 'paypal', 'stripe'],
        default: 'bank_transfer'
      }
    }
  },
  
  banking: {
    accountName: String,
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    iban: String,
    swiftCode: String,
    paypalEmail: String,
    stripeAccountId: String,
    taxForms: [{
      type: String,
      filePath: String,
      uploadedAt: Date
    }]
  },
  
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'active', 'suspended', 'inactive', 'terminated'],
    default: 'pending'
  },
  
  verification: {
    identity: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      documents: [{
        type: String,
        url: String,
        uploadedAt: Date
      }],
      verifiedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    business: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      documents: [{
        type: String,
        url: String,
        uploadedAt: Date
      }],
      verifiedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    background: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      checkType: String,
      result: String,
      completedAt: Date
    }
  },
  
  communication: {
    preferredMethod: {
      type: String,
      enum: ['whatsapp', 'email', 'phone', 'app'],
      default: 'whatsapp'
    },
    notifications: {
      newLeads: { type: Boolean, default: true },
      leadUpdates: { type: Boolean, default: true },
      commissionUpdates: { type: Boolean, default: true },
      systemAnnouncements: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false }
    },
    contactHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '17:00' },
      timezone: { type: String, default: 'UTC' }
    }
  },
  
  onboarding: {
    step: {
      type: String,
      enum: ['personal_info', 'professional_info', 'expertise', 'territory', 'verification', 'banking', 'training', 'completed'],
      default: 'personal_info'
    },
    completedSteps: [String],
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    trainingCompleted: { type: Boolean, default: false },
    agreementSigned: { type: Boolean, default: false },
    agreementSignedAt: Date
  },
  
  internal: {
    notes: [String],
    tags: [String],
    assignedManager: { type: Schema.Types.ObjectId, ref: 'User' },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    contractDetails: {
      signedAt: Date,
      expiresAt: Date,
      autoRenewal: { type: Boolean, default: false },
      terminationNotice: { type: Number, default: 30 }
    }
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  isActive: { type: Boolean, default: true },
  terminatedAt: Date,
  terminationReason: String
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate agent number
agentSchema.pre('save', function(next) {
  if (this.isNew && !this.agentNumber) {
    const timestamp = Date.now().toString().slice(-6);
    this.agentNumber = `AG-${timestamp}`;
  }
  next();
});

// Virtual for full name
agentSchema.virtual('fullName').get(function() {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`.trim();
});

// Virtual for commission tier multiplier
agentSchema.virtual('tierMultiplier').get(function() {
  const multipliers = {
    bronze: 1.0,
    silver: 1.2,
    gold: 1.5,
    platinum: 2.0
  };
  return multipliers[this.performance.tier] || 1.0;
});

// Virtual for acceptance rate
agentSchema.virtual('acceptanceRate').get(function() {
  if (this.performance.stats.totalLeads === 0) return 0;
  return (this.performance.stats.acceptedLeads / this.performance.stats.totalLeads) * 100;
});

// Virtual for conversion rate
agentSchema.virtual('conversionRate').get(function() {
  if (this.performance.stats.acceptedLeads === 0) return 0;
  return (this.performance.stats.closedDeals / this.performance.stats.acceptedLeads) * 100;
});

// Indexes for efficient queries
agentSchema.index({ userId: 1 });
agentSchema.index({ agentNumber: 1 });
agentSchema.index({ 'personalInfo.email': 1 });
agentSchema.index({ status: 1 });
agentSchema.index({ 'performance.tier': 1 });
agentSchema.index({ 'territory.geographic.regions': 1 });
agentSchema.index({ 'territory.categories': 1 });
agentSchema.index({ 'expertise.specializations': 1 });
agentSchema.index({ 'verification.identity.status': 1, 'verification.business.status': 1 });
agentSchema.index({ lastActivity: 1 });

// Text search index
agentSchema.index({
  'personalInfo.firstName': 'text',
  'personalInfo.lastName': 'text',
  'personalInfo.email': 'text',
  'expertise.skills': 'text'
});

export const Agent = mongoose.model<IAgent>('Agent', agentSchema);