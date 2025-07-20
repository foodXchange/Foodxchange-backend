const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
  // Basic Information
  supplierName: { type: String, required: true },
  companyName: { type: String, required: true },
  supplierCode: { type: String, unique: true, sparse: true },
  autoNumber: { type: String, unique: true }, // From your data: 6-digit codes

  // Authentication
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: false }, // Pending verification
  isVerified: { type: Boolean, default: false },

  // Company Details
  companyEmail: { type: String, required: true },
  companyWebsite: { type: String },
  phone: { type: String },
  vatNumber: { type: String },

  // Address & Location
  address: { type: String },
  country: { type: String, required: true },
  closestSeaPort: { type: String },
  distanceToSeaport: { type: Number }, // in km

  // Business Information
  categories: [String], // Product categories
  productCategoryText: { type: String }, // Detailed category description
  description: { type: String }, // Company description

  // Trading Terms
  incoterms: {
    type: String,
    enum: ['EXW', 'FOB', 'CIF', 'CFR', 'DDP', 'FCA', 'CPT', 'CIP', 'DAT', 'DAP']
  },
  paymentTerms: { type: String },

  // Certifications
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    iso: { type: Boolean, default: false },
    haccp: { type: Boolean, default: false },
    brc: { type: Boolean, default: false },
    ifs: { type: Boolean, default: false },
    other: [String]
  },

  // Documents & Media
  companyLogo: { type: String },
  profileImages: [String],
  certificationDocs: [{
    type: { type: String },
    url: { type: String },
    expiryDate: { type: Date },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Contacts
  primaryContact: {
    name: { type: String, required: true },
    jobTitle: { type: String },
    email: { type: String, required: true },
    mobile: { type: String },
    office: { type: String }
  },
  additionalContacts: [{
    name: String,
    jobTitle: String,
    email: String,
    mobile: String,
    office: String,
    isActive: { type: Boolean, default: true }
  }],

  // Performance Metrics
  metrics: {
    totalProducts: { type: Number, default: 0 },
    activeRFQs: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 }, // Percentage
    onTimeDelivery: { type: Number, default: 0 } // Percentage
  },

  // Relationships
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  proposals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Proposal' }],
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],

  // Import tracking
  importSource: { type: String }, // Track where data came from
  originalData: { type: mongoose.Schema.Types.Mixed }, // Store original import data

  // Timestamps
  registeredAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes for performance
sellerSchema.index({ country: 1, categories: 1 });
sellerSchema.index({ 'certifications.kosher': 1 });
sellerSchema.index({ isActive: 1, isVerified: 1 });
sellerSchema.index({ companyName: 'text', description: 'text' });

// Virtual for full address
sellerSchema.virtual('fullAddress').get(function() {
  return `${this.address || ''}, ${this.country}`.trim();
});

// Method to check if certification is valid
sellerSchema.methods.hasValidCertification = function(certType) {
  const cert = this.certificationDocs.find(doc =>
    doc.type === certType && doc.expiryDate > new Date()
  );
  return !!cert;
};

// Method to calculate profile completion
sellerSchema.methods.getProfileCompletion = function() {
  const requiredFields = [
    'companyName', 'country', 'categories', 'description',
    'primaryContact.name', 'primaryContact.email'
  ];

  let completed = 0;
  requiredFields.forEach(field => {
    const value = field.includes('.')
      ? field.split('.').reduce((obj, key) => obj?.[key], this)
      : this[field];
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      completed++;
    }
  });

  return Math.round((completed / requiredFields.length) * 100);
};

module.exports = mongoose.model('Seller', sellerSchema);
