const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productCode: {
    type: String,
    unique: true,
    sparse: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  subcategory: String,
  hsCode: String,
  
  specifications: {
    grossWeight: Number,
    netWeight: Number,
    unitOfMeasure: String,
    unitsPerCarton: Number,
    minTemperature: Number,
    maxTemperature: Number,
    shelfLifeDays: Number
  },
  
  pricing: {
    currency: {
      type: String,
      default: 'USD'
    },
    wholesalePrice: Number,
    pricePerCarton: Number,
    moqUnits: Number,
    incoterms: String,
    paymentTerms: String
  },
  
  logistics: {
    cartons20ft: Number,
    cartons40ft: Number,
    pallets20ft: Number,
    pallets40ft: Number,
    totalUnits20ft: Number,
    totalUnits40ft: Number
  },
  
  certifications: {
    kosher: { type: Boolean, default: false },
    kosherDetails: String,
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false }
  },
  
  images: [String],
  documents: [String],
  
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive'],
    default: 'draft'
  }
}, {
  timestamps: true
});

// Index for search
productSchema.index({ name: 'text', description: 'text', category: 1 });

module.exports = mongoose.model('Product', productSchema);
