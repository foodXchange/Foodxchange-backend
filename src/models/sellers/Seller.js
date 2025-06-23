const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  contactName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String
  },
  productCategories: [{
    type: String,
    enum: ['grains', 'dairy', 'beverages', 'snacks', 'organic', 'meat', 'seafood', 'produce', 'other']
  }],
  description: {
    type: String,
    maxlength: 1000
  },
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    nonGMO: { type: Boolean, default: false },
    fairTrade: { type: Boolean, default: false }
  },
  documents: [{
    type: {
      type: String,
      enum: ['certification', 'license', 'insurance', 'other']
    },
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
    expiryDate: Date
  }],
  bankDetails: {
    accountName: String,
    accountNumber: String,
    bankName: String,
    swiftCode: String,
    iban: String
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'suspended', 'rejected'],
    default: 'pending'
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  },
  metrics: {
    totalOrders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    responseTime: { type: Number, default: 0 }, // in hours
    acceptanceRate: { type: Number, default: 0 } // percentage
  },
  preferences: {
    minimumOrderValue: { type: Number, default: 0 },
    leadTime: { type: Number, default: 7 }, // in days
    paymentTerms: [String],
    shippingTerms: [String],
    preferredCurrencies: [String]
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

// Indexes
sellerSchema.index({ companyName: 'text', description: 'text' });
sellerSchema.index({ country: 1, productCategories: 1 });
sellerSchema.index({ status: 1 });
sellerSchema.index({ 'rating.average': -1 });

// Update timestamp on save
sellerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Seller', sellerSchema);
