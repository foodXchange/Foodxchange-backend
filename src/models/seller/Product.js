const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Basic Information
  productId: { type: String, unique: true, required: true },
  productCode: { type: Number },
  productName: { type: String, required: true },
  
  // Supplier Reference
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  supplierName: { type: String }, // Denormalized for performance
  supplierCountry: { type: String },
  supplierCode: { type: String },
  
  // Buyer Information
  buyerCompany: { type: String },
  buyerProductCode: { type: String }, // EAN
  
  // Product Details
  category: { type: String },
  categoryFamily: { type: String },
  description: { type: String },
  
  // Specifications
  unitOfMeasure: { type: String, enum: ['gr', 'kg', 'liter', 'ml', 'unit', 'pack'] },
  netWeight: { type: Number },
  grossWeight: { type: Number },
  
  // Packaging
  unitsPerCarton: { type: Number },
  minOrderQty: { type: Number }, // MOQ
  packaging: [{
    type: { type: String },
    size: { type: String },
    unitsPerPackage: { type: Number }
  }],
  
  // Pricing
  pricing: {
    unitPrice: { type: Number },
    cartonPrice: { type: Number },
    currency: { type: String, default: 'USD' },
    incoterms: { type: String },
    priceBase: { type: String }
  },
  priceHistory: [{
    price: { type: Number },
    currency: { type: String },
    date: { type: Date },
    notes: { type: String }
  }],
  
  // Logistics
  logistics: {
    hsTariffCode: { type: String },
    closestSeaPort: { type: String },
    cartons20ft: { type: Number },
    cartons40ft: { type: Number },
    pallets20ft: { type: Number },
    pallets40ft: { type: Number },
    totalUnits20ft: { type: Number },
    totalUnits40ft: { type: Number }
  },
  
  // Storage Requirements
  storage: {
    shelfLifeDays: { type: Number },
    minTemperature: { type: Number },
    maxTemperature: { type: Number },
    storageConditions: { type: String }
  },
  
  // Certifications
  certifications: {
    kosher: { type: Boolean, default: false },
    kosherType: { type: String },
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    glutenFree: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false },
    nonGMO: { type: Boolean, default: false }
  },
  
  // Media
  images: [{
    url: { type: String },
    type: { type: String, enum: ['product', 'packaging', 'label', 'certificate'] },
    isPrimary: { type: Boolean, default: false }
  }],
  documents: [{
    name: { type: String },
    url: { type: String },
    type: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'inactive', 'discontinued'],
    default: 'pending'
  },
  stage: { type: String }, // From your data
  
  // Metadata
  createdBy: { type: String },
  lastUpdatedBy: { type: String },
  importedFrom: { type: String },
  
  // Search optimization
  searchTags: [String],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
productSchema.index({ supplier: 1, status: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ productName: 'text', description: 'text', searchTags: 'text' });
productSchema.index({ 'pricing.unitPrice': 1 });
productSchema.index({ 'certifications.kosher': 1, 'certifications.organic': 1 });

// Virtual for availability
productSchema.virtual('isAvailable').get(function() {
  return this.status === 'active';
});

// Method to calculate container capacity
productSchema.methods.calculateContainerCapacity = function(containerType) {
  if (containerType === '20ft') {
    return {
      cartons: this.logistics.cartons20ft,
      pallets: this.logistics.pallets20ft,
      units: this.logistics.totalUnits20ft
    };
  } else if (containerType === '40ft') {
    return {
      cartons: this.logistics.cartons40ft,
      pallets: this.logistics.pallets40ft,
      units: this.logistics.totalUnits40ft
    };
  }
  return null;
};

module.exports = mongoose.model('Product', productSchema);
