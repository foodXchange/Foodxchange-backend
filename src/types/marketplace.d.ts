/**
 * Marketplace Type Definitions
 */

import { Document, Types } from 'mongoose';

// Base interfaces
export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface ShippingInfo {
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: Date;
  shippingCost?: number;
  status?: 'pending' | 'shipped' | 'delivered' | 'cancelled';
}

// Product related interfaces
export interface ProductPrice {
  amount: number;
  currency: string;
  unit?: string;
  minQuantity?: number;
}

export interface BulkPricingTier {
  minQuantity: number;
  maxQuantity?: number;
  price: number;
  discount?: number;
}

export interface MinOrder {
  quantity: number;
  unit: string;
  value?: number;
}

export interface NutritionalInfo {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  [key: string]: any;
}

export interface PhysicalProperties {
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
  };
  packagingType?: string;
  shelfLife?: number;
  storageConditions?: string;
}

export interface ProductSpecifications {
  grade?: string;
  variety?: string;
  origin?: string;
  processingMethod?: string;
  certifications?: string[];
  allergens?: string[];
  ingredients?: string[];
  [key: string]: any;
}

export interface ComplianceDocument {
  type: string;
  name: string;
  url: string;
  expiryDate?: Date;
  issuedBy?: string;
  verified?: boolean;
}

export interface Supplier {
  id: Types.ObjectId;
  name: string;
  company: string;
  rating?: number;
  verified?: boolean;
  location?: Address;
}

// Enums
export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'out_of_stock',
  DISCONTINUED = 'discontinued'
}

export enum ApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REQUIRES_CHANGES = 'requires_changes'
}

export enum AvailabilityStatus {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  PRE_ORDER = 'pre_order',
  DISCONTINUED = 'discontinued'
}

export enum VerificationLevel {
  UNVERIFIED = 'unverified',
  BASIC = 'basic',
  VERIFIED = 'verified',
  PREMIUM = 'premium'
}

// Document interfaces
export interface ProductDocument extends Document {
  name: string;
  description: string;
  category: Types.ObjectId;
  subcategory?: Types.ObjectId;
  supplier: Types.ObjectId | Supplier;
  sku?: string;
  barcode?: string;
  
  pricing: {
    basePrice: ProductPrice;
    bulkPricing?: BulkPricingTier[];
    currency: string;
  };
  
  minOrder?: MinOrder;
  maxOrder?: MinOrder;
  
  images: string[];
  documents?: ComplianceDocument[];
  
  specifications?: ProductSpecifications;
  nutritionalInfo?: NutritionalInfo;
  physicalProperties?: PhysicalProperties;
  
  tags?: string[];
  keywords?: string[];
  
  status: ProductStatus;
  approvalStatus: ApprovalStatus;
  availabilityStatus: AvailabilityStatus;
  verificationLevel: VerificationLevel;
  
  inventory?: {
    available: number;
    reserved: number;
    incoming?: number;
    unit: string;
  };
  
  shipping?: {
    weight: number;
    dimensions?: {
      length: number;
      width: number;
      height: number;
    };
    methods: string[];
    restrictions?: string[];
  };
  
  ratings?: {
    average: number;
    count: number;
  };
  
  views?: number;
  inquiries?: number;
  orders?: number;
  
  featured?: boolean;
  featuredUntil?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface SampleRequestDocument extends Document {
  requestId: string;
  product: Types.ObjectId;
  buyer: Types.ObjectId;
  supplier: Types.ObjectId;
  
  quantity: number;
  unit: string;
  purpose?: string;
  message?: string;
  
  shippingAddress: Address;
  shippingInfo?: ShippingInfo;
  
  status: 'pending' | 'approved' | 'rejected' | 'shipped' | 'delivered' | 'cancelled';
  
  timeline: Array<{
    status: string;
    date: Date;
    note?: string;
    updatedBy?: Types.ObjectId;
  }>;
  
  feedback?: {
    rating: number;
    comment?: string;
    wouldOrder: boolean;
    submittedAt: Date;
  };
  
  internalNotes?: string;
  rejectionReason?: string;
  
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

// Filter interfaces
export interface MarketplaceFilters {
  category?: string | string[];
  subcategory?: string | string[];
  supplier?: string | string[];
  priceRange?: {
    min?: number;
    max?: number;
  };
  certifications?: string[];
  origin?: string[];
  status?: ProductStatus;
  availabilityStatus?: AvailabilityStatus;
  verificationLevel?: VerificationLevel;
  featured?: boolean;
  search?: string;
}

// Export type aliases for backward compatibility
export type IProduct = ProductDocument;
export type ISampleRequest = SampleRequestDocument;