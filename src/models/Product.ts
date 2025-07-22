import mongoose, { Document, Schema } from 'mongoose';
import slugify from 'slugify';

export interface IProduct extends Document {
  // Basic Information
  name: string;
  description?: string;
  shortDescription?: string;
  slug: string;

  // Categorization
  category: string;
  subcategory?: string;
  tags: string[];

  // Identification
  sku: string;
  gtin?: string; // Global Trade Item Number
  upc?: string;
  ean?: string;

  // Supplier Information
  supplier: mongoose.Types.ObjectId;
  tenantId: string;
  manufacturer?: string;
  brand?: string;
  countryOfOrigin?: string;

  // Product Status
  status: 'draft' | 'active' | 'inactive' | 'discontinued';
  isPublished: boolean;
  publishedAt?: Date;

  // Images
  images: Array<{
    url: string;
    alt?: string;
    isPrimary: boolean;
    order: number;
  }>;

  // Pricing
  pricing: {
    currency: string;
    basePrice: number;
    unit: string;
    tierPricing: Array<{
      minQuantity: number;
      maxQuantity?: number;
      price: number;
      discount?: number;
    }>;
    taxRate?: number;
    isTaxIncluded: boolean;
  };

  // Legacy price property for backward compatibility
  price?: {
    amount: number;
    currency?: string;
  };

  // Inventory
  inventory: {
    trackInventory: boolean;
    quantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    lowStockThreshold?: number;
    outOfStockBehavior: 'hide' | 'show' | 'backorder';
    leadTime?: {
      value: number;
      unit: 'days' | 'weeks' | 'months';
    };
  };

  // Physical Specifications
  specifications: {
    weight?: {
      value: number;
      unit: 'g' | 'kg' | 'lb' | 'oz';
    };
    dimensions?: {
      length: number;
      width: number;
      height: number;
      unit: 'cm' | 'in' | 'mm' | 'm';
    };
    volume?: {
      value: number;
      unit: 'ml' | 'l' | 'gal' | 'fl oz';
    };
  };

  // Packaging Information
  packaging: {
    type: string;
    material?: string;
    unitsPerCase: number;
    casesPerPallet?: number;
    caseWeight?: {
      value: number;
      unit: 'kg' | 'lb';
    };
    caseDimensions?: {
      length: number;
      width: number;
      height: number;
      unit: 'cm' | 'in';
    };
    isRecyclable?: boolean;
    recycleCodes?: string[];
  };

  // Nutritional Information
  nutritionalInfo?: {
    servingSize: string;
    servingsPerContainer?: number;
    calories?: number;
    totalFat?: { value: number; unit: string; dailyValue?: number };
    saturatedFat?: { value: number; unit: string; dailyValue?: number };
    transFat?: { value: number; unit: string };
    cholesterol?: { value: number; unit: string; dailyValue?: number };
    sodium?: { value: number; unit: string; dailyValue?: number };
    totalCarbohydrates?: { value: number; unit: string; dailyValue?: number };
    dietaryFiber?: { value: number; unit: string; dailyValue?: number };
    totalSugars?: { value: number; unit: string };
    addedSugars?: { value: number; unit: string; dailyValue?: number };
    protein?: { value: number; unit: string; dailyValue?: number };
    vitamins?: Array<{
      name: string;
      value: number;
      unit: string;
      dailyValue?: number;
    }>;
    minerals?: Array<{
      name: string;
      value: number;
      unit: string;
      dailyValue?: number;
    }>;
  };

  // Food Safety & Compliance
  foodSafety: {
    allergens: string[];
    containsGMO: boolean;
    isOrganic: boolean;
    isKosher: boolean;
    isHalal: boolean;
    isVegan: boolean;
    isVegetarian: boolean;
    isGlutenFree: boolean;
    isDairyFree: boolean;
    isNutFree: boolean;

    // Storage Requirements
    storageTemperature: {
      min: number;
      max: number;
      unit: 'C' | 'F';
    };
    storageHumidity?: {
      min: number;
      max: number;
    };
    storageInstructions?: string;

    // Shelf Life
    shelfLife: {
      value: number;
      unit: 'days' | 'weeks' | 'months' | 'years';
      fromDate: 'production' | 'delivery' | 'opening';
    };
    bestByDate?: Date;
    expirationDate?: Date;
  };

  // Certifications
  certifications: Array<{
    type: string;
    certifier: string;
    certificateNumber: string;
    validFrom: Date;
    validUntil: Date;
    documentUrl?: string;
    verified: boolean;
  }>;

  // Traceability
  traceability: {
    lotTracking: boolean;
    serialNumberTracking: boolean;
    harvestDate?: Date;
    processingDate?: Date;
    packagingDate?: Date;
    farmLocation?: {
      name?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
      country?: string;
      region?: string;
    };
  };

  // Quality Metrics
  quality: {
    grade?: string;
    qualityScore?: number;
    defectRate?: number;
    lastInspectionDate?: Date;
    inspectionReports?: Array<{
      date: Date;
      inspector: string;
      result: 'pass' | 'fail' | 'conditional';
      notes?: string;
      documentUrl?: string;
    }>;
  };

  // Logistics
  logistics: {
    harmonizedCode?: string;
    dangerousGoods: boolean;
    handlingInstructions?: string;
    stackable: boolean;
    maxStackHeight?: number;
    requiresRefrigeration: boolean;
    temperatureControlled: boolean;
    fragile: boolean;
  };

  // Marketing
  marketing: {
    features: string[];
    benefits: string[];
    targetMarket?: string[];
    seasonality?: string[];
    promotionalText?: string;
    keywords: string[];
  };

  // Analytics
  analytics: {
    views: number;
    uniqueViews: number;
    inquiries: number;
    orders: number;
    conversionRate: number;
    averageRating: number;
    totalReviews: number;
  };

  // Custom Attributes
  customAttributes?: Map<string, any>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  deletedAt?: Date;
  version: number;

  // Methods
  calculatePrice(quantity: number): number;
  checkAvailability(quantity: number): boolean;
  getNextExpiringBatch(): any;
  updateInventory(quantity: number, operation: 'add' | 'subtract' | 'reserve'): Promise<void>;
}

const productSchema = new Schema<IProduct>({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  description: {
    type: String,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [500, 'Short description cannot exceed 500 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },

  // Categorization
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['beverages', 'dairy', 'meat', 'seafood', 'produce', 'packaged_foods', 'bakery', 'frozen', 'organic', 'ingredients']
  },
  subcategory: String,
  tags: [String],

  // Identification
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  gtin: {
    type: String,
    sparse: true,
    index: true
  },
  upc: String,
  ean: String,

  // Supplier Information
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Supplier is required']
  },
  tenantId: {
    type: String,
    required: [true, 'Tenant ID is required'],
    index: true
  },
  manufacturer: String,
  brand: String,
  countryOfOrigin: String,

  // Product Status
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'discontinued'],
    default: 'draft'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,

  // Images
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    }
  }],

  // Pricing
  pricing: {
    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Price cannot be negative']
    },
    unit: {
      type: String,
      required: [true, 'Pricing unit is required'],
      enum: ['each', 'case', 'pallet', 'kg', 'lb', 'l', 'gal']
    },
    tierPricing: [{
      minQuantity: {
        type: Number,
        required: true,
        min: 1
      },
      maxQuantity: Number,
      price: {
        type: Number,
        required: true,
        min: 0
      },
      discount: {
        type: Number,
        min: 0,
        max: 100
      }
    }],
    taxRate: {
      type: Number,
      min: 0,
      max: 100
    },
    isTaxIncluded: {
      type: Boolean,
      default: false
    }
  },

  // Legacy price field for backward compatibility
  price: {
    amount: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      uppercase: true,
      default: 'USD'
    }
  },

  // Inventory
  inventory: {
    trackInventory: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    availableQuantity: {
      type: Number,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      min: 0
    },
    outOfStockBehavior: {
      type: String,
      enum: ['hide', 'show', 'backorder'],
      default: 'show'
    },
    leadTime: {
      value: Number,
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months'],
        default: 'days'
      }
    }
  },

  // Physical Specifications
  specifications: {
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['g', 'kg', 'lb', 'oz']
      }
    },
    dimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'in', 'mm', 'm']
      }
    },
    volume: {
      value: Number,
      unit: {
        type: String,
        enum: ['ml', 'l', 'gal', 'fl oz']
      }
    }
  },

  // Packaging Information
  packaging: {
    type: {
      type: String,
      required: true
    },
    material: String,
    unitsPerCase: {
      type: Number,
      required: true,
      min: 1
    },
    casesPerPallet: Number,
    caseWeight: {
      value: Number,
      unit: {
        type: String,
        enum: ['kg', 'lb']
      }
    },
    caseDimensions: {
      length: Number,
      width: Number,
      height: Number,
      unit: {
        type: String,
        enum: ['cm', 'in']
      }
    },
    isRecyclable: Boolean,
    recycleCodes: [String]
  },

  // Nutritional Information
  nutritionalInfo: {
    servingSize: String,
    servingsPerContainer: Number,
    calories: Number,
    totalFat: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    saturatedFat: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    transFat: {
      value: Number,
      unit: String
    },
    cholesterol: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    sodium: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    totalCarbohydrates: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    dietaryFiber: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    totalSugars: {
      value: Number,
      unit: String
    },
    addedSugars: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    protein: {
      value: Number,
      unit: String,
      dailyValue: Number
    },
    vitamins: [{
      name: String,
      value: Number,
      unit: String,
      dailyValue: Number
    }],
    minerals: [{
      name: String,
      value: Number,
      unit: String,
      dailyValue: Number
    }]
  },

  // Food Safety & Compliance
  foodSafety: {
    allergens: [{
      type: String,
      enum: ['milk', 'eggs', 'fish', 'shellfish', 'tree_nuts', 'peanuts', 'wheat', 'soybeans', 'sesame']
    }],
    containsGMO: {
      type: Boolean,
      default: false
    },
    isOrganic: {
      type: Boolean,
      default: false
    },
    isKosher: {
      type: Boolean,
      default: false
    },
    isHalal: {
      type: Boolean,
      default: false
    },
    isVegan: {
      type: Boolean,
      default: false
    },
    isVegetarian: {
      type: Boolean,
      default: false
    },
    isGlutenFree: {
      type: Boolean,
      default: false
    },
    isDairyFree: {
      type: Boolean,
      default: false
    },
    isNutFree: {
      type: Boolean,
      default: false
    },
    storageTemperature: {
      min: {
        type: Number,
        required: true
      },
      max: {
        type: Number,
        required: true
      },
      unit: {
        type: String,
        enum: ['C', 'F'],
        default: 'C'
      }
    },
    storageHumidity: {
      min: Number,
      max: Number
    },
    storageInstructions: String,
    shelfLife: {
      value: {
        type: Number,
        required: true
      },
      unit: {
        type: String,
        enum: ['days', 'weeks', 'months', 'years'],
        required: true
      },
      fromDate: {
        type: String,
        enum: ['production', 'delivery', 'opening'],
        default: 'production'
      }
    },
    bestByDate: Date,
    expirationDate: Date
  },

  // Certifications
  certifications: [{
    type: {
      type: String,
      required: true
    },
    certifier: {
      type: String,
      required: true
    },
    certificateNumber: {
      type: String,
      required: true
    },
    validFrom: {
      type: Date,
      required: true
    },
    validUntil: {
      type: Date,
      required: true
    },
    documentUrl: String,
    verified: {
      type: Boolean,
      default: false
    }
  }],

  // Traceability
  traceability: {
    lotTracking: {
      type: Boolean,
      default: false
    },
    serialNumberTracking: {
      type: Boolean,
      default: false
    },
    harvestDate: Date,
    processingDate: Date,
    packagingDate: Date,
    farmLocation: {
      name: String,
      coordinates: {
        lat: Number,
        lng: Number
      },
      country: String,
      region: String
    }
  },

  // Quality Metrics
  quality: {
    grade: String,
    qualityScore: {
      type: Number,
      min: 0,
      max: 100
    },
    defectRate: {
      type: Number,
      min: 0,
      max: 100
    },
    lastInspectionDate: Date,
    inspectionReports: [{
      date: {
        type: Date,
        required: true
      },
      inspector: {
        type: String,
        required: true
      },
      result: {
        type: String,
        enum: ['pass', 'fail', 'conditional'],
        required: true
      },
      notes: String,
      documentUrl: String
    }]
  },

  // Logistics
  logistics: {
    harmonizedCode: String,
    dangerousGoods: {
      type: Boolean,
      default: false
    },
    handlingInstructions: String,
    stackable: {
      type: Boolean,
      default: true
    },
    maxStackHeight: Number,
    requiresRefrigeration: {
      type: Boolean,
      default: false
    },
    temperatureControlled: {
      type: Boolean,
      default: false
    },
    fragile: {
      type: Boolean,
      default: false
    }
  },

  // Marketing
  marketing: {
    features: [String],
    benefits: [String],
    targetMarket: [String],
    seasonality: [String],
    promotionalText: String,
    keywords: [String]
  },

  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    inquiries: {
      type: Number,
      default: 0
    },
    orders: {
      type: Number,
      default: 0
    },
    conversionRate: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  },

  // Custom Attributes
  customAttributes: {
    type: Map,
    of: Schema.Types.Mixed
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
productSchema.index({ name: 'text', description: 'text', 'marketing.keywords': 'text' });
productSchema.index({ tenantId: 1, status: 1, isPublished: 1 });
productSchema.index({ category: 1, subcategory: 1 });
productSchema.index({ supplier: 1, status: 1 });
productSchema.index({ sku: 1, tenantId: 1 });
productSchema.index({ gtin: 1 });
productSchema.index({ 'pricing.basePrice': 1 });
productSchema.index({ 'inventory.availableQuantity': 1 });
productSchema.index({ 'foodSafety.allergens': 1 });
productSchema.index({ createdAt: -1 });

// Virtual for available quantity
productSchema.virtual('inventory.calculated').get(function() {
  return this.inventory.quantity - this.inventory.reservedQuantity;
});

// Pre-save middleware
productSchema.pre('save', async function(next) {
  // Generate slug from name
  if (!this.slug) {
    this.slug = slugify(this.name, { lower: true, strict: true });

    // Ensure unique slug
    let existingProduct = await mongoose.model('Product').findOne({
      slug: this.slug,
      _id: { $ne: this._id }
    });

    let counter = 1;
    while (existingProduct) {
      this.slug = `${slugify(this.name, { lower: true, strict: true })}-${counter}`;
      existingProduct = await mongoose.model('Product').findOne({
        slug: this.slug,
        _id: { $ne: this._id }
      });
      counter++;
    }
  }

  // Update available quantity
  this.inventory.availableQuantity = this.inventory.quantity - this.inventory.reservedQuantity;

  // Set published date
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

// Methods
productSchema.methods.calculatePrice = function(quantity: number): number {
  let price = this.pricing.basePrice;

  // Apply tier pricing
  if (this.pricing.tierPricing && this.pricing.tierPricing.length > 0) {
    const applicableTier = this.pricing.tierPricing
      .filter(tier => quantity >= tier.minQuantity && (!tier.maxQuantity || quantity <= tier.maxQuantity))
      .sort((a, b) => b.minQuantity - a.minQuantity)[0];

    if (applicableTier) {
      price = applicableTier.price;

      if (applicableTier.discount) {
        price = price * (1 - applicableTier.discount / 100);
      }
    }
  }

  // Apply tax if not included
  if (!this.pricing.isTaxIncluded && this.pricing.taxRate) {
    price = price * (1 + this.pricing.taxRate / 100);
  }

  return Math.round(price * quantity * 100) / 100;
};

productSchema.methods.checkAvailability = function(quantity: number): boolean {
  if (!this.inventory.trackInventory) return true;
  return this.inventory.availableQuantity >= quantity;
};

productSchema.methods.updateInventory = async function(
  quantity: number,
  operation: 'add' | 'subtract' | 'reserve'
): Promise<void> {
  switch (operation) {
    case 'add':
      this.inventory.quantity += quantity;
      break;
    case 'subtract':
      this.inventory.quantity = Math.max(0, this.inventory.quantity - quantity);
      break;
    case 'reserve':
      this.inventory.reservedQuantity += quantity;
      break;
  }

  this.inventory.availableQuantity = this.inventory.quantity - this.inventory.reservedQuantity;
  await this.save();
};

export const Product = mongoose.model<IProduct>('Product', productSchema);
export default Product;
