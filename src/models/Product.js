const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    unique: true,
    required: true
  },
  productCode: Number,
  productName: {
    type: String,
    required: true,
    trim: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  buyerCompany: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  status: {
    type: String,
    enum: ['Active', 'Pending', 'Discontinued', 'Draft'],
    default: 'Pending'
  },
  productImages: [{
    url: String,
    caption: String,
    isMain: Boolean
  }],
  category: {
    type: String,
    required: true
  },
  pricing: {
    unitWholesalePrice: {
      latest: Number,
      initial: Number,
      currency: { type: String, default: 'USD' }
    },
    cartonPrice: Number,
    incoterms: String,
    paymentTerms: String
  },
  specifications: {
    grossWeight: Number,
    netWeight: Number,
    unitsPerCarton: Number,
    unitOfMeasure: String,
    hsTariffCode: String,
    moqUnits: Number,
    shelfLifeDays: Number,
    temperature: {
      min: Number,
      max: Number
    }
  },
  logistics: {
    cartonsPerTwentyFt: Number,
    cartonsPerFortyFt: Number,
    palletsPerTwentyFt: Number,
    palletsPerFortyFt: Number,
    totalUnitsTwentyFt: Number,
    totalUnitsFortyFt: Number,
    closestSeaPort: String
  },
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    nonGmo: { type: Boolean, default: false },
    other: [String]
  },
  supplierProductCode: String,
  buyerProductCode: String,
  productStage: String,
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

// Indexes
productSchema.index({ supplier: 1, status: 1 });
productSchema.index({ productName: 'text', productId: 1 });
productSchema.index({ category: 1 });

module.exports = mongoose.model('Product', productSchema);
