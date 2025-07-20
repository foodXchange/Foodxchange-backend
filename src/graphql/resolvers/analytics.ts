import { AuthenticationError, ApolloError } from 'apollo-server-express';

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { Proposal } from '../../models/Proposal';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { optimizedCache } from '../../services/cache/OptimizedCacheService';
import { Context } from '../context';

const logger = new Logger('AnalyticsResolvers');

export const analyticsResolvers = {
  Query: {
    dashboardAnalytics: async (_: any, __: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const cacheKey = `dashboard:${context.user.id}:${context.user.role}`;
        const cached = await optimizedCache.get(cacheKey);
        if (cached) return cached;

        const analytics: any = {};
        const companyId = context.user.company;

        if (context.user.role === 'BUYER') {
          // Buyer analytics
          const [totalOrders, totalSpent, activeRFQs, pendingOrders] = await Promise.all([
            Order.countDocuments({ buyer: companyId }),
            Order.aggregate([
              { $match: { buyer: companyId, status: { $in: ['DELIVERED', 'COMPLETED'] } } },
              { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            RFQ.countDocuments({ buyer: companyId, status: 'ACTIVE' }),
            Order.countDocuments({ buyer: companyId, status: 'PENDING' })
          ]);

          analytics.totalOrders = totalOrders;
          analytics.totalSpent = totalSpent[0]?.total || 0;
          analytics.activeRFQs = activeRFQs;
          analytics.pendingOrders = pendingOrders;

        } else if (context.user.role === 'SELLER') {
          // Seller analytics
          const [totalSales, totalRevenue, activeProducts, pendingOrders] = await Promise.all([
            Order.countDocuments({ supplier: companyId, status: { $in: ['DELIVERED', 'COMPLETED'] } }),
            Order.aggregate([
              { $match: { supplier: companyId, status: { $in: ['DELIVERED', 'COMPLETED'] } } },
              { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Product.countDocuments({ supplier: companyId, status: 'ACTIVE' }),
            Order.countDocuments({ supplier: companyId, status: 'PENDING' })
          ]);

          analytics.totalSales = totalSales;
          analytics.totalRevenue = totalRevenue[0]?.total || 0;
          analytics.activeProducts = activeProducts;
          analytics.pendingOrders = pendingOrders;

        } else if (context.user.role === 'ADMIN') {
          // Admin analytics
          const [totalUsers, totalCompanies, totalProducts, totalOrders] = await Promise.all([
            User.countDocuments(),
            Company.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments()
          ]);

          analytics.totalUsers = totalUsers;
          analytics.totalCompanies = totalCompanies;
          analytics.totalProducts = totalProducts;
          analytics.totalOrders = totalOrders;
        }

        await optimizedCache.set(cacheKey, analytics, { ttl: 300 }); // 5 minutes
        return analytics;

      } catch (error) {
        logger.error('Failed to fetch dashboard analytics', error);
        throw new ApolloError('Failed to fetch analytics');
      }
    },

    salesAnalytics: async (_: any, { period = 'MONTH' }: any, context: Context) => {
      if (!context.isAuthenticated || !['SELLER', 'ADMIN'].includes(context.user.role)) {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const cacheKey = `sales:${context.user.id}:${period}`;
        const cached = await optimizedCache.get(cacheKey);
        if (cached) return cached;

        // Calculate date range
        const now = new Date();
        let startDate: Date;

        switch (period) {
          case 'WEEK':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'MONTH':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'QUARTER':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
          case 'YEAR':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const matchStage: any = {
          createdAt: { $gte: startDate, $lte: now },
          status: { $in: ['DELIVERED', 'COMPLETED'] }
        };

        if (context.user.role === 'SELLER') {
          matchStage.supplier = context.user.company;
        }

        const [salesData, topProducts] = await Promise.all([
          Order.aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' },
                  day: { $dayOfMonth: '$createdAt' }
                },
                revenue: { $sum: '$total' },
                orderCount: { $sum: 1 }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
          ]),
          Order.aggregate([
            { $match: matchStage },
            { $unwind: '$items' },
            {
              $group: {
                _id: '$items.product',
                totalSold: { $sum: '$items.quantity' },
                revenue: { $sum: '$items.total' }
              }
            },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'product'
              }
            },
            { $unwind: '$product' }
          ])
        ]);

        const result = {
          period,
          salesData: salesData.map(item => ({
            date: new Date(item._id.year, item._id.month - 1, item._id.day),
            revenue: item.revenue,
            orderCount: item.orderCount
          })),
          topProducts: topProducts.map(item => ({
            product: item.product,
            totalSold: item.totalSold,
            revenue: item.revenue
          })),
          totalRevenue: salesData.reduce((sum, item) => sum + item.revenue, 0),
          totalOrders: salesData.reduce((sum, item) => sum + item.orderCount, 0)
        };

        await optimizedCache.set(cacheKey, result, { ttl: 3600 }); // 1 hour
        return result;

      } catch (error) {
        logger.error('Failed to fetch sales analytics', error);
        throw new ApolloError('Failed to fetch sales analytics');
      }
    },

    rfqAnalytics: async (_: any, { period = 'MONTH' }: any, context: Context) => {
      if (!context.isAuthenticated) {
        throw new AuthenticationError('Not authenticated');
      }

      try {
        const cacheKey = `rfq:${context.user.id}:${period}`;
        const cached = await optimizedCache.get(cacheKey);
        if (cached) return cached;

        // Calculate date range
        const now = new Date();
        let startDate: Date;

        switch (period) {
          case 'WEEK':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'MONTH':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const matchStage: any = {
          createdAt: { $gte: startDate, $lte: now }
        };

        if (context.user.role === 'BUYER') {
          matchStage.buyer = context.user.company;
        }

        const [rfqStats, proposalStats] = await Promise.all([
          RFQ.aggregate([
            { $match: matchStage },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ]),
          Proposal.aggregate([
            {
              $lookup: {
                from: 'rfqs',
                localField: 'rfq',
                foreignField: '_id',
                as: 'rfqData'
              }
            },
            { $unwind: '$rfqData' },
            {
              $match: {
                'rfqData.createdAt': { $gte: startDate, $lte: now },
                ...(context.user.role === 'BUYER' ? { 'rfqData.buyer': context.user.company } : {}),
                ...(context.user.role === 'SELLER' ? { supplier: context.user.company } : {})
              }
            },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 }
              }
            }
          ])
        ]);

        const result = {
          period,
          rfqStats: rfqStats.reduce((acc: any, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          proposalStats: proposalStats.reduce((acc: any, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          totalRFQs: rfqStats.reduce((sum, item) => sum + item.count, 0),
          totalProposals: proposalStats.reduce((sum, item) => sum + item.count, 0)
        };

        await optimizedCache.set(cacheKey, result, { ttl: 3600 }); // 1 hour
        return result;

      } catch (error) {
        logger.error('Failed to fetch RFQ analytics', error);
        throw new ApolloError('Failed to fetch RFQ analytics');
      }
    },

    marketAnalytics: async (_: any, __: any, context: Context) => {
      if (!context.isAuthenticated || context.user.role !== 'ADMIN') {
        throw new AuthenticationError('Not authorized');
      }

      try {
        const cacheKey = 'market:analytics';
        const cached = await optimizedCache.get(cacheKey);
        if (cached) return cached;

        const [categoryStats, companyStats, monthlyGrowth] = await Promise.all([
          Product.aggregate([
            {
              $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'categoryData'
              }
            },
            { $unwind: '$categoryData' },
            {
              $group: {
                _id: '$categoryData.name',
                productCount: { $sum: 1 },
                avgPrice: { $avg: '$price.amount' }
              }
            },
            { $sort: { productCount: -1 } }
          ]),
          Company.aggregate([
            {
              $group: {
                _id: '$type',
                count: { $sum: 1 }
              }
            }
          ]),
          Order.aggregate([
            {
              $group: {
                _id: {
                  year: { $year: '$createdAt' },
                  month: { $month: '$createdAt' }
                },
                orderCount: { $sum: 1 },
                revenue: { $sum: '$total' }
              }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
            { $limit: 12 }
          ])
        ]);

        const result = {
          categoryStats,
          companyStats: companyStats.reduce((acc: any, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          monthlyGrowth: monthlyGrowth.map(item => ({
            month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
            orderCount: item.orderCount,
            revenue: item.revenue
          }))
        };

        await optimizedCache.set(cacheKey, result, { ttl: 7200 }); // 2 hours
        return result;

      } catch (error) {
        logger.error('Failed to fetch market analytics', error);
        throw new ApolloError('Failed to fetch market analytics');
      }
    }
  }
};
