const mongoose = require('mongoose');

const sampleRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  requestDetails: {
    quantity: { type: Number, default: 1 },
    purpose: {
      type: String,
      enum: ['quality_check', 'client_testing', 'certification', 'new_product_evaluation']
    },
    specialRequirements: String,
    neededBy: Date
  },
  cost: {
    type: { type: String, enum: ['free', 'paid'], default: 'free' },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'waived'],
      default: 'pending'
    }
  },
  shipping: {
    method: { type: String, enum: ['standard', 'express', 'courier'] },
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date,
    shippingCost: Number,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'preparing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  timeline: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    packaging: { type: Number, min: 1, max: 5 },
    matchToSpec: { type: Number, min: 1, max: 5 },
    comments: String,
    wouldOrder: Boolean,
    submittedAt: Date
  },
  internalNotes: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// Sample policy model for managing sample rules
const samplePolicySchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  freeSamples: {
    enabled: { type: Boolean, default: true },
    maxPerBuyer: { type: Number, default: 3 },
    maxPerMonth: { type: Number, default: 10 },
    eligibleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    minimumOrderValue: Number
  },
  paidSamples: {
    enabled: { type: Boolean, default: true },
    pricing: {
      flat: Number,
      percentage: Number,
      includesShipping: { type: Boolean, default: false }
    }
  },
  restrictions: {
    countries: [String],
    requiresVerification: { type: Boolean, default: false },
    requiresPreviousOrder: { type: Boolean, default: false }
  },
  autoApproval: {
    enabled: { type: Boolean, default: false },
    conditions: {
      verifiedBuyers: { type: Boolean, default: true },
      minimumRating: Number,
      minimumOrders: Number
    }
  }
});

const SampleRequest = mongoose.model('SampleRequest', sampleRequestSchema);
const SamplePolicy = mongoose.model('SamplePolicy', samplePolicySchema);

module.exports = { SampleRequest, SamplePolicy };
