const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  agentNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Personal Information
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
  
  // Professional Information
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
  
  // Expertise and Specialization
  expertise: {
    categories: [{
      type: mongoose.Schema.Types.ObjectId,
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
  
  // Territory Management
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    }],
    exclusivity: {
      type: String,
      enum: ['exclusive', 'shared', 'competitive'],
      default: 'shared'
    }
  },
  
  // Performance Metrics
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
      averageResponseTime: { type: Number, default: 0 }, // in minutes
      conversionRate: { type: Number, default: 0 }, // percentage
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
        averageFirstResponse: Number, // minutes
        averageResolution: Number, // hours
        totalMessages: { type: Number, default: 0 }
      }
    }
  },
  
  // Commission Structure
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
      duration: { type: Number, default: 12 } // months
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
  
  // Banking and Payment Information
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
      type: String, // W9, 1099, etc.
      filePath: String,
      uploadedAt: Date
    }]
  },
  
  // Status and Verification
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'active', 'suspended', 'inactive', 'terminated'],
    default: 'pending'
  },
  
  verification: {
    identity: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      documents: [{
        type: String, // passport, driver_license, etc.
        url: String,
        uploadedAt: Date
      }],
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    business: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      documents: [{
        type: String, // business_license, tax_certificate, etc.
        url: String,
        uploadedAt: Date
      }],
      verifiedAt: Date,
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    background: {
      status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
      checkType: String,
      result: String,
      completedAt: Date
    }
  },
  
  // Communication Preferences
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
  
  // Onboarding Progress
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
  
  // Notes and Internal Information
  internal: {
    notes: [String],
    tags: [String],
    assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low'
    },
    contractDetails: {
      signedAt: Date,
      expiresAt: Date,
      autoRenewal: { type: Boolean, default: false },
      terminationNotice: { type: Number, default: 30 } // days
    }
  },
  
  // Activity Tracking
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

module.exports = mongoose.model('Agent', agentSchema);