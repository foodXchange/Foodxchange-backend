const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  companyType: {
    type: String,
    enum: ['buyer', 'supplier', 'contractor'],
    required: true
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  companyCode: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: [true, 'Company email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  website: {
    type: String,
    trim: true
  },
  logo: String,
  
  address: {
    street: String,
    city: String,
    state: String,
    country: {
      type: String,
      required: [true, 'Country is required']
    },
    zipCode: String
  },
  
  // Supplier specific fields
  supplierData: {
    categories: [String],
    preferredSeaport: String,
    distanceToSeaport: Number,
    incoterms: String,
    paymentTerms: String,
    certifications: {
      kosher: { type: Boolean, default: false },
      kosherType: String,
      organic: { type: Boolean, default: false },
      halal: { type: Boolean, default: false },
      iso: [String]
    },
    vatNumber: String,
    supplierNumber: String
  },
  
  // Buyer specific fields
  buyerData: {
    businessSector: String,
    warehouseAddress: String,
    vatNumber: String
  },
  
  // Contractor specific fields
  contractorData: {
    category: String,
    contractorType: String, // 'foodX', 'Buyer', 'Supplier'
    services: [String]
  },
  
  description: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Index for search
companySchema.index({ companyName: 'text', description: 'text' });

module.exports = mongoose.model('Company', companySchema);
