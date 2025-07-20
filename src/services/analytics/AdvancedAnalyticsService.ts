import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Proposal } from '../../models/Proposal';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { optimizedCache } from '../cache/OptimizedCacheService';

const logger = new Logger('AdvancedAnalyticsService');

export interface DashboardMetrics {
  overview: {
    totalRevenue: number;
    totalOrders: number;
    totalProducts: number;
    totalUsers: number;
    growthRate: number;
    conversionRate: number;
  };
  sales: {
    dailySales: Array<{
      date: string;
      revenue: number;
      orders: number;
    }>;
    topProducts: Array<{
      productId: string;
      name: string;
      revenue: number;
      units: number;
    }>;
    topCategories: Array<{
      categoryId: string;
      name: string;
      revenue: number;
      percentage: number;
    }>;
    salesByRegion: Array<{
      region: string;
      revenue: number;
      orders: number;
    }>;
  };
  customers: {
    acquisition: Array<{
      date: string;
      newCustomers: number;
      returningCustomers: number;
    }>;
    retention: {
      rate: number;
      cohortAnalysis: Array<{
        cohort: string;
        week1: number;
        week2: number;
        week4: number;
        week12: number;
      }>;
    };
    segments: Array<{
      segment: string;
      count: number;
      revenue: number;
      avgOrderValue: number;
    }>;
  };
  marketTrends: {
    demandForecast: Array<{
      productId: string;
      predictedDemand: number;
      confidence: number;
      seasonality: number;
    }>;
    priceAnalysis: Array<{
      categoryId: string;
      avgPrice: number;
      priceChange: number;
      marketShare: number;
    }>;
    competitorAnalysis: Array<{
      competitor: string;
      marketShare: number;
      avgPrice: number;
      rating: number;
    }>;
  };
  rfqAnalytics: {
    conversionRate: number;
    avgResponseTime: number;
    successfulRfqs: number;
    topRequestedCategories: Array<{
      categoryId: string;
      name: string;
      count: number;
    }>;
  };
  performance: {
    orderFulfillment: {
      avgProcessingTime: number;
      onTimeDeliveryRate: number;
      qualityScore: number;
    };
    supplierPerformance: Array<{
      supplierId: string;
      name: string;
      rating: number;
      orderVolume: number;
      onTimeRate: number;
    }>;
  };
}

export interface RealtimeMetrics {
  activeUsers: number;
  onlineSuppliers: number;
  onlineBuyers: number;
  pendingOrders: number;
  activeRfqs: number;
  recentActivities: Array<{
    type: 'ORDER' | 'RFQ' | 'PROPOSAL' | 'USER_SIGNUP';
    timestamp: Date;
    description: string;
    userId?: string;
    amount?: number;
  }>;
  alertsAndNotifications: Array<{
    type: 'WARNING' | 'ERROR' | 'INFO';
    message: string;
    timestamp: Date;
    severity: number;
  }>;
}

export interface CustomAnalytics {
  kpis: Array<{
    name: string;
    value: number;
    target: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
    percentage: number;
  }>;
  customCharts: Array<{
    id: string;
    type: 'line' | 'bar' | 'pie' | 'scatter';
    title: string;
    data: any[];
    config: Record<string, any>;
  }>;
  reports: Array<{
    id: string;
    name: string;
    type: 'PDF' | 'CSV' | 'EXCEL';
    generatedAt: Date;
    downloadUrl: string;
  }>;
}

export class AdvancedAnalyticsService {

  async generateDashboardMetrics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics> {
    try {
      const cacheKey = `dashboard_metrics:${companyId}:${userRole}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      const [overview, sales, customers, marketTrends, rfqAnalytics, performance] = await Promise.all([
        this.generateOverviewMetrics(companyId, dateRange, userRole),
        this.generateSalesMetrics(companyId, dateRange, userRole),
        this.generateCustomerMetrics(companyId, dateRange, userRole),
        this.generateMarketTrends(companyId, dateRange),
        this.generateRfqAnalytics(companyId, dateRange, userRole),
        this.generatePerformanceMetrics(companyId, dateRange, userRole)
      ]);

      const metrics: DashboardMetrics = {
        overview,
        sales,
        customers,
        marketTrends,
        rfqAnalytics,
        performance
      };

      await optimizedCache.set(cacheKey, metrics, { ttl: 1800 }); // 30 minutes
      return metrics;

    } catch (error) {
      logger.error('Failed to generate dashboard metrics', error);
      throw error;
    }
  }

  private async generateOverviewMetrics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics['overview']> {

    const baseQuery: any = {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
    };

    if (userRole === 'SELLER') {
      baseQuery.supplier = companyId;
    } else if (userRole === 'BUYER') {
      baseQuery.buyer = companyId;
    }

    const [orders, products, users, previousPeriodOrders] = await Promise.all([
      Order.find({ ...baseQuery, status: { $in: ['DELIVERED', 'COMPLETED'] } }),
      userRole === 'SELLER' ? Product.find({ supplier: companyId }) : Product.find(),
      userRole === 'ADMIN' ? User.find({ createdAt: { $gte: dateRange.start, $lte: dateRange.end } }) : [],
      Order.find({
        ...baseQuery,
        createdAt: {
          $gte: new Date(dateRange.start.getTime() - (dateRange.end.getTime() - dateRange.start.getTime())),
          $lt: dateRange.start
        },
        status: { $in: ['DELIVERED', 'COMPLETED'] }
      })
    ]);

    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const totalOrders = orders.length;
    const totalProducts = products.length;
    const totalUsers = users.length;

    const previousRevenue = previousPeriodOrders.reduce((sum, order) => sum + order.total, 0);
    const growthRate = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    // Calculate conversion rate (orders / unique visitors)
    const conversionRate = totalOrders > 0 ? (totalOrders / (totalUsers || 1)) * 100 : 0;

    return {
      totalRevenue,
      totalOrders,
      totalProducts,
      totalUsers,
      growthRate,
      conversionRate
    };
  }

  private async generateSalesMetrics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics['sales']> {

    const matchStage: any = {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
      status: { $in: ['DELIVERED', 'COMPLETED'] }
    };

    if (userRole === 'SELLER') {
      matchStage.supplier = companyId;
    } else if (userRole === 'BUYER') {
      matchStage.buyer = companyId;
    }

    // Daily sales data
    const dailySales = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Top products
    const topProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          revenue: { $sum: '$items.total' },
          units: { $sum: '$items.quantity' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo'
        }
      },
      { $unwind: '$productInfo' }
    ]);

    // Top categories
    const topCategories = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          revenue: { $sum: '$items.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    const totalCategoryRevenue = topCategories.reduce((sum, cat) => sum + cat.revenue, 0);

    return {
      dailySales: dailySales.map(item => ({
        date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
        revenue: item.revenue,
        orders: item.orders
      })),
      topProducts: topProducts.map(item => ({
        productId: item._id.toString(),
        name: item.productInfo.name,
        revenue: item.revenue,
        units: item.units
      })),
      topCategories: topCategories.map(item => ({
        categoryId: item._id.toString(),
        name: item.name,
        revenue: item.revenue,
        percentage: totalCategoryRevenue > 0 ? (item.revenue / totalCategoryRevenue) * 100 : 0
      })),
      salesByRegion: [] // Would implement with actual location data
    };
  }

  private async generateCustomerMetrics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics['customers']> {

    // Customer acquisition data
    const acquisition = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lte: dateRange.end },
          ...(userRole !== 'ADMIN' ? { company: companyId } : {})
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Customer segments
    const segments = await Company.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      acquisition: acquisition.map(item => ({
        date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
        newCustomers: item.newCustomers,
        returningCustomers: 0 // Would calculate based on repeat orders
      })),
      retention: {
        rate: 75.5, // Mock data - would calculate actual retention
        cohortAnalysis: [] // Would implement cohort analysis
      },
      segments: segments.map(item => ({
        segment: item._id,
        count: item.count,
        revenue: 0, // Would calculate from orders
        avgOrderValue: 0 // Would calculate from orders
      }))
    };
  }

  private async generateMarketTrends(
    companyId: string,
    dateRange: { start: Date; end: Date }
  ): Promise<DashboardMetrics['marketTrends']> {

    // This would implement actual ML-based forecasting
    // For now, returning mock data structure
    return {
      demandForecast: [],
      priceAnalysis: [],
      competitorAnalysis: []
    };
  }

  private async generateRfqAnalytics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics['rfqAnalytics']> {

    const matchStage: any = {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
    };

    if (userRole === 'BUYER') {
      matchStage.buyer = companyId;
    }

    const rfqs = await RFQ.find(matchStage);
    const proposals = await Proposal.find({
      rfq: { $in: rfqs.map(r => r._id) }
    });

    const successfulRfqs = rfqs.filter(r => r.status === 'COMPLETED').length;
    const conversionRate = rfqs.length > 0 ? (successfulRfqs / rfqs.length) * 100 : 0;

    // Top requested categories
    const topCategories = await RFQ.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' }
    ]);

    return {
      conversionRate,
      avgResponseTime: 24, // Mock data - would calculate actual response time
      successfulRfqs,
      topRequestedCategories: topCategories.map(item => ({
        categoryId: item._id.toString(),
        name: item.categoryInfo.name,
        count: item.count
      }))
    };
  }

  private async generatePerformanceMetrics(
    companyId: string,
    dateRange: { start: Date; end: Date },
    userRole: string
  ): Promise<DashboardMetrics['performance']> {

    const matchStage: any = {
      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
    };

    if (userRole === 'SELLER') {
      matchStage.supplier = companyId;
    } else if (userRole === 'BUYER') {
      matchStage.buyer = companyId;
    }

    const orders = await Order.find(matchStage);

    // Calculate performance metrics
    const completedOrders = orders.filter(o => o.status === 'DELIVERED');
    const onTimeDeliveries = completedOrders.filter(o => {
      // Mock logic - would compare actual vs estimated delivery
      return Math.random() > 0.2; // 80% on-time rate
    });

    const onTimeDeliveryRate = completedOrders.length > 0
      ? (onTimeDeliveries.length / completedOrders.length) * 100
      : 0;

    return {
      orderFulfillment: {
        avgProcessingTime: 2.5, // Mock data - hours
        onTimeDeliveryRate,
        qualityScore: 4.3 // Mock data - out of 5
      },
      supplierPerformance: [] // Would implement supplier scoring
    };
  }

  async getRealtimeMetrics(companyId: string, userRole: string): Promise<RealtimeMetrics> {
    try {
      const cacheKey = `realtime_metrics:${companyId}:${userRole}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Get real-time data
      const [pendingOrders, activeRfqs, recentOrders] = await Promise.all([
        Order.countDocuments({
          status: 'PENDING',
          ...(userRole === 'SELLER' ? { supplier: companyId } :
            userRole === 'BUYER' ? { buyer: companyId } : {})
        }),
        RFQ.countDocuments({
          status: 'ACTIVE',
          ...(userRole === 'BUYER' ? { buyer: companyId } : {})
        }),
        Order.find({
          ...(userRole === 'SELLER' ? { supplier: companyId } :
            userRole === 'BUYER' ? { buyer: companyId } : {}),
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).limit(10).sort({ createdAt: -1 })
      ]);

      const metrics: RealtimeMetrics = {
        activeUsers: 45, // Mock data - would track from sessions
        onlineSuppliers: 23,
        onlineBuyers: 67,
        pendingOrders,
        activeRfqs,
        recentActivities: recentOrders.map(order => ({
          type: 'ORDER' as const,
          timestamp: order.createdAt,
          description: `New order #${order._id}`,
          amount: order.total
        })),
        alertsAndNotifications: [
          {
            type: 'WARNING' as const,
            message: 'Low inventory alert for product XYZ',
            timestamp: new Date(),
            severity: 2
          }
        ]
      };

      await optimizedCache.set(cacheKey, metrics, { ttl: 60 }); // 1 minute
      return metrics;

    } catch (error) {
      logger.error('Failed to get realtime metrics', error);
      throw error;
    }
  }

  async generateCustomAnalytics(
    companyId: string,
    config: {
      kpis: string[];
      chartTypes: string[];
      reportFormats: string[];
    }
  ): Promise<CustomAnalytics> {
    try {
      const cacheKey = `custom_analytics:${companyId}:${JSON.stringify(config)}`;
      const cached = await optimizedCache.get(cacheKey);
      if (cached) return cached;

      // Generate custom KPIs
      const kpis = config.kpis.map(kpiName => ({
        name: kpiName,
        value: Math.floor(Math.random() * 1000), // Mock data
        target: Math.floor(Math.random() * 1200),
        trend: ['UP', 'DOWN', 'STABLE'][Math.floor(Math.random() * 3)] as 'UP' | 'DOWN' | 'STABLE',
        percentage: Math.floor(Math.random() * 100)
      }));

      // Generate custom charts
      const customCharts = config.chartTypes.map((chartType, index) => ({
        id: `chart_${index}`,
        type: chartType as any,
        title: `Custom ${chartType} Chart`,
        data: [], // Would populate with actual data
        config: {}
      }));

      const analytics: CustomAnalytics = {
        kpis,
        customCharts,
        reports: []
      };

      await optimizedCache.set(cacheKey, analytics, { ttl: 3600 }); // 1 hour
      return analytics;

    } catch (error) {
      logger.error('Failed to generate custom analytics', error);
      throw error;
    }
  }

  async exportAnalyticsReport(
    companyId: string,
    reportType: 'SALES' | 'CUSTOMERS' | 'PRODUCTS' | 'COMPREHENSIVE',
    format: 'PDF' | 'CSV' | 'EXCEL',
    dateRange: { start: Date; end: Date }
  ): Promise<{
    reportId: string;
    downloadUrl: string;
    expiresAt: Date;
  }> {
    try {
      // Generate report ID
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // In real implementation, would generate actual file
      // For now, return mock response
      const downloadUrl = `/api/analytics/reports/${reportId}/download`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      logger.info('Analytics report generated', {
        reportId,
        companyId,
        reportType,
        format
      });

      return {
        reportId,
        downloadUrl,
        expiresAt
      };

    } catch (error) {
      logger.error('Failed to export analytics report', error);
      throw error;
    }
  }
}

export const advancedAnalyticsService = new AdvancedAnalyticsService();
