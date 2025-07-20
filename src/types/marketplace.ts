// File: C:\Users\foodz\Documents\GitHub\Development\FDX-frontend\src\types\marketplace.ts

// ===== SHARED INTERFACES (Frontend + Backend) =====

export interface ProductImage {
  url: string;
  alt: string;
  isPrimary: boolean;
}

export type ProductAvailability = 'In Stock' | 'Limited Stock' | 'Out of Stock' | 'Pre-Order';

export interface Price {
  currency: string;
  amount: number;
  unit?: string;
}

export interface MinimumOrder {
  quantity: number;
  unit: string;
}

export interface SupplierInfo {
  id: string;
  name: string;
  country: string;
  verified: boolean;
  rating: {
    average: number;
    count: number;
  };
}

export interface Product {
  id: string;
  name: string;
  description: string;
  supplier: SupplierInfo;
  images: ProductImage[];
  category: string;
  subcategory?: string;
  price: Price;
  certifications: string[];
  minOrder: MinimumOrder;
  availability: ProductAvailability;
  nutritionHighlights?: string[];
  shelfLife?: string;
  packaging?: string[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  pricePerUnit: Price;
  totalPrice: Price;
  notes?: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  totalItems: number;
  subtotal: Price;
  shipping?: Price;
  tax?: Price;
  total: Price;
  createdAt: Date;
  updatedAt: Date;
}

// Search and filtering
export interface ProductFilters {
  category?: string[];
  certifications?: string[];
  priceRange?: {
    min: number;
    max: number;
  };
  availability?: ProductAvailability[];
  country?: string[];
  minOrderQuantity?: {
    min: number;
    max: number;
  };
}

export interface SearchParams {
  query?: string;
  filters?: ProductFilters;
  sortBy?: 'relevance' | 'price' | 'rating' | 'newest';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
