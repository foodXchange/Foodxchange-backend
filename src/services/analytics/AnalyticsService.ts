import mongoose, { Document, Schema } from 'mongoose';
import { Logger } from '../../core/logging/logger';
import { Order } from '../../models/Order';
import { RFQ } from '../../models/RFQ';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Company } from '../../models/Company';
import { CCPMeasurement, ComplianceAlert } from '../compliance/HACCPService';

const logger = new Logger('AnalyticsService');

export interface IAnalyticsEvent extends Document {
  tenantId: string;
  userId?: mongoose.Types.ObjectId;
  eventType: string;
  category: 'order' | 'rfq' | 'product' | 'user' | 'compliance' | 'system';
  entityId?: string;
  data: any;
  timestamp: Date;
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: any;
}

export interface IDashboardMetrics {
  // Financial metrics
  totalRevenue: number;
  revenueGrowth: number;
  averageOrderValue: number;
  totalOrders: number;
  ordersGrowth: number;
  
  // RFQ metrics
  totalRFQs: number;
  rfqConversionRate: number;
  averageRFQValue: number;
  rfqGrowth: number;
  
  // Product metrics
  totalProducts: number;
  topProducts: Array<{
    productId: string;
    name: string;
    orders: number;
    revenue: number;
  }>;
  
  // User metrics
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userGrowth: number;
  
  // Compliance metrics
  complianceRate: number;
  totalViolations: number;
  criticalAlerts: number;
  
  // Performance metrics
  averageProcessingTime: number;
  systemUptime: number;
  
  // Trends
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    orders: number;
  }>;
  
  ordersByStatus: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  
  topBuyers: Array<{
    companyId: string;
    companyName: string;
    totalOrders: number;
    totalValue: number;
  }>;
  
  topSuppliers: Array<{
    companyId: string;
    companyName: string;
    totalOrders: number;
    totalValue: number;
  }>;
}

export interface IReportFilters {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  category?: string;
  companyId?: string;
  productId?: string;
  userId?: string;
  groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

// Analytics Event Schema
const analyticsEventSchema = new Schema<IAnalyticsEvent>({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: ['order', 'rfq', 'product', 'user', 'compliance', 'system'],
    required: true,
    index: true
  },
  entityId: {
    type: String,
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  sessionId: String,
  userAgent: String,
  ipAddress: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Compound indexes for better query performance
analyticsEventSchema.index({ tenantId: 1, category: 1, timestamp: -1 });
analyticsEventSchema.index({ tenantId: 1, eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ tenantId: 1, userId: 1, timestamp: -1 });
analyticsEventSchema.index({ tenantId: 1, entityId: 1, timestamp: -1 });

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema);

export class AnalyticsService {
  /**
   * Track an analytics event
   */
  async trackEvent(eventData: Partial<IAnalyticsEvent>): Promise<void> {
    try {
      const event = new AnalyticsEvent(eventData);
      await event.save();
      
      logger.debug('Analytics event tracked', {
        eventType: event.eventType,
        category: event.category,
        tenantId: event.tenantId
      });
    } catch (error) {
      logger.error('Error tracking analytics event:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(tenantId: string, filters: {
    startDate?: Date;
    endDate?: Date;
    compareWith?: Date;
  } = {}): Promise<IDashboardMetrics> {
    try {
      const endDate = filters.endDate || new Date();
      const startDate = filters.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const compareWith = filters.compareWith || new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));

      const dateFilter = {
        tenantId,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      const compareDateFilter = {
        tenantId,
        createdAt: { $gte: compareWith, $lt: startDate }
      };

      // Run all queries in parallel
      const [
        // Financial metrics
        totalRevenue,
        previousRevenue,
        totalOrders,
        previousOrders,
        averageOrderValue,
        
        // RFQ metrics
        totalRFQs,
        previousRFQs,
        rfqConversionData,
        averageRFQValue,
        
        // Product metrics
        totalProducts,
        topProducts,
        
        // User metrics
        totalUsers,
        activeUsers,
        newUsers,
        previousNewUsers,
        
        // Compliance metrics
        complianceData,
        totalViolations,
        criticalAlerts,
        
        // Trends
        revenueByMonth,
        ordersByStatus,
        topBuyers,
        topSuppliers
      ] = await Promise.all([
        // Financial metrics
        this.calculateTotalRevenue(dateFilter),
        this.calculateTotalRevenue(compareDateFilter),
        Order.countDocuments(dateFilter),
        Order.countDocuments(compareDateFilter),
        this.calculateAverageOrderValue(dateFilter),
        
        // RFQ metrics
        RFQ.countDocuments(dateFilter),
        RFQ.countDocuments(compareDateFilter),
        this.calculateRFQConversionRate(tenantId, startDate, endDate),
        this.calculateAverageRFQValue(dateFilter),
        
        // Product metrics
        Product.countDocuments({ tenantId }),
        this.getTopProducts(tenantId, startDate, endDate),
        
        // User metrics
        User.countDocuments({ tenantId }),
        this.getActiveUsers(tenantId, startDate, endDate),
        User.countDocuments(dateFilter),
        User.countDocuments(compareDateFilter),
        
        // Compliance metrics
        this.getComplianceRate(tenantId, startDate, endDate),
        CCPMeasurement.countDocuments({ ...dateFilter, status: 'violation' }),
        ComplianceAlert.countDocuments({ ...dateFilter, severity: 'critical' }),
        
        // Trends
        this.getRevenueByMonth(tenantId, startDate, endDate),
        this.getOrdersByStatus(tenantId, startDate, endDate),
        this.getTopBuyers(tenantId, startDate, endDate),
        this.getTopSuppliers(tenantId, startDate, endDate)
      ]);

      // Calculate growth rates
      const revenueGrowth = this.calculateGrowthRate(totalRevenue, previousRevenue);
      const ordersGrowth = this.calculateGrowthRate(totalOrders, previousOrders);
      const rfqGrowth = this.calculateGrowthRate(totalRFQs, previousRFQs);
      const userGrowth = this.calculateGrowthRate(newUsers, previousNewUsers);

      return {
        // Financial metrics
        totalRevenue,
        revenueGrowth,
        averageOrderValue,
        totalOrders,
        ordersGrowth,
        
        // RFQ metrics
        totalRFQs,
        rfqConversionRate: rfqConversionData.conversionRate,
        averageRFQValue,
        rfqGrowth,
        
        // Product metrics
        totalProducts,
        topProducts,
        
        // User metrics
        totalUsers,
        activeUsers,
        newUsers,
        userGrowth,
        
        // Compliance metrics
        complianceRate: complianceData.complianceRate,
        totalViolations,
        criticalAlerts,
        
        // Performance metrics
        averageProcessingTime: 0, // Would be calculated from performance data
        systemUptime: 99.9,
        
        // Trends
        revenueByMonth,
        ordersByStatus,
        topBuyers,
        topSuppliers
      };
    } catch (error) {
      logger.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(filters: IReportFilters): Promise<{
    summary: any;
    financialMetrics: any;
    operationalMetrics: any;
    complianceMetrics: any;
    trends: any;
    insights: any;
  }> {
    try {
      const dateFilter = {
        tenantId: filters.tenantId,
        createdAt: { $gte: filters.startDate, $lte: filters.endDate }
      };

      const [
        summary,
        financialMetrics,
        operationalMetrics,
        complianceMetrics,
        trends,
        insights
      ] = await Promise.all([
        this.generateSummary(dateFilter),
        this.generateFinancialMetrics(dateFilter),
        this.generateOperationalMetrics(dateFilter),
        this.generateComplianceMetrics(dateFilter),
        this.generateTrends(filters),
        this.generateInsights(filters)
      ]);

      return {
        summary,
        financialMetrics,
        operationalMetrics,
        complianceMetrics,
        trends,
        insights
      };
    } catch (error) {
      logger.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealTimeAnalytics(tenantId: string): Promise<{
    activeUsers: number;
    ongoingOrders: number;
    openRFQs: number;
    activeAlerts: number;
    recentActivity: Array<{
      type: string;
      description: string;
      timestamp: Date;
    }>;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [
        activeUsers,
        ongoingOrders,
        openRFQs,
        activeAlerts,
        recentActivity
      ] = await Promise.all([
        this.getActiveUsers(tenantId, oneHourAgo, now),
        Order.countDocuments({ tenantId, status: { $in: ['processing', 'shipped'] } }),
        RFQ.countDocuments({ tenantId, status: 'published' }),
        ComplianceAlert.countDocuments({ tenantId, status: 'active' }),
        this.getRecentActivity(tenantId, 10)
      ]);

      return {
        activeUsers,
        ongoingOrders,
        openRFQs,
        activeAlerts,
        recentActivity
      };
    } catch (error) {
      logger.error('Error getting real-time analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate total revenue
   */
  private async calculateTotalRevenue(filter: any): Promise<number> {
    const result = await Order.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    return result[0]?.total || 0;
  }

  /**
   * Calculate average order value
   */
  private async calculateAverageOrderValue(filter: any): Promise<number> {
    const result = await Order.aggregate([
      { $match: filter },
      { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
    ]);
    return result[0]?.avg || 0;
  }

  /**
   * Calculate RFQ conversion rate
   */
  private async calculateRFQConversionRate(tenantId: string, startDate: Date, endDate: Date): Promise<{
    conversionRate: number;
    totalRFQs: number;
    convertedRFQs: number;
  }> {
    const totalRFQs = await RFQ.countDocuments({
      tenantId,
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const convertedRFQs = await RFQ.countDocuments({
      tenantId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'awarded'
    });

    const conversionRate = totalRFQs > 0 ? (convertedRFQs / totalRFQs) * 100 : 0;

    return {
      conversionRate,
      totalRFQs,
      convertedRFQs
    };
  }

  /**
   * Calculate average RFQ value
   */
  private async calculateAverageRFQValue(filter: any): Promise<number> {
    const result = await RFQ.aggregate([
      { $match: filter },
      { $unwind: '$quotes' },
      { $group: { _id: null, avg: { $avg: '$quotes.totalAmount' } } }
    ]);
    return result[0]?.avg || 0;
  }

  /**
   * Get top products
   */
  private async getTopProducts(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{
    productId: string;
    name: string;
    orders: number;
    revenue: number;
  }>> {
    const result = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startDate, $lte: endDate } } },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.productId',
        name: { $first: '$items.name' },
        orders: { $sum: 1 },
        revenue: { $sum: '$items.totalPrice' }
      }},
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $project: {
        productId: '$_id',
        name: 1,
        orders: 1,
        revenue: 1,
        _id: 0
      }}
    ]);

    return result;
  }

  /**
   * Get active users
   */
  private async getActiveUsers(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
    const result = await AnalyticsEvent.aggregate([
      { $match: { tenantId, timestamp: { $gte: startDate, $lte: endDate }, userId: { $exists: true } } },
      { $group: { _id: '$userId' } },
      { $count: 'activeUsers' }
    ]);

    return result[0]?.activeUsers || 0;
  }

  /**
   * Get compliance rate
   */
  private async getComplianceRate(tenantId: string, startDate: Date, endDate: Date): Promise<{
    complianceRate: number;
    totalMeasurements: number;
    violations: number;
  }> {
    const [totalMeasurements, violations] = await Promise.all([
      CCPMeasurement.countDocuments({ tenantId, createdAt: { $gte: startDate, $lte: endDate } }),
      CCPMeasurement.countDocuments({ tenantId, createdAt: { $gte: startDate, $lte: endDate }, status: 'violation' })
    ]);

    const complianceRate = totalMeasurements > 0 ? ((totalMeasurements - violations) / totalMeasurements) * 100 : 100;

    return {
      complianceRate,
      totalMeasurements,
      violations
    };
  }

  /**
   * Get revenue by month
   */
  private async getRevenueByMonth(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{
    month: string;
    revenue: number;
    orders: number;
  }>> {
    const result = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$totalAmount' },
        orders: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $project: {
        month: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
        revenue: 1,
        orders: 1,
        _id: 0
      }}
    ]);

    return result;
  }

  /**
   * Get orders by status
   */
  private async getOrdersByStatus(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{
    status: string;
    count: number;
    percentage: number;
  }>> {
    const result = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const totalOrders = result.reduce((sum, item) => sum + item.count, 0);

    return result.map(item => ({
      status: item._id,
      count: item.count,
      percentage: totalOrders > 0 ? (item.count / totalOrders) * 100 : 0
    }));
  }

  /**
   * Get top buyers
   */
  private async getTopBuyers(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{
    companyId: string;
    companyName: string;
    totalOrders: number;
    totalValue: number;
  }>> {
    const result = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
        _id: '$buyerCompany',
        totalOrders: { $sum: 1 },
        totalValue: { $sum: '$totalAmount' }
      }},
      { $sort: { totalValue: -1 } },
      { $limit: 10 },
      { $lookup: {
        from: 'companies',
        localField: '_id',
        foreignField: '_id',
        as: 'company'
      }},
      { $unwind: '$company' },
      { $project: {
        companyId: '$_id',
        companyName: '$company.name',
        totalOrders: 1,
        totalValue: 1,
        _id: 0
      }}
    ]);

    return result;
  }

  /**
   * Get top suppliers
   */
  private async getTopSuppliers(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{
    companyId: string;
    companyName: string;
    totalOrders: number;
    totalValue: number;
  }>> {
    const result = await Order.aggregate([
      { $match: { tenantId, createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: {
        _id: '$supplierCompany',
        totalOrders: { $sum: 1 },
        totalValue: { $sum: '$totalAmount' }
      }},
      { $sort: { totalValue: -1 } },
      { $limit: 10 },
      { $lookup: {
        from: 'companies',
        localField: '_id',
        foreignField: '_id',
        as: 'company'
      }},
      { $unwind: '$company' },
      { $project: {
        companyId: '$_id',
        companyName: '$company.name',
        totalOrders: 1,
        totalValue: 1,
        _id: 0
      }}
    ]);

    return result;
  }

  /**
   * Calculate growth rate
   */
  private calculateGrowthRate(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Generate summary
   */
  private async generateSummary(filter: any): Promise<any> {
    // Implementation for summary generation
    return {
      period: `${filter.createdAt.$gte.toISOString().split('T')[0]} to ${filter.createdAt.$lte.toISOString().split('T')[0]}`,
      totalTransactions: await Order.countDocuments(filter),
      totalRevenue: await this.calculateTotalRevenue(filter)
    };
  }

  /**
   * Generate financial metrics
   */
  private async generateFinancialMetrics(filter: any): Promise<any> {
    // Implementation for financial metrics
    return {
      revenue: await this.calculateTotalRevenue(filter),
      averageOrderValue: await this.calculateAverageOrderValue(filter),
      totalOrders: await Order.countDocuments(filter)
    };
  }

  /**
   * Generate operational metrics
   */
  private async generateOperationalMetrics(filter: any): Promise<any> {
    // Implementation for operational metrics
    return {
      totalRFQs: await RFQ.countDocuments(filter),
      totalProducts: await Product.countDocuments({ tenantId: filter.tenantId }),
      totalUsers: await User.countDocuments({ tenantId: filter.tenantId })
    };
  }

  /**
   * Generate compliance metrics
   */
  private async generateComplianceMetrics(filter: any): Promise<any> {
    // Implementation for compliance metrics
    const complianceData = await this.getComplianceRate(filter.tenantId, filter.createdAt.$gte, filter.createdAt.$lte);
    return complianceData;
  }

  /**
   * Generate trends
   */
  private async generateTrends(filters: IReportFilters): Promise<any> {
    // Implementation for trends
    return {
      revenueByMonth: await this.getRevenueByMonth(filters.tenantId, filters.startDate, filters.endDate),
      ordersByStatus: await this.getOrdersByStatus(filters.tenantId, filters.startDate, filters.endDate)
    };
  }

  /**
   * Generate insights
   */
  private async generateInsights(filters: IReportFilters): Promise<any> {
    // Implementation for insights
    return {
      topProducts: await this.getTopProducts(filters.tenantId, filters.startDate, filters.endDate),
      topBuyers: await this.getTopBuyers(filters.tenantId, filters.startDate, filters.endDate),
      topSuppliers: await this.getTopSuppliers(filters.tenantId, filters.startDate, filters.endDate)
    };
  }

  /**
   * Get recent activity
   */
  private async getRecentActivity(tenantId: string, limit: number): Promise<Array<{
    type: string;
    description: string;
    timestamp: Date;
  }>> {
    const result = await AnalyticsEvent.find({ tenantId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('eventType data timestamp');

    return result.map(event => ({
      type: event.eventType,
      description: this.formatEventDescription(event.eventType, event.data),
      timestamp: event.timestamp
    }));
  }

  /**
   * Format event description
   */
  private formatEventDescription(eventType: string, data: any): string {
    switch (eventType) {
      case 'order_created':
        return `Order ${data.orderNumber} created for ${data.totalAmount} ${data.currency}`;
      case 'rfq_created':
        return `RFQ "${data.title}" created`;
      case 'product_created':
        return `Product "${data.name}" added to catalog`;
      case 'user_login':
        return `User logged in`;
      case 'compliance_violation':
        return `Compliance violation detected: ${data.violationType}`;
      default:
        return `${eventType} event occurred`;
    }
  }

  /**
   * Get analytics by category
   */
  async getAnalyticsByCategory(filters: any, limit: number = 100): Promise<IAnalyticsEvent[]> {
    try {
      const query: any = { tenantId: filters.tenantId, category: filters.category };
      
      if (filters.startDate && filters.endDate) {
        query.timestamp = { $gte: filters.startDate, $lte: filters.endDate };
      }

      const events = await AnalyticsEvent.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'name email');

      return events;
    } catch (error) {
      logger.error('Error getting analytics by category:', error);
      throw error;
    }
  }
}

// Singleton instance
let analyticsService: AnalyticsService;

export const getAnalyticsService = (): AnalyticsService => {
  if (!analyticsService) {
    analyticsService = new AnalyticsService();
  }
  return analyticsService;
};

export default getAnalyticsService();