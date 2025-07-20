import { EventEmitter } from 'events';

import mongoose from 'mongoose';

import { NotFoundError, ValidationError, ForbiddenError } from '../../core/errors';
import { Logger } from '../../core/logging/logger';
import { MetricsService } from '../../core/monitoring/metrics';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { Company } from '../../models/auth/Company';
import { User } from '../../models/auth/User';
import { Order, IOrder } from '../../models/marketplace/Order';
import { Product } from '../../models/marketplace/Product';


const logger = new Logger('OrderService');
const metrics = metricsService;

export interface OrderCreateData {
  supplier: string;
  items: Array<{
    product: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  paymentMethod: 'credit_card' | 'bank_transfer' | 'letter_of_credit' | 'other';
  paymentTerms?: string;
  requestedDeliveryDate?: Date;
  notes?: string;
}

export interface OrderUpdateData {
  status?: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber?: string;
  shippedDate?: Date;
  deliveredDate?: Date;
  cancellationReason?: string;
  notes?: string;
}

export interface OrderFilters {
  status?: string;
  buyer?: string;
  supplier?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export class OrderService extends EventEmitter {
  private readonly cache: CacheService;

  constructor() {
    super();
    this.cache = cacheService;
  }

  async createOrder(buyerId: string, data: OrderCreateData): Promise<IOrder> {
    const timer = metrics.startTimer('order_create_duration');

    try {
      logger.info('Creating new order', { buyerId, supplier: data.supplier });

      // Validate buyer
      const buyer = await User.findById(buyerId);
      if (!buyer || buyer.role !== 'buyer') {
        throw new ValidationError('Only buyers can create orders');
      }

      // Validate supplier
      const supplier = await Company.findById(data.supplier);
      if (!supplier) {
        throw new NotFoundError('Supplier', data.supplier);
      }

      // Validate products and calculate totals
      let subtotal = 0;
      const validatedItems = [];

      for (const item of data.items) {
        const product = await Product.findById(item.product);
        if (!product) {
          throw new NotFoundError('Product', item.product);
        }

        if (product.supplier.toString() !== data.supplier) {
          throw new ValidationError(`Product ${item.product} does not belong to supplier`);
        }

        if (product.status !== 'active') {
          throw new ValidationError(`Product ${product.name} is not available`);
        }

        // Check minimum order quantity
        if (item.quantity < product.minimumOrder) {
          throw new ValidationError(
            `Minimum order quantity for ${product.name} is ${product.minimumOrder}`
          );
        }

        const itemTotal = item.quantity * item.unitPrice;
        subtotal += itemTotal;

        validatedItems.push({
          product: product._id,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: itemTotal
        });
      }

      // Calculate order totals
      const tax = subtotal * 0.1; // 10% tax - should be configurable
      const shipping = 0; // Calculate based on location and weight
      const total = subtotal + tax + shipping;

      // Create order
      const order = new Order({
        orderNumber: await this.generateOrderNumber(),
        buyer: buyerId,
        supplier: data.supplier,
        items: validatedItems,
        subtotal,
        tax,
        shipping,
        total,
        shippingAddress: data.shippingAddress,
        billingAddress: data.billingAddress || data.shippingAddress,
        paymentMethod: data.paymentMethod,
        paymentTerms: data.paymentTerms,
        requestedDeliveryDate: data.requestedDeliveryDate,
        notes: data.notes,
        status: 'pending',
        statusHistory: [{
          status: 'pending',
          changedAt: new Date(),
          changedBy: buyerId,
          notes: 'Order created'
        }]
      });

      await order.save();

      // Clear caches
      await this.clearOrderCaches();

      // Emit event
      this.emit('order:created', order);

      metrics.increment('orders_created');
      metrics.recordValue('order_value', total);
      timer();

      logger.info('Order created successfully', { orderId: order._id });
      return order;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string,
    userId: string,
    updates: OrderUpdateData
  ): Promise<IOrder> {
    const timer = metrics.startTimer('order_update_duration');

    try {
      logger.info('Updating order status', { orderId, status: updates.status });

      const order = await Order.findById(orderId);
      if (!order) {
        throw new NotFoundError('Order', orderId);
      }

      // Check permissions
      const user = await User.findById(userId);
      const canUpdate =
        order.buyer.toString() === userId ||
        (user?.company && order.supplier.toString() === user.company.toString());

      if (!canUpdate) {
        throw new ForbiddenError('You do not have permission to update this order');
      }

      // Validate status transition
      if (updates.status) {
        this.validateStatusTransition(order.status, updates.status);
      }

      // Apply updates
      const previousStatus = order.status;
      Object.assign(order, updates);

      // Add to status history
      if (updates.status && updates.status !== previousStatus) {
        order.statusHistory.push({
          status: updates.status,
          previousStatus,
          changedAt: new Date(),
          changedBy: userId,
          notes: updates.notes
        });

        // Set dates based on status
        if (updates.status === 'shipped' && !order.shippedDate) {
          order.shippedDate = new Date();
        }
        if (updates.status === 'delivered' && !order.deliveredDate) {
          order.deliveredDate = new Date();
        }
        if (updates.status === 'cancelled') {
          order.cancelledAt = new Date();
          order.cancelledBy = userId;
        }
      }

      order.updatedAt = new Date();
      await order.save();

      // Clear caches
      await this.cache.delete(`order:${orderId}`);
      await this.clearOrderCaches();

      // Emit event
      this.emit('order:updated', { order, previousStatus });

      metrics.increment(`orders_${updates.status || 'updated'}`);
      timer();

      return order;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async getOrder(orderId: string, userId: string): Promise<IOrder> {
    const cacheKey = `order:${orderId}`;

    // Check cache
    const cached = await this.cache.get<IOrder>(cacheKey);
    if (cached) {
      metrics.increment('order_cache_hits');
      return cached;
    }

    const order = await Order.findById(orderId)
      .populate('buyer', 'email profile')
      .populate('supplier', 'name location')
      .populate('items.product', 'name images');

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // Check access permissions
    const user = await User.findById(userId);
    const canAccess =
      order.buyer.toString() === userId ||
      (user?.company && order.supplier.toString() === user.company.toString());

    if (!canAccess) {
      throw new ForbiddenError('You do not have access to this order');
    }

    // Cache for 30 minutes
    await this.cache.set(cacheKey, order, 1800);
    metrics.increment('order_cache_misses');

    return order;
  }

  async listOrders(
    userId: string,
    filters: OrderFilters = {},
    page: number = 1,
    limit: number = 20,
    sort: string = '-createdAt'
  ): Promise<{
    orders: IOrder[];
    total: number;
    page: number;
    pages: number;
    summary: {
      totalAmount: number;
      averageOrderValue: number;
      ordersByStatus: Record<string, number>;
    };
  }> {
    const timer = metrics.startTimer('order_list_duration');

    try {
      // Determine user role and build base query
      const user = await User.findById(userId).populate('company');
      const query: any = {};

      if (user?.role === 'buyer') {
        query.buyer = userId;
      } else if (user?.role === 'supplier' && user.company) {
        query.supplier = user.company._id;
      } else {
        throw new ForbiddenError('Invalid user role for accessing orders');
      }

      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) {
          query.createdAt.$gte = filters.dateFrom;
        }
        if (filters.dateTo) {
          query.createdAt.$lte = filters.dateTo;
        }
      }

      if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        query.total = {};
        if (filters.minAmount !== undefined) {
          query.total.$gte = filters.minAmount;
        }
        if (filters.maxAmount !== undefined) {
          query.total.$lte = filters.maxAmount;
        }
      }

      // Execute query
      const skip = (page - 1) * limit;

      const [orders, total, summary] = await Promise.all([
        Order.find(query)
          .populate('buyer', 'email profile')
          .populate('supplier', 'name location')
          .populate('items.product', 'name images')
          .sort(sort)
          .skip(skip)
          .limit(limit),
        Order.countDocuments(query),
        this.getOrdersSummary(query)
      ]);

      const result = {
        orders,
        total,
        page,
        pages: Math.ceil(total / limit),
        summary
      };

      timer();
      return result;
    } catch (error) {
      timer();
      throw error;
    }
  }

  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string
  ): Promise<IOrder> {
    logger.info('Cancelling order', { orderId, userId });

    const order = await this.getOrder(orderId, userId);

    if (order.status === 'cancelled') {
      throw new ValidationError('Order is already cancelled');
    }

    if (['shipped', 'delivered'].includes(order.status)) {
      throw new ValidationError('Cannot cancel order that has been shipped');
    }

    return this.updateOrderStatus(orderId, userId, {
      status: 'cancelled',
      cancellationReason: reason
    });
  }

  async getOrderInvoice(orderId: string, userId: string): Promise<any> {
    const order = await this.getOrder(orderId, userId);

    // Generate invoice data
    const invoice = {
      invoiceNumber: `INV-${order.orderNumber}`,
      invoiceDate: new Date(),
      order,
      dueDate: this.calculateDueDate(order)
      // Add more invoice fields as needed
    };

    return invoice;
  }

  async getOrderAnalytics(
    userId: string,
    period: 'day' | 'week' | 'month' | 'year' = 'month'
  ): Promise<any> {
    const user = await User.findById(userId).populate('company');
    const query: any = {};

    if (user?.role === 'buyer') {
      query.buyer = userId;
    } else if (user?.role === 'supplier' && user.company) {
      query.supplier = user.company._id;
    }

    // Set date range based on period
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    query.createdAt = { $gte: startDate };

    // Aggregate analytics
    const analytics = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' },
          maxOrderValue: { $max: '$total' },
          minOrderValue: { $min: '$total' }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          averageOrderValue: { $round: ['$averageOrderValue', 2] },
          maxOrderValue: { $round: ['$maxOrderValue', 2] },
          minOrderValue: { $round: ['$minOrderValue', 2] }
        }
      }
    ]);

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Orders over time
    const ordersOverTime = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'day' ? '%Y-%m-%d %H:00' : '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      period,
      dateRange: { from: startDate, to: now },
      summary: analytics[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0
      },
      ordersByStatus: ordersByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      ordersOverTime
    };
  }

  private async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Get today's order count
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const count = await Order.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `ORD-${year}${month}${day}-${sequence}`;
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: string
  ): void {
    const validTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: []
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  private calculateDueDate(order: IOrder): Date {
    const dueDate = new Date(order.createdAt);

    // Default 30 days payment terms
    let daysToAdd = 30;

    if (order.paymentTerms) {
      const match = order.paymentTerms.match(/(\d+)\s*days?/i);
      if (match) {
        daysToAdd = parseInt(match[1]);
      }
    }

    dueDate.setDate(dueDate.getDate() + daysToAdd);
    return dueDate;
  }

  private async getOrdersSummary(query: any): Promise<any> {
    const aggregation = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$total' },
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = aggregation[0] || { totalAmount: 0, count: 0 };

    return {
      totalAmount: summary.totalAmount,
      averageOrderValue: summary.count > 0 ? summary.totalAmount / summary.count : 0,
      ordersByStatus: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }

  private async clearOrderCaches(): Promise<void> {
    await this.cache.deletePattern('orders:list:*');
    await this.cache.deletePattern('orders:analytics:*');
  }
}

export default new OrderService();
