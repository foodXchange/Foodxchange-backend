const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requestId: {
    type: Number,
    unique: true,
    sparse: true
  },
  requestName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'awaiting', 'finalized', 'cancelled'],
    default: 'draft'
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  category: {
    type: String,
    required: true
  },
  brief: {
    type: String
  },
  lineItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RequestLineItem'
  }],
  kosher: {
    type: Boolean,
    default: false
  },
  kosherType: String,
  passoverKosher: {
    type: Boolean,
    default: false
  },
  packaging: String,
  brandingRequirements: String,
  assignedTo: String,
  proposals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal'
  }],
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
requestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Request', requestSchema);
