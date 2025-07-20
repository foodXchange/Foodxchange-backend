import { FilterQuery } from 'mongoose';

import { cacheService, cacheKeys } from '../config/redis';
import { Order, IOrder } from '../models/Order';

import { BaseRepository } from './base/BaseRepository';

export class OrderRepository extends BaseRepository<IOrder> {
  constructor() {
    super(Order, 'OrderRepository');
  }

  // Find orders by tenant with pagination
  async findByTenant(
    tenantId: string,
    options: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const filter: FilterQuery<IOrder> = { tenantId };

    if (options.status) {
      filter.status = options.status;
    }

    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    return this.paginate(
      filter,
      options.page || 1,
      options.limit || 20,
      { createdAt: -1 }
    );
  }

  // Find orders by buyer
  async findByBuyer(buyerId: string, tenantId: string): Promise<IOrder[]> {
    return this.findAll({
      buyer: buyerId,
      tenantId
    }, {
      sort: { createdAt: -1 }
    });
  }

  // Find orders by seller
  async findBySeller(sellerId: string, tenantId: string): Promise<IOrder[]> {
    return this.findAll({
      seller: sellerId,
      tenantId
    }, {
      sort: { createdAt: -1 }
    });
  }

  // Update order status
  async updateStatus(
    orderId: string,
    newStatus: string,
    userId: string,
    notes?: string
  ): Promise<IOrder | null> {
    const statusUpdate = {
      status: newStatus,
      timestamp: new Date(),
      updatedBy: userId,
      notes
    };

    const order = await this.model.findByIdAndUpdate(
      orderId,
      {
        $set: { status: newStatus },
        $push: { statusHistory: statusUpdate }
      },
      { new: true }
    ).exec();

    if (order) {
      // Invalidate cache
      await cacheService.del(cacheKeys.order(orderId));
    }

    return order;
  }

  // Calculate order statistics
  async getOrderStats(tenantId: string, period: 'day' | 'week' | 'month' | 'year' = 'month'): Promise<any> {
    const dateRange = this.getDateRange(period);

    const stats = await this.model.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: dateRange.start, $lte: dateRange.end }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          statusCounts: {
            $push: '$status'
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalOrders: 1,
          totalValue: 1,
          averageOrderValue: 1,
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: { $setUnion: ['$statusCounts'] },
                as: 'status',
                in: {
                  k: '$$status',
                  v: {
                    $size: {
                      $filter: {
                        input: '$statusCounts',
                        cond: { $eq: ['$$this', '$$status'] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]).exec();

    return stats[0] || {
      totalOrders: 0,
      totalValue: 0,
      averageOrderValue: 0,
      statusBreakdown: {}
    };
  }

  // Get pending orders
  async getPendingOrders(tenantId: string): Promise<IOrder[]> {
    return this.findAll({
      tenantId,
      status: { $in: ['pending', 'processing', 'confirmed'] }
    }, {
      sort: { createdAt: -1 }
    });
  }

  // Update payment status
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: string,
    paymentDetails?: any
  ): Promise<IOrder | null> {
    const update: any = {
      $set: {
        'payment.status': paymentStatus,
        'payment.updatedAt': new Date()
      }
    };

    if (paymentDetails) {
      update.$set['payment.transactionId'] = paymentDetails.transactionId;
      update.$set['payment.method'] = paymentDetails.method;
      update.$set['payment.amount'] = paymentDetails.amount;
    }

    return this.update(orderId, update);
  }

  // Add tracking information
  async addTrackingInfo(
    orderId: string,
    trackingNumber: string,
    carrier: string,
    estimatedDelivery?: Date
  ): Promise<IOrder | null> {
    return this.update(orderId, {
      $set: {
        'shipping.trackingNumber': trackingNumber,
        'shipping.carrier': carrier,
        'shipping.estimatedDelivery': estimatedDelivery,
        'shipping.shippedAt': new Date()
      }
    });
  }

  // Get orders requiring action
  async getOrdersRequiringAction(tenantId: string): Promise<IOrder[]> {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return this.findAll({
      tenantId,
      $or: [
        { status: 'pending', createdAt: { $lte: twoDaysAgo } },
        { 'payment.status': 'pending', createdAt: { $lte: twoDaysAgo } },
        { status: 'confirmed', 'shipping.shippedAt': { $exists: false } }
      ]
    });
  }

  // Helper method to get date range
  private getDateRange(period: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    return { start, end };
  }

  // Get revenue by period
  async getRevenueByPeriod(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<any[]> {
    const dateFormat = groupBy === 'day' ? '%Y-%m-%d' :
      groupBy === 'week' ? '%Y-%U' : '%Y-%m';

    return this.model.aggregate([
      {
        $match: {
          tenantId,
          status: { $in: ['completed', 'delivered'] },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).exec();
  }
}
