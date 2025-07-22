import mongoose from 'mongoose';
const { Decimal128 } = mongoose.Types;

const productSchema = new mongoose.Schema({
  // Dual ID System
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  legacyId: { type: String, unique: true, sparse: true },
  productCode: { type: String, unique: true },

  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: 'text'
  },
  description: {
    type: String,
    maxlength: 2000,
    index: 'text'
  },
  shortDescription: { type: String, maxlength: 500 },

  // Supplier Information
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true
  },
  supplierProductCode: String,
  supplierDescription: String,

  // Category & Classification
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    index: true
  },
  categoryPath: [String], // ['Food', 'Beverages', 'Juice']
  productFamily: String,

  // Trade Classification
  classification: {
    hsCode: String, // HS/Tariff Code
    unspsc: String, // UNSPSC code
    gtinCode: String, // Global Trade Item Number
    customCategories: [String]
  },

  // Physical Specifications
  specifications: {
    // Weight & Dimensions
    weight: {
      gross: Number,
      net: Number,
      unit: { type: String, enum: ['g', 'kg', 'lb', 'oz'], default: 'kg' }
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: { type: String, enum: ['cm', 'in', 'mm'], default: 'cm' }
    },

    // Packaging
    packaging: {
      type: String, // 'Bottle', 'Can', 'Box', etc.
      material: String,
      unitsPerCarton: Number,
      cartonWeight: Number,
      cartonDimensions: {
        length: Number,
        width: Number,
        height: Number
      }
    },

    // Container Loading
    containerLoading: {
      cartons20ft: Number,
      cartons40ft: Number,
      pallets20ft: Number,
      pallets40ft: Number,
      totalUnits20ft: Number,
      totalUnits40ft: Number
    },

    // Storage Requirements
    storage: {
      temperature: {
        min: Number,
        max: Number,
        unit: { type: String, enum: ['C', 'F'], default: 'C' }
      },
      humidity: {
        min: Number,
        max: Number
      },
      shelfLife: {
        duration: Number,
        unit: { type: String, enum: ['days', 'weeks', 'months', 'years'], default: 'days' }
      },
      specialRequirements: [String]
    }
  },

  // Pricing Information (Decimal128 for precision)
  pricing: {
    unitPrice: {
      wholesale: Decimal128,
      retail: Decimal128,
      currency: { type: String, default: 'USD' }
    },
    cartonPrice: Decimal128,
    moq: {
      quantity: Number,
      unit: String
    },
    priceBreaks: [{
      minQuantity: Number,
      unitPrice: Decimal128,
      cartonPrice: Decimal128
    }],
    terms: {
      incoterms: {
        type: String,
        enum: ['EXW', 'FCA', 'CPT', 'CIP', 'DPU', 'DAP', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
      },
      paymentTerms: {
        type: String,
        enum: ['NET15', 'NET30', 'NET60', 'COD', 'Prepaid', 'LC', 'Custom']
      },
      customTerms: String
    }
  },

  // Logistics Information
  logistics: {
    leadTime: {
      min: Number,
      max: Number,
      unit: { type: String, enum: ['days', 'weeks'], default: 'days' }
    },
    originCountry: String,
    preferredPorts: [String],
    shippingMethods: [String],
    specialHandling: [String]
  },

  // Nutritional Information
  nutrition: {
    servingSize: {
      amount: Number,
      unit: String
    },
    per100g: {
      calories: Number,
      protein: Number,
      carbohydrates: Number,
      fat: Number,
      saturatedFat: Number,
      transFat: Number,
      fiber: Number,
      sugar: Number,
      sodium: Number,
      cholesterol: Number
    },
    vitamins: [{
      name: String,
      amount: Number,
      unit: String,
      dailyValue: Number
    }],
    minerals: [{
      name: String,
      amount: Number,
      unit: String,
      dailyValue: Number
    }]
  },

  // Allergens & Dietary Information
  dietary: {
    allergens: [{
      type: String,
      enum: ['milk', 'eggs', 'fish', 'shellfish', 'nuts', 'peanuts', 'wheat', 'soy', 'sesame'],
      containment: { type: String, enum: ['contains', 'may_contain', 'free_from'] }
    }],
    attributes: [{
      type: String,
      enum: ['organic', 'kosher', 'halal', 'vegan', 'vegetarian', 'gluten-free', 'non-gmo', 'fair-trade']
    }],
    additives: [String],
    preservatives: [String]
  },

  // Compliance & Certifications
  compliance: {
    certifications: [{
      name: String,
      authority: String,
      number: String,
      validFrom: Date,
      validUntil: Date,
      documentUrl: String, // Azure Blob Storage URL
      verified: Boolean
    }],
    regulatoryApprovals: [{
      country: String,
      authority: String,
      approvalNumber: String,
      status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'] },
      approvedDate: Date,
      expiryDate: Date
    }],
    foodSafety: {
      haccp: Boolean,
      brc: Boolean,
      sqf: Boolean,
      ifs: Boolean,
      other: [String]
    }
  },

  // Media & Documentation (Azure Blob Storage)
  media: {
    images: [{
      url: String, // Azure CDN URL
      type: { type: String, enum: ['main', 'packaging', 'label', 'lifestyle', 'ingredient'] },
      caption: String,
      isMain: Boolean,
      sortOrder: Number
    }],
    documents: [{
      name: String,
      type: {
        type: String,
        enum: ['spec_sheet', 'safety_data', 'certificate', 'brochure', 'label', 'nutritional']
      },
      url: String, // Azure Blob Storage URL
      uploadedAt: Date,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    videos: [{
      url: String,
      title: String,
      description: String,
      duration: Number // seconds
    }]
  },

  // Availability & Inventory
  availability: {
    status: {
      type: String,
      enum: ['available', 'limited', 'out_of_stock', 'discontinued', 'seasonal'],
      default: 'available',
      index: true
    },
    stockQuantity: Number,
    reservedQuantity: Number,
    availableQuantity: { type: Number, default: 0 },
    seasonality: {
      isSeasonalF: Boolean,
      season: String,
      availableMonths: [Number] // 1-12 for Jan-Dec
    },
    restockDate: Date
  },

  // SEO & Marketing
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    slug: { type: String, unique: true, sparse: true }
  },

  // Analytics & Performance
  analytics: {
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    conversionRate: Number,
    lastViewedAt: Date
  },

  // AI/ML Features (Azure AI integration)
  aiData: {
    keywords: [String], // Extracted keywords
    embeddings: [Number], // Vector embeddings for similarity search
    categoryPredictions: [{
      category: String,
      confidence: Number
    }],
    priceRecommendations: {
      suggested: Decimal128,
      competitive: Decimal128,
      lastAnalyzed: Date
    },
    demandForecast: {
      score: Number,
      trend: String, // 'rising', 'stable', 'declining'
      lastAnalyzed: Date
    }
  },

  // Product Relationships
  relationships: {
    variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    substitutes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    complements: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    bundleItems: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantity: Number
    }]
  },

  // Quality & Reviews
  quality: {
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      breakdown: {
        quality: Number,
        packaging: Number,
        delivery: Number,
        value: Number
      }
    },
    qualityChecks: [{
      checkDate: Date,
      inspector: String,
      result: { type: String, enum: ['pass', 'fail', 'conditional'] },
      notes: String,
      documents: [String]
    }]
  },

  // Status & Workflow
  status: {
    stage: {
      type: String,
      enum: ['draft', 'review', 'active', 'inactive', 'archived'],
      default: 'draft',
      index: true
    },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false }, // Only visible to specific buyers
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  },

  // Original Data Preservation
  originalData: {
    productId: String,
    source: String,
    importedAt: Date,
    rawData: mongoose.Schema.Types.Mixed
  },

  // Comments & Feedback
  comments: [{
    type: { type: String, enum: ['note', 'issue', 'feedback', 'quality'] },
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isInternal: Boolean,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'] },
    attachments: [String],
    tags: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: Date
  }],

  // System Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastModifiedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      // Convert Decimal128 to numbers for JSON output
      if (ret.pricing?.unitPrice?.wholesale) {
        ret.pricing.unitPrice.wholesale = parseFloat(ret.pricing.unitPrice.wholesale.toString());
      }
      if (ret.pricing?.unitPrice?.retail) {
        ret.pricing.unitPrice.retail = parseFloat(ret.pricing.unitPrice.retail.toString());
      }
      if (ret.pricing?.cartonPrice) {
        ret.pricing.cartonPrice = parseFloat(ret.pricing.cartonPrice.toString());
      }
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for performance and search
productSchema.index({ name: 'text', description: 'text', 'specifications.packaging.type': 'text' });
productSchema.index({ supplier: 1, 'status.isActive': 1 });
productSchema.index({ category: 1, 'status.stage': 1 });
productSchema.index({ 'pricing.unitPrice.wholesale': 1 });
productSchema.index({ 'availability.status': 1 });
productSchema.index({ 'dietary.attributes': 1 });
productSchema.index({ 'logistics.originCountry': 1 });
productSchema.index({ legacyId: 1 }, { sparse: true });

// Virtual for availability calculation
productSchema.virtual('availableQuantity').get(function() {
  return Math.max(0, (this.availability?.stockQuantity || 0) - (this.availability?.reservedQuantity || 0));
});

// Virtual for price per unit calculation
productSchema.virtual('pricePerUnit').get(function() {
  if (this.pricing?.unitPrice?.wholesale) {
    return parseFloat(this.pricing.unitPrice.wholesale.toString());
  }
  return 0;
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  // Generate product code if not exists
  if (this.isNew && !this.productCode) {
    this.productCode = `PRD-${Date.now().toString().slice(-8)}`;
  }

  // Generate SEO slug if not exists
  if (this.isNew && !this.seo?.slug && this.name) {
    this.seo = this.seo || {};
    this.seo.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Update last modified
  this.lastModifiedAt = new Date();

  next();
});

// Post-save middleware for AI processing
productSchema.post('save', async (doc) => {
  // Trigger Azure AI analysis for new products
  if (doc.isNew) {
    // Queue for AI keyword extraction, category prediction, and price analysis
    console.log(`Queuing AI analysis for product: ${doc.name}`);
  }
});

export default mongoose.model('Product', productSchema);
