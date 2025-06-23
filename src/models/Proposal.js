const mongoose = require('mongoose');

const proposalItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: String,
  quantity: Number,
  unit: String,
  unitPrice: {
    type: Number,
    required: true
  },
  totalPrice: Number,
  packaging: String,
  deliveryTerms: String,
  notes: String
});

const proposalSchema = new mongoose.Schema({
  proposalNumber: {
    type: String,
    unique: true
  },
  rfq: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RFQ',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplierCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  items: [proposalItemSchema],
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  validUntil: {
    type: Date,
    required: true
  },
  deliveryDate: Date,
  paymentTerms: String,
  shippingTerms: String,
  additionalTerms: String,
  attachments: [{
    name: String,
    url: String,
    type: String
  }],
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'expired'],
    default: 'draft'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate proposal number
proposalSchema.pre('save', async function(next) {
  if (!this.proposalNumber) {
    const count = await this.constructor.countDocuments();
    this.proposalNumber = `PROP-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

const Proposal = mongoose.model('Proposal', proposalSchema);
module.exports = Proposal;
