const mongoose = require('mongoose');

const productSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  category: {
    type: String,
    required: true
  },
  subcategory: String,
  description: {
    type: String,
    required: true
  },
  specifications: {
    brand: String,
    origin: String,
    ingredients: [String],
    allergens: [String],
    shelfLife: String,
    storageConditions: String,
    nutritionalInfo: {
      calories: Number,
      protein: Number,
      carbohydrates: Number,
      fat: Number,
      fiber: Number,
      sodium: Number
    }
  },
  packaging: [{
    type: {
      type: String,
      required: true
    },
    size: {
      type: String,
      required: true
    },
    unit: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    moq: {
      type: Number,
      default: 1
    }
  }],
  pricing: {
    currency: {
      type: String,
      default: 'USD'
    },
    basePrice: Number,
    tiers: [{
      minQuantity: Number,
      maxQuantity: Number,
      price: Number
    }]
  },
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false },
    nonGMO: { type: Boolean, default: false },
    glutenFree: { type: Boolean, default: false },
    vegan: { type: Boolean, default: false }
  },
  images: [{
    url: String,
    isPrimary: { type: Boolean, default: false }
  }],
  documents: [{
    type: {
      type: String,
      enum: ['datasheet', 'certificate', 'sample', 'other']
    },
    name: String,
    url: String
  }],
  leadTime: {
    production: Number,
    shipping: Number
  },
  minimumOrderQuantity: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'discontinued'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [String]
}, {
  timestamps: true
});

// Indexes
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ supplier: 1, status: 1 });
productSchema.index({ category: 1, subcategory: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
