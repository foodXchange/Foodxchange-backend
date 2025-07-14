const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: String,
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  specifications: {
    brand: String,
    model: String,
    sku: String,
    weight: {
      value: Number,
      unit: { type: String, enum: ['g', 'kg', 'lb', 'oz'] }
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, enum: ['cm', 'in', 'mm'] }
    },
    packaging: {
      type: String,
      unitsPerCase: Number,
      caseWeight: Number,
      caseSize: String
    }
  },
  nutritionalInfo: {
    calories: Number,
    protein: Number,
    carbohydrates: Number,
    fat: Number,
    fiber: Number,
    sodium: Number,
    sugar: Number
  },
  allergens: [{
    type: String,
    enum: ['milk', 'eggs', 'fish', 'shellfish', 'nuts', 'peanuts', 'wheat', 'soy', 'sesame']
  }],
  dietaryAttributes: [{
    type: String,
    enum: ['organic', 'kosher', 'halal', 'vegan', 'vegetarian', 'gluten-free', 'non-gmo']
  }],
  pricing: {
    basePrice: Number,
    currency: { type: String, default: 'USD' },
    minimumOrder: {
      quantity: Number,
      unit: String
    },
    bulkPricing: [{
      minQuantity: Number,
      price: Number
    }]
  },
  availability: {
    inStock: { type: Boolean, default: true },
    stockQuantity: Number,
    leadTime: {
      min: Number,
      max: Number,
      unit: { type: String, enum: ['days', 'weeks'], default: 'days' }
    },
    seasonality: {
      available: { type: Boolean, default: true },
      season: String,
      months: [Number] // 1-12 for Jan-Dec
    }
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: Boolean
  }],
  documents: [{
    name: String,
    type: { type: String, enum: ['spec_sheet', 'safety_data', 'certificate', 'brochure'] },
    url: String
  }],
  compliance: {
    certifications: [String],
    regulatoryInfo: String,
    countryApprovals: [String]
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },
  analytics: {
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    orders: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Text search index
productSchema.index({
  name: 'text',
  description: 'text',
  'specifications.brand': 'text'
});

// Compound indexes for efficient queries
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ supplier: 1, isActive: 1 });
productSchema.index({ 'pricing.basePrice': 1 });

module.exports = mongoose.model('Product', productSchema);
