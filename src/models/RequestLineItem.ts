const mongoose = require('mongoose');

const requestLineItemSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  benchmarkImages: String,
  nutritionalAttributes: String,
  weight: String,
  weightUnit: String,
  additionalDetails: String,
  benchmarkCompany: String,
  benchmarkLink: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('RequestLineItem', requestLineItemSchema);
