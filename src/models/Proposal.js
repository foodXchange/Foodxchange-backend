
// 💼 ENHANCED PROPOSAL MODEL
// models/Proposal.js

const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  // Reference to project
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true
  },
  
  // Vendor information
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Proposal Details
  proposalId: {
    type: String,
    unique: true,
    index: true,
    default: function() {
      return 'PRP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }
  },
  
  // Pricing
  pricing: {
    unitPrice: { 
      type: Number, 
      required: [true, 'Unit price is required'],
      min: [0, 'Price must be positive']
    },
    totalPrice: { 
      type: Number, 
      required: [true, 'Total price is required'],
      min: [0, 'Price must be positive']
    },
    currency: { 
      type: String, 
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'INR']
    },
    priceBreakdown: {
      product: Number,
      packaging: Number,
      shipping: Number,
      taxes: Number,
      other: Number
    },
    discounts: [{
      type: String,
      percentage: Number,
      amount: Number,
      condition: String
    }],
    priceValidity: {
      type: Date,
      required: [true, 'Price validity date is required']
    },
    paymentTerms: {
      type: String,
      required: [true, 'Payment terms are required']
    }
  },
  
  // Delivery Details
  delivery: {
    leadTime: { 
      type: Number, 
      required: [true, 'Lead time is required'],
      min: [1, 'Lead time must be at least 1 day']
    }, // in days
    shippingMethod: {
      type: String,
      enum: ['sea', 'air', 'land', 'multimodal']
    },
    incoterms: {
      type: String,
      enum: ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DDP', 'DAP']
    },
    deliveryTerms: String,
    trackingAvailable: { type: Boolean, default: false }
  },
  
  // Proposal Content
  coverLetter: {
    type: String,
    required: [true, 'Cover letter is required'],
    minlength: [100, 'Cover letter must be at least 100 characters'],
    maxlength: [2000, 'Cover letter cannot exceed 2000 characters']
  },
  technicalProposal: String,
  uniqueSellingPoints: [String],
  
  // Product Details
  productDetails: {
    origin: {
      country: String,
      region: String
    },
    grade: String,
    certifications: [{
      name: String,
      issuedBy: String,
      validUntil: Date,
      documentUrl: String
    }],
    specifications: mongoose.Schema.Types.Mixed,
    samples: {
      available: { type: Boolean, default: false },
      cost: {
        amount: Number,
        currency: String,
        refundable: Boolean
      },
      deliveryTime: Number, // in days
      description: String
    }
  },
  
  // Company Capabilities
  capabilities: {
    productionCapacity: {
      value: Number,
      unit: String,
      period: String // per month, per year, etc
    },
    currentClients: Number,
    yearsInBusiness: Number,
    previousExperience: String
  },
  
  // Attachments
  attachments: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['catalog', 'certificate', 'sample-images', 'company-profile', 'other']
    },
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under-review', 'clarification-needed', 'revised', 'shortlisted', 'accepted', 'rejected', 'withdrawn'],
    default: 'draft',
    index: true
  },
  
  // Communication
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderType: { type: String, enum: ['buyer', 'vendor'] },
    message: String,
    attachments: [String],
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    readAt: Date
  }],
  clarifications: [{
    question: String,
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    askedAt: { type: Date, default: Date.now },
    answer: String,
    answeredAt: Date
  }],
  
  // Scoring (for buyer evaluation)
  evaluation: {
    scores: {
      price: { type: Number, min: 0, max: 100 },
      quality: { type: Number, min: 0, max: 100 },
      delivery: { type: Number, min: 0, max: 100 },
      vendor: { type: Number, min: 0, max: 100 },
      overall: { type: Number, min: 0, max: 100 }
    },
    notes: String,
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluatedAt: Date
  },
  
  // Negotiation History
  negotiationHistory: [{
    version: Number,
    changes: mongoose.Schema.Types.Mixed,
    changedAt: { type: Date, default: Date.now },
    reason: String
  }],
  
  // Flags
  flags: {
    isWinner: { type: Boolean, default: false },
    isFavorite: { type: Boolean, default: false },
    isViewed: { type: Boolean, default: false },
    viewedAt: Date
  },
  
  // Submission tracking
  submittedAt: Date,
  lastModified: Date,
  expiresAt: Date
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
proposalSchema.index({ project: 1, vendor: 1 }, { unique: true });
proposalSchema.index({ project: 1, status: 1 });
proposalSchema.index({ vendor: 1, status: 1 });
proposalSchema.index({ 'pricing.totalPrice': 1 });
proposalSchema.index({ createdAt: -1 });

// Virtuals
proposalSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiresAt) return null;
  const days = Math.ceil((this.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
  return days;
});

proposalSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

proposalSchema.virtual('responseTime').get(function() {
  if (!this.submittedAt) return null;
  return Math.ceil((this.submittedAt - this.createdAt) / (1000 * 60 * 60)); // in hours
});

// Methods
proposalSchema.methods.canEdit = function(userId) {
  return this.vendor.toString() === userId.toString() && 
         ['draft', 'submitted', 'clarification-needed'].includes(this.status);
};

proposalSchema.methods.markAsViewed = function(userId) {
  if (!this.flags.isViewed) {
    this.flags.isViewed = true;
    this.flags.viewedAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

proposalSchema.methods.addMessage = function(senderId, senderType, message, attachments = []) {
  this.messages.push({
    sender: senderId,
    senderType,
    message,
    attachments
  });
  return this.save();
};

proposalSchema.methods.calculateScore = function() {
  const scores = this.evaluation.scores;
  const weights = {
    price: 0.3,
    quality: 0.3,
    delivery: 0.2,
    vendor: 0.2
  };
  
  scores.overall = Math.round(
    scores.price * weights.price +
    scores.quality * weights.quality +
    scores.delivery * weights.delivery +
    scores.vendor * weights.vendor
  );
  
  return scores.overall;
};

// Static methods
proposalSchema.statics.getTopProposals = function(projectId, limit = 5) {
  return this.find({ 
    project: projectId, 
    status: { $in: ['submitted', 'shortlisted'] }
  })
  .sort('-evaluation.scores.overall -pricing.totalPrice')
  .limit(limit)
  .populate('vendor', 'companyName rating');
};

// Pre-save middleware
proposalSchema.pre('save', function(next) {
  // Set submittedAt when status changes to submitted
  if (this.isModified('status') && this.status === 'submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
    
    // Set expiry based on price validity
    if (this.pricing.priceValidity) {
      this.expiresAt = this.pricing.priceValidity;
    }
  }
  
  // Track modifications
  if (this.isModified() && !this.isNew) {
    this.lastModified = new Date();
  }
  
  // Record negotiation history
  if (this.isModified('pricing') && !this.isNew) {
    this.negotiationHistory.push({
      version: this.negotiationHistory.length + 1,
      changes: this.getChanges(),
      reason: 'Price update'
    });
  }
  
  next();
});

module.exports = mongoose.model('Proposal', proposalSchema);