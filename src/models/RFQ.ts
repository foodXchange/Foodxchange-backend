const mongoose = require('mongoose');

const rfqSchema = new mongoose.Schema({
  rfqNumber: {
    type: String,
    unique: true,
    required: true
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
    maxlength: 2000
  },
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category', 
    required: true 
  },
  
  requirements: {
    quantity: { 
      type: Number, 
      required: true,
      min: 1
    },
    unit: { 
      type: String, 
      required: true,
      enum: ['kg', 'lbs', 'tons', 'cases', 'pallets', 'pieces', 'liters', 'gallons']
    },
    targetPrice: {
      amount: Number,
      currency: { type: String, default: 'USD' }
    },
    budgetRange: {
      min: Number,
      max: Number,
      currency: { type: String, default: 'USD' }
    },
    deliveryLocation: {
      address: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    deliveryDate: {
      type: Date,
      required: true
    },
    paymentTerms: {
      type: String,
      enum: ['NET15', 'NET30', 'NET60', 'COD', 'Prepaid', 'LC', 'Custom'],
      default: 'NET30'
    },
    customPaymentTerms: String,
    qualityStandards: [String],
    certifications: [{
      name: String,
      required: Boolean
    }],
    packaging: {
      type: String,
      requirements: String
    },
    shippingMethod: {
      type: String,
      enum: ['Ground', 'Air', 'Sea', 'Express', 'Custom']
    }
  },
  
  specifications: [{
    attribute: String,
    value: String,
    importance: { 
      type: String, 
      enum: ['required', 'preferred', 'optional'],
      default: 'optional'
    },
    notes: String
  }],
  
  attachments: [{
    name: String,
    url: String,
    type: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  status: {
    type: String,
    enum: ['draft', 'published', 'closed', 'awarded', 'cancelled', 'expired'],
    default: 'draft'
  },
  
  visibility: {
    type: String,
    enum: ['public', 'private', 'invited'],
    default: 'public'
  },
  
  invitedSuppliers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company' 
  }],
  
  publishedAt: Date,
  deadlineDate: { 
    type: Date, 
    required: true 
  },
  
  proposals: [{
    proposalId: { type: String, required: true },
    supplier: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Company',
      required: true
    },
    supplierContact: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    submittedAt: { 
      type: Date, 
      default: Date.now 
    },
    
    pricing: {
      unitPrice: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
      currency: { type: String, default: 'USD' },
      validUntil: Date,
      priceBreaks: [{
        minQuantity: Number,
        unitPrice: Number
      }],
      additionalCosts: {
        shipping: Number,
        taxes: Number,
        handling: Number,
        other: [{
          description: String,
          amount: Number
        }]
      }
    },
    
    delivery: {
      leadTime: { type: Number, required: true },
      leadTimeUnit: { 
        type: String, 
        enum: ['days', 'weeks', 'months'],
        default: 'days'
      },
      location: String,
      terms: String,
      trackingProvided: Boolean
    },
    
    specifications: [{
      attribute: String,
      value: String,
      compliance: Boolean,
      certificationUrl: String
    }],
    
    documents: [{
      name: String,
      url: String,
      type: { 
        type: String,
        enum: ['certificate', 'spec_sheet', 'sample_image', 'company_profile', 'other']
      },
      uploadedAt: { type: Date, default: Date.now }
    }],
    
    samples: {
      available: Boolean,
      cost: Number,
      deliveryTime: String,
      requirements: String
    },
    
    notes: String,
    coverLetter: String,
    
    status: {
      type: String,
      enum: ['submitted', 'under_review', 'shortlisted', 'rejected', 'awarded', 'withdrawn'],
      default: 'submitted'
    },
    
    evaluation: {
      scores: [{
        criteria: String,
        score: Number,
        maxScore: Number,
        notes: String
      }],
      totalScore: Number,
      ranking: Number,
      evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      evaluatedAt: Date
    }
  }],
  
  evaluation: {
    criteria: [{
      name: String,
      weight: Number, // percentage (0-100)
      type: { 
        type: String, 
        enum: ['price', 'quality', 'delivery', 'experience', 'compliance', 'custom']
      },
      description: String
    }],
    method: {
      type: String,
      enum: ['weighted_score', 'ranking', 'pass_fail'],
      default: 'weighted_score'
    }
  },
  
  communication: [{
    type: { 
      type: String,
      enum: ['question', 'clarification', 'amendment', 'announcement']
    },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // empty means public
    subject: String,
    message: String,
    attachments: [String],
    timestamp: { type: Date, default: Date.now },
    isPublic: Boolean
  }],
  
  analytics: {
    views: { type: Number, default: 0 },
    proposals: { type: Number, default: 0 },
    questions: { type: Number, default: 0 },
    viewHistory: [{
      viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      viewedAt: { type: Date, default: Date.now },
      duration: Number // seconds
    }]
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to generate RFQ number
rfqSchema.pre('save', function(next) {
  if (this.isNew && !this.rfqNumber) {
    const timestamp = Date.now().toString().slice(-6);
    this.rfqNumber = `RFQ-${timestamp}`;
  }
  next();
});

// Virtual for time remaining
rfqSchema.virtual('timeRemaining').get(function() {
  if (this.deadlineDate) {
    const now = new Date();
    const deadline = new Date(this.deadlineDate);
    const diff = deadline - now;
    return diff > 0 ? diff : 0;
  }
  return 0;
});

// Indexes for efficient queries
rfqSchema.index({ buyer: 1, status: 1 });
rfqSchema.index({ category: 1, status: 1 });
rfqSchema.index({ 'requirements.deliveryDate': 1 });
rfqSchema.index({ deadlineDate: 1 });
rfqSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('RFQ', rfqSchema);
