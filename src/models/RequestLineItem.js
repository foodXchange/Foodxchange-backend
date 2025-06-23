const mongoose = require('mongoose');

const requestLineItemSchema = new mongoose.Schema({
  request: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: true
  },
  requestProductName: {
    type: String,
    required: true,
    trim: true
  },
  benchmarkImages: [{
    url: String,
    caption: String
  }],
  nutritionalAttributes: String,
  sourcedWeight: String,
  weightUnits: {
    type: String,
    enum: ['kg', 'lbs', 'tons', 'MT', 'units'],
    default: 'kg'
  },
  additionalDetails: String,
  benchmarkCompanyBrand: String,
  benchmarkProductLink: String,
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  autoNumber: String,
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

requestLineItemSchema.index({ request: 1 });
requestLineItemSchema.index({ requestProductName: 'text' });

module.exports = mongoose.model('RequestLineItem', requestLineItemSchema);
