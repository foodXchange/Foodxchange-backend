// File: C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend\src\models\marketplace\ProductEnhanced.ts

import mongoose, { Schema, Model, Types } from 'mongoose';
import {
  ProductDocument,
  ProductPrice,
  Supplier,
  NutritionalInfo,
  PhysicalProperties,
  ProductSpecifications,
  MinOrder,
  ProductAvailability,
  BulkPricingTier,
  ProductImage,
  ComplianceDocument,
  ProductStatus,
  ApprovalStatus,
  AvailabilityStatus,
  VerificationLevel,
  MarketplaceFilters
} from '@/types/marketplace';

// Nutritional Information Schema
const nutritionalInfoSchema = new Schema<NutritionalInfo>({
  caloriesPerUnit: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbohydrates: { type: Number, required: true },
  fat: { type: Number, required: true },
  fiber: { type: Number, required: true },
  sodium: { type: Number, required: true },
  sugar: { type: Number, required: true },
  servingSize: { type: String, required: true }
}, { _id: false });

// Physical Properties Schema
const physicalPropertiesSchema = new Schema<PhysicalProperties>({
  weight: { type: String, required: true },
  dimensions: { type: String, required: true },
  color: { type: String, required: true },
  texture: { type: String, required: true },
  appearance: { type: String, required: true }
}, { _id: false });

// Product Specifications Schema
const productSpecificationsSchema = new Schema<ProductSpecifications>({
  origin: { type: String, required: true },
  ingredients: [{ type: String, required: true }],
  allergens: [{ type: String }],
  storageConditions: { type: String, required: true },
  nutritionalInfo: { type: nutritionalInfoSchema, required: true },
  physicalProperties: { type: physicalPropertiesSchema, required: true }
}, { _id: false });

// Supplier Schema (embedded)
const supplierSchema = new Schema<Supplier>({
  id: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  country: { type: String, required: true },
  verificationLevel: { 
    type: String, 
    enum: ['bronze', 'silver', 'gold'] as VerificationLevel[], 
    default: 'bronze' 
  },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  totalReviews: { type: Number, default: 0 },
  establishedYear: { type: Number },
  certifications: [{ type: String }],
  specialties: [{ type: String }]
}, { _id: false });

// Price Schema
const priceSchema = new Schema<ProductPrice>({
  min: { type: Number, required: true },
  max: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  unit: { type: String, required: true }
}, { _id: false });

// Minimum Order Schema
const minOrderSchema = new Schema<MinOrder>({
  quantity: { type: Number, required: true },
  unit: { type: String, required: true }
}, { _id: false });

// Bulk Pricing Tiers Schema
const bulkPricingTierSchema = new Schema<BulkPricingTier>({
  minQuantity: { type: Number, required: true },
  maxQuantity: { type: Number },
  pricePerUnit: { type: Number, required: true },
  discountPercentage: { type: Number, default: 0 },
  label: { type: String, required: true }
}, { _id: false });

// Product Image Schema
const productImageSchema = new Schema<ProductImage>({
  url: { type: String, required: true },
  alt: { type: String, required: true },
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

// Compliance Document Schema
const complianceDocumentSchema = new Schema<ComplianceDocument>({
  type: { type: String, required: true },
  number: { type: String, required: true },
  issuedBy: { type: String, required: true },
  validUntil: { type: Date, required: true },
  documentUrl: { type: String, required: true }
}, { _id: false });

// Product Availability Schema
const availabilitySchema = new Schema<ProductAvailability>({
  status: { 
    type: String, 
    enum: ['InStock', 'LimitedStock', 'OutOfStock', 'Pre-Order'] as AvailabilityStatus[], 
    default: 'InStock' 
  },
  quantity: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  restockDate: { type: Date },
  leadTime: { type: String, default: '1-2 weeks' }
}, { _id: false });

// Main Product Schema
const productEnhancedSchema = new Schema<ProductDocument>({
  // Core Product Information
  name: { type: String, required: true, index: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  subcategory: { type: String },
  
  // Pricing Information
  price: { type: priceSchema, required: true },
  bulkPricingTiers: [bulkPricingTierSchema],
  
  // Supplier Information
  supplier: { type: supplierSchema, required: true },
  
  // Product Media
  images: [productImageSchema],
  videos: [{ type: String }],
  documents: [{
    name: { type: String },
    url: { type: String },
    type: { type: String, enum: ['specification', 'certificate', 'safety'] }
  }],
  
  // Certifications and Compliance
  certifications: [{ type: String }],
  complianceDocuments: [complianceDocumentSchema],
  
  // Order Information
  minOrder: { type: minOrderSchema, required: true },
  availability: { type: availabilitySchema, required: true },
  
  // Product Details
  nutritionHighlights: [{ type: String }],
  shelfLife: { type: String, required: true },
  packaging: [{ type: String }],
  specifications: productSpecificationsSchema,
  
  // Marketing and Visibility
  featured: { type: Boolean, default: false },
  promoted: { type: Boolean, default: false },
  tags: [{ type: String }],
  keywords: [{ type: String }],
  
  // Analytics and Performance
  viewCount: { type: Number, default: 0 },
  inquiryCount: { type: Number, default: 0 },
  sampleRequestCount: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  
  // SEO and Metadata
  seoTitle: { type: String },
  seoDescription: { type: String },
  metaTags: [{ type: String }],
  
  // Quality and Reviews
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  totalReviews: { type: Number, default: 0 },
  qualityGrade: { type: String, enum: ['A', 'B', 'C', 'D'], default: 'B' },
  
  // Status and Lifecycle
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'pending', 'discontinued'] as ProductStatus[], 
    default: 'active' 
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as ApprovalStatus[],
    default: 'pending'
  },
  
  // Timestamps
  lastViewedAt: { type: Date },
  
  // Additional dynamic fields for CSV imports
  dynamicFields: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  strict: false // Allow additional fields from CSV imports
});

// Indexes for performance
productEnhancedSchema.index({ name: 'text', description: 'text', 'supplier.name': 'text' });
productEnhancedSchema.index({ category: 1, subcategory: 1 });
productEnhancedSchema.index({ 'supplier.country': 1 });
productEnhancedSchema.index({ certifications: 1 });
productEnhancedSchema.index({ featured: 1, promoted: 1 });
productEnhancedSchema.index({ 'availability.status': 1 });
productEnhancedSchema.index({ averageRating: -1 });
productEnhancedSchema.index({ createdAt: -1 });
productEnhancedSchema.index({ 'price.min': 1, 'price.max': 1 });

// Virtual for price range display
productEnhancedSchema.virtual('priceRange').get(function(this: ProductDocument) {
  if (this.price.min === this.price.max) {
    return `${this.price.currency} ${this.price.min}/${this.price.unit}`;
  }
  return `${this.price.currency} ${this.price.min}-${this.price.max}/${this.price.unit}`;
});

// Pre-save middleware
productEnhancedSchema.pre('save', function(this: ProductDocument, next) {
  this.updatedAt = new Date();
  
  // Auto-generate SEO fields if not provided
  if (!this.seoTitle) {
    this.seoTitle = this.name;
  }
  if (!this.seoDescription) {
    this.seoDescription = this.description.substring(0, 160);
  }
  
  next();
});

// Instance methods
productEnhancedSchema.methods.incrementViewCount = function(this: ProductDocument): Promise<ProductDocument> {
  this.viewCount += 1;
  this.lastViewedAt = new Date();
  return this.save();
};

productEnhancedSchema.methods.updateRating = function(this: ProductDocument, newRating: number, reviewCount: number): Promise<ProductDocument> {
  this.averageRating = newRating;
  this.totalReviews = reviewCount;
  return this.save();
};

productEnhancedSchema.methods.checkAvailability = function(this: ProductDocument): Promise<ProductDocument> {
  if (this.availability.quantity <= 0) {
    this.availability.status = 'OutOfStock';
  } else if (this.availability.quantity <= 10) {
    this.availability.status = 'LimitedStock';
  } else {
    this.availability.status = 'InStock';
  }
  return this.save();
};

// Static methods interface
interface ProductEnhancedModel extends Model<ProductDocument> {
  findByCategory(category: string, limit?: number): Promise<ProductDocument[]>;
  findFeatured(limit?: number): Promise<ProductDocument[]>;
  searchProducts(
    searchTerm?: string, 
    filters?: Partial<MarketplaceFilters>, 
    options?: {
      page?: number;
      limit?: number;
      sortBy?: string;
    }
  ): Promise<ProductDocument[]>;
}

// Static methods
productEnhancedSchema.statics.findByCategory = function(
  this: ProductEnhancedModel,
  category: string, 
  limit: number = 20
): Promise<ProductDocument[]> {
  return this.find({ category, status: 'active' })
    .populate('supplier.id')
    .limit(limit)
    .sort({ featured: -1, averageRating: -1 });
};

productEnhancedSchema.statics.findFeatured = function(
  this: ProductEnhancedModel,
  limit: number = 10
): Promise<ProductDocument[]> {
  return this.find({ featured: true, status: 'active' })
    .populate('supplier.id')
    .limit(limit)
    .sort({ averageRating: -1, viewCount: -1 });
};

productEnhancedSchema.statics.searchProducts = function(
  this: ProductEnhancedModel,
  searchTerm?: string, 
  filters: Partial<MarketplaceFilters> = {}, 
  options: { page?: number; limit?: number; sortBy?: string } = {}
): Promise<ProductDocument[]> {
  const query: any = { status: 'active' };
  
  // Text search
  if (searchTerm) {
    query.$text = { $search: searchTerm };
  }
  
  // Apply filters
  if (filters.category) query.category = filters.category;
  if (filters.certification) query.certifications = { $in: [filters.certification] };
  if (filters.location) query['supplier.country'] = filters.location;
  if (filters.verificationLevel) query['supplier.verificationLevel'] = filters.verificationLevel;
  if (filters.availability) query['availability.status'] = filters.availability;
  
  // Price range filter
  if (filters.priceRange) {
    const [minPrice, maxPrice] = filters.priceRange.split('-').map(Number);
    if (minPrice) query['price.min'] = { $gte: minPrice };
    if (maxPrice && maxPrice !== 0) query['price.max'] = { $lte: maxPrice };
  }
  
  const { page = 1, limit = 20, sortBy = 'relevance' } = options;
  const skip = (page - 1) * limit;
  
  let sort: any = {};
  switch (sortBy) {
    case 'price_asc':
      sort = { 'price.min': 1 };
      break;
    case 'price_desc':
      sort = { 'price.min': -1 };
      break;
    case 'rating':
      sort = { averageRating: -1, totalReviews: -1 };
      break;
    case 'newest':
      sort = { createdAt: -1 };
      break;
    case 'popular':
      sort = { viewCount: -1, orderCount: -1 };
      break;
    default:
      sort = searchTerm ? { score: { $meta: 'textScore' } } : { featured: -1, averageRating: -1 };
  }
  
  return this.find(query)
    .populate('supplier.id')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Create and export the model
const ProductEnhanced = mongoose.model<ProductDocument, ProductEnhancedModel>('ProductEnhanced', productEnhancedSchema);

export default ProductEnhanced;
export { ProductEnhanced, ProductEnhancedModel };