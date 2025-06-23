const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  proposalId: {
    type: String,
    unique: true,
    required: true
  },
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
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'selected', 'rejected'],
    default: 'draft'
  },
  pricing: {
    unitPrice: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    priceValidUntil: Date,
    minimumOrderQuantity: Number,
    volumeDiscounts: [{
      quantity: Number,
      discountPercentage: Number
    }]
  },
  terms: {
    paymentTerms: String,
    leadTimeDays: Number,
    incoterm: String,
    shippingMethod: String
  },
  productDetails: {
    productName: String,
    specifications: String,
    packaging: String,
    certifications: {
      kosher: { type: Boolean, default: false },
      organic: { type: Boolean, default: false },
      vegan: { type: Boolean, default: false },
      halal: { type: Boolean, default: false },
      certificates: [{
        name: String,
        fileUrl: String,
        expiryDate: Date
      }]
    }
  },
  documents: [{
    name: String,
    type: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  sampleInfo: {
    available: { type: Boolean, default: false },
    sent: { type: Boolean, default: false },
    sentDate: Date,
    trackingNumber: String
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

// Auto-generate Proposal ID
proposalSchema.pre('save', async function(next) {
  if (this.isNew && !this.proposalId) {
    const count = await this.constructor.countDocuments();
    this.proposalId = `PROP-${String(count + 1).padStart(5, '0')}`;
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Proposal', proposalSchema);
