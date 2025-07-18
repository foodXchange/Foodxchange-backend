import { Product, IProduct } from '../models/Product';
import { BaseRepository } from './base/BaseRepository';
import { FilterQuery } from 'mongoose';
import { cacheService, cacheKeys } from '../config/redis';

export class ProductRepository extends BaseRepository<IProduct> {
  constructor() {
    super(Product, 'ProductRepository');
  }

  // Override findById to use cache
  async findById(id: string): Promise<IProduct | null> {
    const cacheKey = cacheKeys.product(id);
    
    // Try cache first
    const cached = await cacheService.get<IProduct>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for product ${id}`);
      return cached;
    }
    
    // Fetch from database
    const product = await super.findById(id);
    
    // Cache the result
    if (product) {
      await cacheService.set(cacheKey, product, 3600); // 1 hour
    }
    
    return product;
  }

  // Search products with text search
  async searchProducts(
    tenantId: string,
    query: string,
    options: {
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      inStock?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const filter: FilterQuery<IProduct> = {
      tenantId,
      status: 'active',
      isPublished: true
    };

    if (query) {
      filter.$text = { $search: query };
    }

    if (options.category) {
      filter.category = options.category;
    }

    if (options.minPrice || options.maxPrice) {
      filter['pricing.basePrice'] = {};
      if (options.minPrice) filter['pricing.basePrice'].$gte = options.minPrice;
      if (options.maxPrice) filter['pricing.basePrice'].$lte = options.maxPrice;
    }

    if (options.inStock) {
      filter['inventory.availableQuantity'] = { $gt: 0 };
    }

    const page = options.page || 1;
    const limit = options.limit || 20;

    return this.paginate(filter, page, limit, { score: { $meta: 'textScore' } });
  }

  // Find products by supplier
  async findBySupplier(supplierId: string, tenantId: string): Promise<IProduct[]> {
    return this.findAll({
      supplier: supplierId,
      tenantId,
      status: 'active'
    });
  }

  // Update inventory
  async updateInventory(
    productId: string,
    quantity: number,
    operation: 'add' | 'subtract' | 'set'
  ): Promise<IProduct | null> {
    const updateQuery: any = {};
    
    switch (operation) {
      case 'add':
        updateQuery.$inc = {
          'inventory.quantity': quantity,
          'inventory.availableQuantity': quantity
        };
        break;
      case 'subtract':
        updateQuery.$inc = {
          'inventory.quantity': -quantity,
          'inventory.availableQuantity': -quantity
        };
        break;
      case 'set':
        updateQuery.$set = {
          'inventory.quantity': quantity,
          'inventory.availableQuantity': quantity
        };
        break;
    }

    const product = await this.model.findByIdAndUpdate(
      productId,
      updateQuery,
      { new: true }
    ).exec();

    // Invalidate cache
    if (product) {
      await cacheService.del(cacheKeys.product(productId));
    }

    return product;
  }

  // Get featured products
  async getFeaturedProducts(tenantId: string, limit: number = 10): Promise<IProduct[]> {
    return this.findAll(
      {
        tenantId,
        status: 'active',
        isPublished: true,
        'marketing.featured': true
      },
      {
        limit,
        sort: { 'analytics.averageRating': -1 }
      }
    );
  }

  // Get products by category
  async getByCategory(
    tenantId: string,
    category: string,
    subcategory?: string
  ): Promise<IProduct[]> {
    const filter: FilterQuery<IProduct> = {
      tenantId,
      category,
      status: 'active',
      isPublished: true
    };

    if (subcategory) {
      filter.subcategory = subcategory;
    }

    return this.findAll(filter);
  }

  // Bulk update prices
  async bulkUpdatePrices(
    updates: Array<{ productId: string; newPrice: number }>
  ): Promise<number> {
    let updated = 0;

    for (const { productId, newPrice } of updates) {
      const result = await this.update(productId, {
        $set: { 'pricing.basePrice': newPrice }
      });
      
      if (result) {
        updated++;
        await cacheService.del(cacheKeys.product(productId));
      }
    }

    return updated;
  }

  // Get low stock products
  async getLowStockProducts(tenantId: string, threshold: number = 10): Promise<IProduct[]> {
    return this.findAll({
      tenantId,
      status: 'active',
      'inventory.trackInventory': true,
      'inventory.availableQuantity': { $lte: threshold }
    });
  }

  // Update product analytics
  async incrementView(productId: string): Promise<void> {
    await this.model.findByIdAndUpdate(productId, {
      $inc: { 'analytics.views': 1 }
    }).exec();
  }

  async updateRating(productId: string, newRating: number, reviewCount: number): Promise<void> {
    await this.update(productId, {
      $set: {
        'analytics.averageRating': newRating,
        'analytics.totalReviews': reviewCount
      }
    });
    
    await cacheService.del(cacheKeys.product(productId));
  }
}