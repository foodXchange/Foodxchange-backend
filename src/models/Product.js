const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    sparse: true
  },
  productCode: Number,
  name: {
    type: String,
    required: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  category: String,
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'discontinued'],
    default: 'active'
  },
  pricing: {
    unitPrice: Number,
    cartonPrice: Number,
    currency: {
      type: String,
      default: 'USD'
    },
    incoterms: String,
    paymentTerms: String
  },
  packaging: {
    unitsPerCarton: Number,
    grossWeight: Number,
    netWeight: Number,
    unitOfMeasure: String
  },
  logistics: {
    moq: Number,
    containers20ft: Number,
    containers40ft: Number,
    pallets20ft: Number,
    pallets40ft: Number,
    totalUnits20ft: Number,
    totalUnits40ft: Number,
    preferredPort: String
  },
  specifications: {
    hsTariffCode: String,
    shelfLife: Number,
    minTemp: Number,
    maxTemp: Number,
    supplierProductCode: String,
    buyerProductCode: String
  },
  certifications: {
    kosher: Boolean,
    organic: Boolean,
    halal: Boolean,
    vegan: Boolean,
    other: [String]
  },
  images: [String],
  privateLabelImages: [String],
  description: String,
  stage: String,
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
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for search
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ supplier: 1 });
productSchema.index({ status: 1 });

module.exports = mongoose.model('Product', productSchema);
