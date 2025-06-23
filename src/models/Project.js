// 📋 ENHANCED PROJECT MODEL
// models/Project.js

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Unique project identifier
  projectId: {
    type: String,
    unique: true,
    index: true,
    default: function() {
      return 'PRJ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    }
  },
  
  // Basic Information
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    minlength: [10, 'Title must be at least 10 characters'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    minlength: [50, 'Description must be at least 50 characters'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  
  // Buyer Information
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Product Details
  category: {
    type: String,
    required: true,
    enum: ['grains', 'dairy', 'meat', 'seafood', 'produce', 'processed', 'beverages', 'spices', 'oils', 'other'],
    lowercase: true,
    index: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  
  // Specifications
  specifications: {
    quantity: {
      value: { 
        type: Number, 
        required: [true, 'Quantity is required'],
        min: [0, 'Quantity must be positive']
      },
      unit: { 
        type: String, 
        required: [true, 'Unit is required'],
        enum: ['kg', 'ton', 'lbs', 'units', 'containers', 'pallets', 'liters', 'gallons']
      }
    },
    
    quality: {
      grade: {
        type: String,
        trim: true
      },
      certifications: [{
        type: String,
        enum: ['Organic', 'Fair Trade', 'Halal', 'Kosher', 'Non-GMO', 'ISO', 'HACCP', 'GMP']
      }],
      origin: {
        type: String,
        trim: true
      },
      specifications: String // Additional quality specs
    },
    
    packaging: {
      type: {
        type: String,
        trim: true
      },
      size: String,
      material: String,
      requirements: String
    },
    
    delivery: {
      location: {
        type: String,
        required: [true, 'Delivery location is required'],
        index: true
      },
      address: String,
      coordinates: {
        lat: Number,
        lng: Number
      },
      incoterms: {
        type: String,
        enum: ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DDP', 'DAP']
      },
      preferredDate: Date,
      latestDate: {
        type: Date,
        validate: {
          validator: function(value) {
            return !this.delivery.preferredDate || value >= this.delivery.preferredDate;
          },
          message: 'Latest date must be after preferred date'
        }
      },
      frequency: {
        type: String,
        enum: ['one-time', 'weekly', 'monthly', 'quarterly', 'yearly']
      }
    }
  },
  
  // Budget Information
  budget: {
    min: {
      type: Number,
      min: [0, 'Minimum budget must be positive']
    },
    max: {
      type: Number,
      validate: {
        validator: function(value) {
          return !this.budget.min || value >= this.budget.min;
        },
        message: 'Maximum budget must be greater than minimum'
      }
    },
    currency: { 
      type: String, 
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'INR']
    },
    priceType: {
      type: String,
      enum: ['fixed', 'negotiable', 'market-price'],
      default: 'negotiable'
    }
  },
  
  // Project Status
  status: {
    type: String,
    enum: ['draft', 'active', 'in-review', 'awarded', 'in-progress', 'completed', 'cancelled', 'expired'],
    default: 'draft',
    index: true
  },
  
  // Visibility & Access
  visibility: {
    type: String,
    enum: ['public', 'invite-only', 'private'],
    default: 'public'
  },
  invitedVendors: [{
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    }
  }],
  
  // Proposals
  proposals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  }],
  proposalCount: {
    type: Number,
    default: 0
  },
  
  // Award Information
  awardedTo: {
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    proposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal'
    },
    awardedAt: Date,
    contractValue: Number
  },
  
  // Documents & Attachments
  attachments: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['image', 'pdf', 'doc', 'spreadsheet', 'other']
    },
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Requirements
  requirements: {
    samples: {
      required: { type: Boolean, default: false },
      description: String
    },
    inspection: {
      required: { type: Boolean, default: false },
      type: String
    },
    insurance: {
      required: { type: Boolean, default: false },
      minCoverage: Number
    }
  },
  
  // Timeline
  deadline: {
    type: Date,
    required: [true, 'Project deadline is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Deadline must be in the future'
    },
    index: true
  },
  publishedAt: Date,
  completedAt: Date,
  
  // Tags for search
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  
  // Analytics
  analytics: {
    viewCount: { type: Number, default: 0 },
    uniqueViewers: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    savedBy: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      savedAt: { type: Date, default: Date.now }
    }]
  },
  
  // Flags
  flags: {
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isUrgent: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }
  },
  
  // Audit Trail
  history: [{
    action: String,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    changes: mongoose.Schema.Types.Mixed
  }]
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
projectSchema.index({ buyer: 1, status: 1 });
projectSchema.index({ category: 1, status: 1 });
projectSchema.index({ 'specifications.delivery.location': 1 });
projectSchema.index({ deadline: 1 });
projectSchema.index({ title: 'text', description: 'text', tags: 'text' });
projectSchema.index({ 'budget.max': 1, 'budget.min': 1 });
projectSchema.index({ createdAt: -1 });

// Virtual for days until deadline
projectSchema.virtual('daysUntilDeadline').get(function() {
  if (!this.deadline) return null;
  const days = Math.ceil((this.deadline - new Date()) / (1000 * 60 * 60 * 24));
  return days;
});

// Virtual for is expired
projectSchema.virtual('isExpired').get(function() {
  return this.deadline < new Date() || this.status === 'expired';
});

// Virtual for completion rate
projectSchema.virtual('completionRate').get(function() {
  if (this.status !== 'awarded' && this.status !== 'in-progress') return 0;
  if (this.status === 'completed') return 100;
  
  // Calculate based on timeline
  if (this.awardedTo.awardedAt && this.deadline) {
    const total = this.deadline - this.awardedTo.awardedAt;
    const elapsed = new Date() - this.awardedTo.awardedAt;
    return Math.min(Math.round((elapsed / total) * 100), 99);
  }
  return 0;
});

// Methods
projectSchema.methods.canViewProject = function(userId) {
  // Public projects can be viewed by anyone
  if (this.visibility === 'public') return true;
  
  // Project owner can always view
  if (this.buyer.toString() === userId.toString()) return true;
  
  // Invited vendors can view invite-only projects
  if (this.visibility === 'invite-only') {
    return this.invitedVendors.some(inv => 
      inv.vendor.toString() === userId.toString() && inv.status === 'accepted'
    );
  }
  
  // Check if user has submitted a proposal
  return this.proposals.some(p => p.vendor && p.vendor.toString() === userId.toString());
};

projectSchema.methods.canSubmitProposal = function(userId, userType) {
  // Only vendors can submit proposals
  if (userType !== 'vendor') return false;
  
  // Can't submit to own project
  if (this.buyer.toString() === userId.toString()) return false;
  
  // Project must be active
  if (this.status !== 'active') return false;
  
  // Deadline must not have passed
  if (this.deadline < new Date()) return false;
  
  // Check visibility rules
  if (this.visibility === 'invite-only') {
    const invitation = this.invitedVendors.find(inv => 
      inv.vendor.toString() === userId.toString()
    );
    return invitation && invitation.status === 'accepted';
  }
  
  return true;
};

projectSchema.methods.recordView = function(userId) {
  this.analytics.viewCount += 1;
  if (userId && !this.analytics.uniqueViewers.includes(userId)) {
    this.analytics.uniqueViewers.push(userId);
  }
  return this.save();
};

projectSchema.methods.addToHistory = function(action, userId, changes = {}) {
  this.history.push({
    action,
    changedBy: userId,
    changes
  });
};

// Static methods
projectSchema.statics.getActiveProjects = function(filters = {}) {
  const query = { 
    status: 'active',
    deadline: { $gt: new Date() },
    'flags.isActive': true,
    ...filters
  };
  return this.find(query);
};

projectSchema.statics.expireOldProjects = async function() {
  const expired = await this.updateMany(
    {
      status: 'active',
      deadline: { $lt: new Date() }
    },
    {
      status: 'expired',
      $push: {
        history: {
          action: 'auto_expired',
          changedAt: new Date(),
          changes: { status: 'expired' }
        }
      }
    }
  );
  return expired;
};

// Pre-save middleware
projectSchema.pre('save', function(next) {
  // Set publishedAt when status changes to active
  if (this.isModified('status') && this.status === 'active' && !this.publishedAt) {
    this.publishedAt = new Date();
    this.addToHistory('published', this.buyer);
  }
  
  // Set completedAt when status changes to completed
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Auto-expire if deadline passed
  if (this.deadline < new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  
  next();
});

module.exports = mongoose.model('Project', projectSchema);