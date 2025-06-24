const mongoose = require('mongoose');

const proposalSchema = mongoose.Schema({
  rfq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referenceNumber: {
    type: String,
    unique: true
  },
  products: [{
    rfqProductIndex: Number,
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    alternativeProduct: {
      name: String,
      description: String
    },
    quantity: Number,
    unit: String,
    unitPrice: {
      type: Number,
      required: true
    },
    totalPrice: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    notes: String
  }],
  pricing: {
    subtotal: Number,
    taxes: Number,
    shipping: Number,
    otherCharges: [{
      description: String,
      amount: Number
    }],
    total: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  terms: {
    paymentTerms: String,
    deliveryTerms: String,
    validityPeriod: Number,
    leadTime: Number,
    warranty: String
  },
  attachments: [{
    name: String,
    url: String,
    type: String
  }],
  notes: String,
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn'],
    default: 'draft'
  },
  submittedAt: Date,
  reviewedAt: Date,
  reviewNotes: String
}, {
  timestamps: true
});

// Auto-generate reference number
proposalSchema.pre('save', async function(next) {
  if (!this.referenceNumber) {
    const count = await this.constructor.countDocuments();
    this.referenceNumber = `PROP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Calculate total before saving
proposalSchema.pre('save', function(next) {
  if (this.products && this.products.length > 0) {
    const subtotal = this.products.reduce((sum, item) => {
      item.totalPrice = item.quantity * item.unitPrice;
      return sum + item.totalPrice;
    }, 0);
    
    this.pricing.subtotal = subtotal;
    
    const otherChargesTotal = this.pricing.otherCharges?.reduce((sum, charge) => sum + charge.amount, 0) || 0;
    
    this.pricing.total = subtotal + 
                        (this.pricing.taxes || 0) + 
                        (this.pricing.shipping || 0) + 
                        otherChargesTotal;
  }
  next();
});

// Indexes
proposalSchema.index({ rfq: 1, supplier: 1 });
proposalSchema.index({ status: 1 });

const Proposal = mongoose.model('Proposal', proposalSchema);

module.exports = Proposal;
