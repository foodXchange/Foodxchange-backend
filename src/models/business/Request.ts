import mongoose from 'mongoose';
const { Decimal128 } = mongoose.Types;

const requestSchema = new mongoose.Schema({
  // Dual ID System
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  legacyId: { type: String, unique: true, sparse: true },
  requestNumber: { type: String, unique: true },

  // Basic Information
  title: {
    type: String,
    required: true,
    maxlength: 200,
    index: 'text'
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000,
    index: 'text'
  },
  brief: String,

  // Buyer Information
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  buyerContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Product Requirements
  requirements: {
    category: String,
    productFamily: String,
    quantity: {
      amount: { type: Number, required: true },
      unit: { type: String, required: true }
    },
    targetPrice: {
      amount: Decimal128,
      currency: { type: String, default: 'USD' }
    },
    budgetRange: {
      min: Decimal128,
      max: Decimal128,
      currency: { type: String, default: 'USD' }
    },

    // Delivery Requirements
    delivery: {
      location: {
        address: String,
        city: String,
        country: String,
        port: String
      },
      requestedDate: Date,
      flexibleDates: Boolean,
      urgency: { type: String, enum: ['low', 'medium', 'high', 'urgent'] }
    },

    // Packaging & Branding
    packaging: {
      preference: String,
      customRequirements: String,
      brandingRequirements: String,
      privateLabelRequired: Boolean
    },

    // Quality & Compliance
    quality: {
      certifications: [String],
      qualityStandards: [String],
      inspectionRequired: Boolean,
      samplesRequired: Boolean
    },

    // Payment & Terms
    terms: {
      paymentTerms: { type: String, enum: ['NET15', 'NET30', 'NET60', 'COD', 'LC'] },
      incoterms: String,
      contractDuration: String,
      volumeCommitment: String
    }
  },

  // Compliance Requirements
  compliance: {
    kosher: {
      required: Boolean,
      type: String,
      passoverRequired: Boolean,
      authority: String
    },
    halal: {
      required: Boolean,
      authority: String
    },
    organic: {
      required: Boolean,
      certification: String
    },
    regulatory: {
      countries: [String],
      requirements: [String],
      documentation: [String]
    }
  },

  // Request Line Items (Detailed Product Specs)
  lineItems: [{
    itemNumber: Number,
    productName: String,
    description: String,
    specifications: [{
      attribute: String,
      value: String,
      importance: { type: String, enum: ['required', 'preferred', 'optional'] }
    }],
    quantity: {
      amount: Number,
      unit: String
    },
    benchmarkProduct: {
      name: String,
      brand: String,
      supplier: String,
      image: String, // Azure URL
      link: String,
      price: Decimal128
    },
    nutritionalRequirements: String,
    additionalDetails: String
  }],

  // Status & Workflow
  status: {
    stage: {
      type: String,
      enum: ['draft', 'review', 'published', 'closed', 'awarded', 'cancelled'],
      default: 'draft',
      index: true
    },
    briefStatus: String,
    projectStatus: String,
    deadline: Date,
    publishedAt: Date,
    closedAt: Date
  },

  // Visibility & Access
  visibility: {
    type: { type: String, enum: ['public', 'private', 'invited'], default: 'public' },
    invitedSuppliers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    restrictedCountries: [String]
  },

  // Evaluation Criteria
  evaluation: {
    criteria: [{
      name: String,
      weight: Number, // percentage
      type: { type: String, enum: ['price', 'quality', 'delivery', 'experience', 'compliance'] },
      description: String
    }],
    method: { type: String, enum: ['weighted_score', 'ranking', 'pass_fail'] }
  },

  // Media & Documentation
  media: {
    images: [String], // Azure URLs
    documents: [{
      name: String,
      type: String,
      url: String, // Azure URL
      uploadedAt: Date
    }],
    benchmarkImages: [String]
  },

  // AI Features
  aiData: {
    suggestedSuppliers: [{
      supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      matchScore: Number,
      reasons: [String]
    }],
    categoryPredictions: [String],
    priceEstimates: {
      low: Decimal128,
      high: Decimal128,
      average: Decimal128
    },
    keywords: [String],
    lastAnalyzed: Date
  },

  // Analytics
  analytics: {
    views: { type: Number, default: 0 },
    proposalCount: { type: Number, default: 0 },
    supplierInterest: { type: Number, default: 0 },
    conversionRate: Number
  },

  // Communications
  communications: [{
    type: { type: String, enum: ['question', 'clarification', 'amendment', 'announcement'] },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    subject: String,
    message: String,
    attachments: [String],
    isPublic: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],

  // Related Records
  linkedRecords: {
    sourcing: [String],
    proposals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' }],
    samples: [String],
    adaptations: [String],
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }]
  },

  // Comments & Feedback
  comments: [{
    type: { type: String, enum: ['note', 'feedback', 'issue', 'system'] },
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isInternal: Boolean,
    tags: [String],
    createdAt: { type: Date, default: Date.now }
  }],

  // Original Data
  originalData: {
    requestId: Number,
    source: String,
    importedAt: Date,
    rawData: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
requestSchema.index({ buyer: 1, 'status.stage': 1 });
requestSchema.index({ 'status.deadline': 1 });
requestSchema.index({ 'requirements.category': 1 });
requestSchema.index({ title: 'text', description: 'text' });

// Pre-save middleware
requestSchema.pre('save', function(next) {
  if (this.isNew && !this.requestNumber) {
    this.requestNumber = `RFQ-${Date.now().toString().slice(-8)}`;
  }
  next();
});

export default mongoose.model('Request', requestSchema);
