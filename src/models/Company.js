const mongoose = require('mongoose');

const companySchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['buyer', 'supplier', 'both']
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
  address: {
    street: String,
    city: String,
    state: String,
    country: {
      type: String,
      required: true
    },
    zipCode: String
  },
  description: {
    type: String,
    maxlength: 1000
  },
  website: String,
  logo: String,
  categories: [{
    type: String
  }],
  certifications: {
    kosher: {
      certified: { type: Boolean, default: false },
      certifier: String,
      expiryDate: Date
    },
    organic: {
      certified: { type: Boolean, default: false },
      certifier: String,
      expiryDate: Date
    },
    halal: {
      certified: { type: Boolean, default: false },
      certifier: String,
      expiryDate: Date
    },
    haccp: { type: Boolean, default: false },
    iso22000: { type: Boolean, default: false },
    brc: { type: Boolean, default: false },
    fda: { type: Boolean, default: false }
  },
  documents: [{
    type: {
      type: String,
      enum: ['certificate', 'license', 'insurance', 'other']
    },
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'inactive'],
    default: 'pending'
  },
  verifiedAt: Date,
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Indexes for search
companySchema.index({ name: 'text', description: 'text' });
companySchema.index({ country: 1, categories: 1 });

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
