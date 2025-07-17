import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { getAnalyticsService } from '../../../services/analytics/AnalyticsService';
import { Order } from '../../../models/Order';
import { RFQ } from '../../../models/RFQ';
import { Product } from '../../../models/Product';
import { User } from '../../../models/User';

// Mock the models
jest.mock('../../../models/Order');
jest.mock('../../../models/RFQ');
jest.mock('../../../models/Product');
jest.mock('../../../models/User');

describe('AnalyticsService', () => {
  const analyticsService = getAnalyticsService();
  const mockTenantId = 'test-tenant-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('should track an analytics event successfully', async () => {
      const eventData = {
        tenantId: mockTenantId,
        userId: 'user-123',
        eventType: 'product_view',
        category: 'product' as const,
        data: { productId: 'prod-123', productName: 'Test Product' }
      };

      await expect(analyticsService.trackEvent(eventData)).resolves.not.toThrow();
    });

    it('should handle errors gracefully when tracking events', async () => {
      const invalidEventData = {
        tenantId: mockTenantId,
        eventType: 'invalid_event',
        category: 'invalid' as any,
        data: null
      };

      await expect(analyticsService.trackEvent(invalidEventData)).resolves.not.toThrow();
    });
  });

  describe('getDashboardMetrics', () => {
    beforeEach(() => {
      // Mock Order model methods
      (Order.countDocuments as jest.Mock).mockResolvedValue(10);
      (Order.aggregate as jest.Mock).mockResolvedValue([{ total: 1000 }]);
      
      // Mock RFQ model methods
      (RFQ.countDocuments as jest.Mock).mockResolvedValue(5);
      
      // Mock Product model methods
      (Product.countDocuments as jest.Mock).mockResolvedValue(20);
      
      // Mock User model methods
      (User.countDocuments as jest.Mock).mockResolvedValue(15);
    });

    it('should return dashboard metrics successfully', async () => {
      const mockMetrics = {
        totalRevenue: 1000,
        revenueGrowth: 10,
        totalOrders: 10,
        ordersGrowth: 5,
        totalRFQs: 5,
        rfqConversionRate: 80,
        totalProducts: 20,
        totalUsers: 15,
        activeUsers: 8,
        newUsers: 3,
        userGrowth: 20,
        complianceRate: 95,
        totalViolations: 2,
        criticalAlerts: 1
      };

      const result = await analyticsService.getDashboardMetrics(mockTenantId);

      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('totalRFQs');
      expect(result).toHaveProperty('totalProducts');
      expect(result).toHaveProperty('totalUsers');
      expect(result).toHaveProperty('complianceRate');
      expect(typeof result.totalRevenue).toBe('number');
      expect(typeof result.totalOrders).toBe('number');
    });

    it('should handle date filters correctly', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      const result = await analyticsService.getDashboardMetrics(mockTenantId, {
        startDate,
        endDate
      });

      expect(Order.countDocuments).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        createdAt: { $gte: startDate, $lte: endDate }
      });
    });
  });

  describe('generateReport', () => {
    it('should generate a comprehensive report', async () => {
      const filters = {
        tenantId: mockTenantId,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31')
      };

      const result = await analyticsService.generateReport(filters);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('financialMetrics');
      expect(result).toHaveProperty('operationalMetrics');
      expect(result).toHaveProperty('complianceMetrics');
      expect(result).toHaveProperty('trends');
      expect(result).toHaveProperty('insights');
    });

    it('should handle missing filters gracefully', async () => {
      const filters = {
        tenantId: mockTenantId,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31')
      };

      await expect(analyticsService.generateReport(filters)).resolves.not.toThrow();
    });
  });

  describe('getRealTimeAnalytics', () => {
    beforeEach(() => {
      (Order.countDocuments as jest.Mock).mockResolvedValue(5);
      (RFQ.countDocuments as jest.Mock).mockResolvedValue(3);
    });

    it('should return real-time analytics data', async () => {
      const result = await analyticsService.getRealTimeAnalytics(mockTenantId);

      expect(result).toHaveProperty('activeUsers');
      expect(result).toHaveProperty('ongoingOrders');
      expect(result).toHaveProperty('openRFQs');
      expect(result).toHaveProperty('activeAlerts');
      expect(result).toHaveProperty('recentActivity');
      expect(Array.isArray(result.recentActivity)).toBe(true);
    });
  });

  describe('getAnalyticsByCategory', () => {
    it('should return analytics events by category', async () => {
      const mockEvents = [
        {
          eventType: 'product_view',
          category: 'product',
          timestamp: new Date(),
          data: { productId: 'prod-123' }
        }
      ];

      // Mock the AnalyticsEvent model
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockEvents)
          })
        })
      });

      const filters = {
        tenantId: mockTenantId,
        category: 'product'
      };

      const result = await analyticsService.getAnalyticsByCategory(filters, 10);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('private methods', () => {
    describe('calculateTotalRevenue', () => {
      it('should calculate total revenue correctly', async () => {
        const mockAggregateResult = [{ total: 5000 }];
        (Order.aggregate as jest.Mock).mockResolvedValue(mockAggregateResult);

        const filter = { tenantId: mockTenantId };
        const result = await analyticsService['calculateTotalRevenue'](filter);

        expect(result).toBe(5000);
        expect(Order.aggregate).toHaveBeenCalledWith([
          { $match: filter },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
      });

      it('should return 0 when no orders found', async () => {
        (Order.aggregate as jest.Mock).mockResolvedValue([]);

        const filter = { tenantId: mockTenantId };
        const result = await analyticsService['calculateTotalRevenue'](filter);

        expect(result).toBe(0);
      });
    });

    describe('calculateAverageOrderValue', () => {
      it('should calculate average order value correctly', async () => {
        const mockAggregateResult = [{ avg: 125.50 }];
        (Order.aggregate as jest.Mock).mockResolvedValue(mockAggregateResult);

        const filter = { tenantId: mockTenantId };
        const result = await analyticsService['calculateAverageOrderValue'](filter);

        expect(result).toBe(125.50);
        expect(Order.aggregate).toHaveBeenCalledWith([
          { $match: filter },
          { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
        ]);
      });
    });

    describe('calculateGrowthRate', () => {
      it('should calculate positive growth rate', () => {
        const result = analyticsService['calculateGrowthRate'](120, 100);
        expect(result).toBe(20);
      });

      it('should calculate negative growth rate', () => {
        const result = analyticsService['calculateGrowthRate'](80, 100);
        expect(result).toBe(-20);
      });

      it('should handle zero previous value', () => {
        const result = analyticsService['calculateGrowthRate'](100, 0);
        expect(result).toBe(100);
      });

      it('should handle zero current value', () => {
        const result = analyticsService['calculateGrowthRate'](0, 100);
        expect(result).toBe(-100);
      });
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      (Order.countDocuments as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(analyticsService.getDashboardMetrics(mockTenantId)).rejects.toThrow('Database error');
    });

    it('should handle invalid tenant ID', async () => {
      await expect(analyticsService.getDashboardMetrics('')).rejects.toThrow();
    });
  });
});