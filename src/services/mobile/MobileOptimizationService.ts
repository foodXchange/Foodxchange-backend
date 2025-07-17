import { Logger } from '../../core/logging/logger';
import { Product } from '../../models/Product';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { getAnalyticsService } from '../analytics/AnalyticsService';

const logger = new Logger('MobileOptimizationService');

export interface IMobileProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  images: string[];
  supplier: {
    id: string;
    name: string;
    rating: number;
  };
  availability: string;
  minOrder: number;
  unit: string;
  isOrganic: boolean;
  isCertified: boolean;
  location: string;
}

export interface IMobileOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    image?: string;
  }>;
  supplier: {
    id: string;
    name: string;
  };
  estimatedDelivery: string;
  tracking?: {
    status: string;
    location: string;
    lastUpdate: string;
  };
  createdAt: string;
}

export interface IMobileRFQ {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  budget: number;
  currency: string;
  deadline: string;
  quotesCount: number;
  location: string;
  createdAt: string;
}

export interface IMobileDashboard {
  stats: {
    totalOrders: number;
    pendingOrders: number;
    activeRFQs: number;
    totalSpent: number;
    currency: string;
  };
  recentOrders: IMobileOrder[];
  recentRFQs: IMobileRFQ[];
  featuredProducts: IMobileProduct[];
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    timestamp: string;
    read: boolean;
  }>;
}

export class MobileOptimizationService {
  private analyticsService = getAnalyticsService();

  /**
   * Get mobile-optimized product list with pagination
   */
  async getMobileProducts(
    tenantId: string,
    filters: {
      category?: string;
      search?: string;
      priceRange?: { min: number; max: number };
      location?: string;
      organic?: boolean;
      certified?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    products: IMobileProduct[];
    totalCount: number;
    hasMore: boolean;
    nextPage?: number;
  }> {
    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 50); // Max 50 items per page
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { tenantId, isActive: true };
      
      if (filters.category) {
        query.category = filters.category;
      }
      
      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } },
          { category: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      if (filters.priceRange) {
        query.price = {
          $gte: filters.priceRange.min,
          $lte: filters.priceRange.max
        };
      }
      
      if (filters.location) {
        query.location = { $regex: filters.location, $options: 'i' };
      }
      
      if (filters.organic !== undefined) {
        query.isOrganic = filters.organic;
      }
      
      if (filters.certified !== undefined) {
        query.isCertified = filters.certified;
      }

      // Execute query with optimized fields
      const [products, totalCount] = await Promise.all([
        Product.find(query)
          .select('name description price currency category images supplier availability minOrderQuantity unit isOrganic isCertified location rating')
          .populate('supplier', 'name rating location')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query)
      ]);

      // Transform to mobile format
      const mobileProducts: IMobileProduct[] = products.map(product => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description.substring(0, 150) + '...', // Truncate for mobile
        price: product.price,
        currency: product.currency,
        category: product.category,
        images: product.images?.slice(0, 3) || [], // Limit images for mobile
        supplier: {
          id: product.supplier._id.toString(),
          name: product.supplier.name,
          rating: product.supplier.rating || 0
        },
        availability: product.availability,
        minOrder: product.minOrderQuantity,
        unit: product.unit,
        isOrganic: product.isOrganic || false,
        isCertified: product.isCertified || false,
        location: product.location || product.supplier.location || ''
      }));

      const hasMore = totalCount > skip + limit;
      const nextPage = hasMore ? page + 1 : undefined;

      return {
        products: mobileProducts,
        totalCount,
        hasMore,
        nextPage
      };
    } catch (error) {
      logger.error('Error getting mobile products:', error);
      throw error;
    }
  }

  /**
   * Get mobile-optimized order list
   */
  async getMobileOrders(
    tenantId: string,
    userId: string,
    filters: {
      status?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    orders: IMobileOrder[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 50);
      const skip = (page - 1) * limit;

      const query: any = { tenantId, buyer: userId };
      if (filters.status) {
        query.status = filters.status;
      }

      const [orders, totalCount] = await Promise.all([
        Order.find(query)
          .select('orderNumber status totalAmount currency items supplier estimatedDelivery tracking createdAt')
          .populate('supplier', 'name')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Order.countDocuments(query)
      ]);

      const mobileOrders: IMobileOrder[] = orders.map(order => ({
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        currency: order.currency,
        items: order.items.slice(0, 3).map(item => ({
          id: item.productId.toString(),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          image: item.image
        })),
        supplier: {
          id: order.supplier._id.toString(),
          name: order.supplier.name
        },
        estimatedDelivery: order.estimatedDelivery?.toISOString() || '',
        tracking: order.tracking ? {
          status: order.tracking.status,
          location: order.tracking.location,
          lastUpdate: order.tracking.lastUpdate?.toISOString() || ''
        } : undefined,
        createdAt: order.createdAt.toISOString()
      }));

      const hasMore = totalCount > skip + limit;

      return {
        orders: mobileOrders,
        totalCount,
        hasMore
      };
    } catch (error) {
      logger.error('Error getting mobile orders:', error);
      throw error;
    }
  }

  /**
   * Get mobile-optimized RFQ list
   */
  async getMobileRFQs(
    tenantId: string,
    userId: string,
    filters: {
      status?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    rfqs: IMobileRFQ[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 50);
      const skip = (page - 1) * limit;

      const query: any = { tenantId, buyer: userId };
      if (filters.status) {
        query.status = filters.status;
      }

      const [rfqs, totalCount] = await Promise.all([
        RFQ.find(query)
          .select('title description category status budget currency deadline quotes location createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        RFQ.countDocuments(query)
      ]);

      const mobileRFQs: IMobileRFQ[] = rfqs.map(rfq => ({
        id: rfq._id.toString(),
        title: rfq.title,
        description: rfq.description.substring(0, 100) + '...', // Truncate for mobile
        category: rfq.category,
        status: rfq.status,
        budget: rfq.budget,
        currency: rfq.currency,
        deadline: rfq.deadline.toISOString(),
        quotesCount: rfq.quotes?.length || 0,
        location: rfq.location,
        createdAt: rfq.createdAt.toISOString()
      }));

      const hasMore = totalCount > skip + limit;

      return {
        rfqs: mobileRFQs,
        totalCount,
        hasMore
      };
    } catch (error) {
      logger.error('Error getting mobile RFQs:', error);
      throw error;
    }
  }

  /**
   * Get mobile dashboard with essential information
   */
  async getMobileDashboard(tenantId: string, userId: string): Promise<IMobileDashboard> {
    try {
      const [
        totalOrders,
        pendingOrders,
        activeRFQs,
        totalSpent,
        recentOrders,
        recentRFQs,
        featuredProducts
      ] = await Promise.all([
        Order.countDocuments({ tenantId, buyer: userId }),
        Order.countDocuments({ tenantId, buyer: userId, status: { $in: ['pending', 'processing'] } }),
        RFQ.countDocuments({ tenantId, buyer: userId, status: 'published' }),
        Order.aggregate([
          { $match: { tenantId, buyer: userId, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]).then(result => result[0]?.total || 0),
        this.getMobileOrders(tenantId, userId, { limit: 5 }),
        this.getMobileRFQs(tenantId, userId, { limit: 5 }),
        this.getMobileProducts(tenantId, { limit: 6 })
      ]);

      // Get user's currency preference
      const user = await User.findById(userId).select('currency').lean();
      const currency = user?.currency || 'USD';

      return {
        stats: {
          totalOrders,
          pendingOrders,
          activeRFQs,
          totalSpent,
          currency
        },
        recentOrders: recentOrders.orders,
        recentRFQs: recentRFQs.rfqs,
        featuredProducts: featuredProducts.products,
        notifications: [] // Would be populated from notification service
      };
    } catch (error) {
      logger.error('Error getting mobile dashboard:', error);
      throw error;
    }
  }

  /**
   * Get mobile-optimized product details
   */
  async getMobileProductDetails(tenantId: string, productId: string): Promise<IMobileProduct & {
    fullDescription: string;
    specifications: any;
    reviews: Array<{
      id: string;
      user: string;
      rating: number;
      comment: string;
      date: string;
    }>;
    relatedProducts: IMobileProduct[];
  }> {
    try {
      const product = await Product.findOne({ _id: productId, tenantId })
        .populate('supplier', 'name rating location')
        .lean();

      if (!product) {
        throw new Error('Product not found');
      }

      // Get related products
      const relatedProducts = await this.getMobileProducts(tenantId, {
        category: product.category,
        limit: 4
      });

      // Transform to mobile format with extended details
      const mobileProduct = {
        id: product._id.toString(),
        name: product.name,
        description: product.description.substring(0, 150) + '...',
        fullDescription: product.description,
        price: product.price,
        currency: product.currency,
        category: product.category,
        images: product.images || [],
        supplier: {
          id: product.supplier._id.toString(),
          name: product.supplier.name,
          rating: product.supplier.rating || 0
        },
        availability: product.availability,
        minOrder: product.minOrderQuantity,
        unit: product.unit,
        isOrganic: product.isOrganic || false,
        isCertified: product.isCertified || false,
        location: product.location || product.supplier.location || '',
        specifications: product.specifications || {},
        reviews: [], // Would be populated from reviews service
        relatedProducts: relatedProducts.products.filter(p => p.id !== productId)
      };

      return mobileProduct;
    } catch (error) {
      logger.error('Error getting mobile product details:', error);
      throw error;
    }
  }

  /**
   * Get mobile-optimized search suggestions
   */
  async getMobileSearchSuggestions(
    tenantId: string,
    query: string,
    limit: number = 10
  ): Promise<{
    products: Array<{ id: string; name: string; category: string; price: number }>;
    categories: string[];
    suppliers: Array<{ id: string; name: string; location: string }>;
  }> {
    try {
      const searchRegex = { $regex: query, $options: 'i' };
      
      const [products, categories, suppliers] = await Promise.all([
        Product.find({
          tenantId,
          isActive: true,
          $or: [
            { name: searchRegex },
            { description: searchRegex }
          ]
        })
        .select('name category price')
        .limit(limit)
        .lean(),
        
        Product.distinct('category', {
          tenantId,
          isActive: true,
          category: searchRegex
        }).limit(5),
        
        Company.find({
          tenantId,
          name: searchRegex,
          type: 'supplier'
        })
        .select('name location')
        .limit(5)
        .lean()
      ]);

      return {
        products: products.map(p => ({
          id: p._id.toString(),
          name: p.name,
          category: p.category,
          price: p.price
        })),
        categories,
        suppliers: suppliers.map(s => ({
          id: s._id.toString(),
          name: s.name,
          location: s.location || ''
        }))
      };
    } catch (error) {
      logger.error('Error getting mobile search suggestions:', error);
      throw error;
    }
  }

  /**
   * Track mobile app usage
   */
  async trackMobileUsage(
    tenantId: string,
    userId: string,
    eventType: string,
    data: any
  ): Promise<void> {
    try {
      await this.analyticsService.trackEvent({
        tenantId,
        userId,
        eventType: `mobile_${eventType}`,
        category: 'mobile',
        data: {
          ...data,
          platform: 'mobile',
          timestamp: new Date()
        }
      });
    } catch (error) {
      logger.error('Error tracking mobile usage:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }
}

// Singleton instance
let mobileOptimizationService: MobileOptimizationService;

export const getMobileOptimizationService = (): MobileOptimizationService => {
  if (!mobileOptimizationService) {
    mobileOptimizationService = new MobileOptimizationService();
  }
  return mobileOptimizationService;
};

export default getMobileOptimizationService();