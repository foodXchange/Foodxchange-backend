const mongoose = require('mongoose');

const rfqSchema = mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  referenceNumber: {
    type: String,
    unique: true
  },
  category: {
    type: String,
    required: true
  },
  products: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    specifications: String,
    quantity: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      required: true
    },
    packaging: String,
    targetPrice: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  }],
  requirements: {
    certifications: [String],
    qualityStandards: [String],
    packagingRequirements: String,
    labelingRequirements: String,
    deliveryTerms: String,
    paymentTerms: String,
    specialInstructions: String
  },
  delivery: {
    location: {
      city: String,
      country: {
        type: String,
        required: true
      }
    },
    date: {
      type: Date,
      required: true
    },
    incoterms: String
  },
  budget: {
    min: Number,
    max: Number,
    currency: {
      type: String,
      default: 'USD'
    }
  },
  validity: {
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  targetSuppliers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  }],
  visibility: {
    type: String,
    enum: ['public', 'invited', 'private'],
    default: 'public'
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'awarded', 'cancelled'],
    default: 'active'
  },
  proposals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  }],
  selectedProposal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  },
  attachments: [{
    name: String,
    url: String,
    type: String
  }]
}, {
  timestamps: true
});

// Auto-generate reference number
rfqSchema.pre('save', async function(next) {
  if (!this.referenceNumber) {
    const count = await this.constructor.countDocuments();
    this.referenceNumber = `RFQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Indexes
rfqSchema.index({ buyer: 1, status: 1 });
rfqSchema.index({ category: 1, status: 1 });
rfqSchema.index({ 'validity.endDate': 1 });

const RFQ = mongoose.model('RFQ', rfqSchema);

module.exports = RFQ;
