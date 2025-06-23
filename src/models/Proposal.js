const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  proposalId: {
    type: String,
    unique: true,
    sparse: true
  },
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'in_review', 'accepted', 'rejected', 'negotiating'],
    default: 'pending'
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    quantity: Number,
    price: Number,
    notes: String
  }],
  totalValue: Number,
  currency: {
    type: String,
    default: 'USD'
  },
  incoterms: String,
  portOfLoading: String,
  paymentTerms: String,
  deliveryTime: String,
  validUntil: Date,
  brandingLabel: String,
  documents: {
    proposal: String,
    productImages: [String],
    certificates: [String],
    forecast: String
  },
  notes: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
proposalSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Proposal', proposalSchema);
