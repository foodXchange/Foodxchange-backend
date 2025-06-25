const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  type: {
    type: String,
    enum: ['manufacturer', 'distributor', 'retailer', 'supplier', 'service_provider'],
    required: true
  },
  industry: {
    type: String,
    enum: ['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods', 'organic', 'kosher', 'halal'],
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  contact: {
    email: String,
    phone: String,
    website: String
  },
  certifications: [{
    name: String,
    authority: String,
    number: String,
    validFrom: Date,
    validUntil: Date,
    document: String, // URL to certificate
    verified: { type: Boolean, default: false }
  }],
  businessInfo: {
    registrationNumber: String,
    taxId: String,
    yearEstablished: Number,
    employeeCount: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '500+']
    },
    annualRevenue: {
      type: String,
      enum: ['<1M', '1M-10M', '10M-50M', '50M-100M', '100M+']
    }
  },
  capabilities: {
    minOrderValue: Number,
    maxOrderValue: Number,
    shippingMethods: [String],
    paymentTerms: [String],
    leadTime: {
      min: Number,
      max: Number,
      unit: { type: String, enum: ['days', 'weeks'], default: 'days' }
    }
  },
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    notes: String
  },
  rating: {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for geospatial queries
companySchema.index({ 'address.coordinates': '2dsphere' });

module.exports = mongoose.model('Company', companySchema);
