const mongoose = require('mongoose');

const proposalSchema = new mongoose.Schema({
  proposalId: {
    type: String,
    unique: true,
    required: true
  },
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Under Review', 'Accepted', 'Rejected', 'Negotiating'],
    default: 'Draft'
  },
  products: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    proposedPrice: Number,
    quantity: Number,
    notes: String
  }],
  logistics: {
    incoterms: String,
    portOfLoading: String,
    paymentTerms: String,
    leadTime: Number, // in days
    deliveryDate: Date
  },
  documents: {
    proposalDoc: String,
    productImages: [String],
    supplierLogo: String,
    supplierProfileImages: [String],
    forecastFiles: [String]
  },
  brandingLabel: String,
  sellerVatNumber: String,
  autoNumber: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  openComments: {
    type: Number,
    default: 0
  }
});

proposalSchema.index({ request: 1, supplier: 1 });
proposalSchema.index({ buyer: 1, status: 1 });

module.exports = mongoose.model('Proposal', proposalSchema);
