import mongoose from 'mongoose';
const { Decimal128 } = mongoose.Types;

const companySchema = new mongoose.Schema({
  // Dual ID System for flexibility
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  legacyId: { type: String, unique: true, sparse: true }, // Original IDs from CSV
  companyCode: { type: String, unique: true }, // Auto-generated or from data

  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    index: 'text' // For Azure Search integration
  },
  displayName: String, // For UI display
  legalName: String, // Official legal name

  // Company Type & Status
  type: {
    type: String,
    enum: ['supplier', 'buyer', 'both', 'agent', 'contractor'],
    required: true,
    index: true
  },
  isActive: { type: Boolean, default: true, index: true },

  // Contact Information
  contact: {
    email: {
      type: String,
      lowercase: true,
      validate: {
        validator(v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: 'Invalid email format'
      }
    },
    phone: String,
    mobile: String,
    website: {
      type: String,
      validate: {
        validator(v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Website must start with http:// or https://'
      }
    }
  },

  // Address Information
  address: {
    street: String,
    street2: String,
    city: String,
    state: String,
    country: { type: String, index: true },
    postalCode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Warehouse/Shipping Address (for buyers)
  warehouseAddress: {
    contactName: String,
    company: String,
    street: String,
    street2: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    phone: String,
    email: String
  },

  // Business Information
  business: {
    description: { type: String, maxlength: 2000 },
    sector: String, // Business sector
    categories: [String], // Product categories they deal with
    vatNumber: String,
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

  // Supplier-specific information
  supplierInfo: {
    capabilities: {
      minOrderValue: Decimal128,
      maxOrderValue: Decimal128,
      leadTime: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['days', 'weeks'], default: 'days' }
      },
      shippingMethods: [String],
      paymentTerms: [String],
      certifications: [{
        name: String,
        authority: String,
        number: String,
        validFrom: Date,
        validUntil: Date,
        documentUrl: String, // Azure Blob Storage URL
        verified: { type: Boolean, default: false }
      }]
    },
    preferredPorts: [String],
    exportCountries: [String]
  },

  // Buyer-specific information
  buyerInfo: {
    supplierNumbers: [{
      supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      number: String,
      isActive: Boolean
    }],
    paymentTermsPreferred: [String],
    volumeRequirements: String
  },

  // Media & Documents (Azure Blob Storage URLs)
  media: {
    logo: String, // Azure CDN URL
    profileImages: [String],
    documents: [{
      name: String,
      type: { type: String, enum: ['certificate', 'catalog', 'profile', 'contract', 'other'] },
      url: String, // Azure Blob Storage URL
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }]
  },

  // Verification & Compliance
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'suspended'],
      default: 'pending',
      index: true
    },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    documents: [String] // URLs to verification documents
  },

  // Performance Metrics
  metrics: {
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      breakdown: {
        quality: { type: Number, default: 0 },
        delivery: { type: Number, default: 0 },
        communication: { type: Number, default: 0 },
        value: { type: Number, default: 0 }
      }
    },
    orderStats: {
      totalOrders: { type: Number, default: 0 },
      completedOrders: { type: Number, default: 0 },
      cancelledOrders: { type: Number, default: 0 },
      averageOrderValue: Decimal128,
      totalVolume: Decimal128
    },
    responseTime: {
      averageHours: Number,
      lastResponseAt: Date
    }
  },

  // Financial Information
  financial: {
    commissionRates: [{
      buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      rate: Decimal128, // Percentage
      payer: { type: String, enum: ['buyer', 'supplier'] }
    }],
    paymentMethods: [String],
    creditTerms: String,
    creditLimit: Decimal128
  },

  // AI/ML Features (leveraging Azure AI)
  aiData: {
    matchingKeywords: [String], // For AI-powered matching
    productEmbeddings: [Number], // Vector embeddings for similarity
    behaviorScore: Number, // AI-calculated behavior score
    riskScore: Number, // AI-calculated risk assessment
    lastAnalyzed: Date
  },

  // Original Data Preservation
  originalData: {
    buyerCompanyId: String,
    supplierId: String,
    autoNumber: Number,
    source: { type: String, default: 'csv_import' },
    importedAt: { type: Date, default: Date.now },
    rawData: mongoose.Schema.Types.Mixed // Preserve original CSV data
  },

  // Comments & Feedback System
  comments: [{
    type: {
      type: String,
      enum: ['note', 'issue', 'feedback', 'system'],
      default: 'note'
    },
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isInternal: { type: Boolean, default: false }, // Internal vs public comments
    tags: [String],
    attachments: [String], // Azure URLs
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
  }],

  // System Fields
  lastActivityAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      // Convert Decimal128 to numbers for JSON output
      if (ret.supplierInfo?.capabilities?.minOrderValue) {
        ret.supplierInfo.capabilities.minOrderValue = parseFloat(ret.supplierInfo.capabilities.minOrderValue.toString());
      }
      if (ret.supplierInfo?.capabilities?.maxOrderValue) {
        ret.supplierInfo.capabilities.maxOrderValue = parseFloat(ret.supplierInfo.capabilities.maxOrderValue.toString());
      }
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for performance
companySchema.index({ name: 'text', 'business.description': 'text' });
companySchema.index({ type: 1, isActive: 1 });
companySchema.index({ 'address.country': 1 });
companySchema.index({ 'verification.status': 1 });
companySchema.index({ 'business.categories': 1 });
companySchema.index({ legacyId: 1 }, { sparse: true });

// Virtual for full address
companySchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  if (!addr) return '';
  return [addr.street, addr.city, addr.state, addr.country].filter(Boolean).join(', ');
});

// Virtual for completion percentage
companySchema.virtual('profileCompletion').get(function() {
  let score = 0;
  const fields = [
    this.name, this.contact?.email, this.address?.country,
    this.business?.description, this.media?.logo
  ];
  fields.forEach(field => field && score++);
  return Math.round((score / fields.length) * 100);
});

// Pre-save middleware
companySchema.pre('save', function(next) {
  // Generate company code if not exists
  if (this.isNew && !this.companyCode) {
    this.companyCode = `${this.type.toUpperCase()}-${Date.now().toString().slice(-6)}`;
  }

  // Update activity timestamp
  this.lastActivityAt = new Date();

  next();
});

// Post-save middleware for AI processing
companySchema.post('save', async (doc) => {
  // Trigger Azure AI analysis for new companies
  if (doc.isNew) {
    // Queue for AI keyword extraction and embeddings
    // This would integrate with Azure Cognitive Services
    console.log(`Queuing AI analysis for company: ${doc.name}`);
  }
});

export default mongoose.model('Company', companySchema);
