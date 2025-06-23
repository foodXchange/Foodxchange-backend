const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requestName: {
    type: String,
    required: true,
    trim: true
  },
  requestId: {
    type: Number,
    unique: true,
    required: true
  },
  requestStatus: {
    type: String,
    enum: ['Draft', 'Pending', 'In Progress', 'Awaiting Sample', 'Offer Received', 'Finalized', 'Cancelled'],
    default: 'Draft'
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  buyerContact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BuyerContact'
  },
  productCategory: {
    type: String,
    required: true
  },
  requestBrief: {
    type: String,
    maxlength: 2000
  },
  benchmarkImages: [{
    url: String,
    caption: String
  }],
  kosher: {
    required: { type: Boolean, default: false },
    type: String,
    passover: { type: Boolean, default: false }
  },
  packagingPreference: String,
  brandingRequirements: String,
  briefStatus: String,
  projectStatus: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  latestSupplierAdded: Date,
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

// Indexes for performance
requestSchema.index({ buyer: 1, requestStatus: 1 });
requestSchema.index({ productCategory: 1 });
requestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
