import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { AnalyticsController } from '../../../controllers/AnalyticsController';
import { getAnalyticsService } from '../../../services/analytics/AnalyticsService';

// Mock the analytics service
jest.mock('../../../services/analytics/AnalyticsService');

describe('AnalyticsController', () => {
  let analyticsController: AnalyticsController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockAnalyticsService: any;

  beforeEach(() => {
    analyticsController = new AnalyticsController();
    mockAnalyticsService = getAnalyticsService();
    
    mockRequest = {
      tenantId: 'test-tenant-123',
      userId: 'user-123',
      query: {},
      body: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  describe('getDashboardMetrics', () => {
    it('should return dashboard metrics successfully', async () => {
      const mockMetrics = {
        totalRevenue: 10000,
        revenueGrowth: 15,
        totalOrders: 50,
        ordersGrowth: 10,
        totalRFQs: 25,
        rfqConversionRate: 80,
        totalProducts: 100,
        totalUsers: 20,
        activeUsers: 15,
        newUsers: 5,
        userGrowth: 25,
        complianceRate: 95,
        totalViolations: 3,
        criticalAlerts: 1
      };

      mockAnalyticsService.getDashboardMetrics.mockResolvedValue(mockMetrics);

      await analyticsController.getDashboardMetrics(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getDashboardMetrics).toHaveBeenCalledWith('test-tenant-123', {});
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockMetrics,
        message: 'Dashboard metrics retrieved successfully'
      });
    });

    it('should handle query parameters correctly', async () => {
      mockRequest.query = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        compareWith: '2022-01-01'
      };

      const expectedFilters = {
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        compareWith: new Date('2022-01-01')
      };

      mockAnalyticsService.getDashboardMetrics.mockResolvedValue({});

      await analyticsController.getDashboardMetrics(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getDashboardMetrics).toHaveBeenCalledWith('test-tenant-123', expectedFilters);
    });

    it('should handle service errors', async () => {
      mockAnalyticsService.getDashboardMetrics.mockRejectedValue(new Error('Service error'));

      await analyticsController.getDashboardMetrics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Internal server error' }
      });
    });
  });

  describe('generateReport', () => {
    it('should generate report successfully', async () => {
      const mockReport = {
        summary: { totalTransactions: 100, totalRevenue: 50000 },
        financialMetrics: { revenue: 50000, averageOrderValue: 500 },
        operationalMetrics: { totalRFQs: 20, totalProducts: 150 },
        complianceMetrics: { complianceRate: 95 },
        trends: { revenueByMonth: [] },
        insights: { topProducts: [] }
      };

      mockRequest.query = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        category: 'all'
      };

      mockAnalyticsService.generateReport.mockResolvedValue(mockReport);

      await analyticsController.generateReport(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.generateReport).toHaveBeenCalledWith({
        tenantId: 'test-tenant-123',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        category: 'all'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockReport,
        message: 'Report generated successfully'
      });
    });

    it('should handle missing required parameters', async () => {
      mockRequest.query = {}; // No startDate and endDate

      await analyticsController.generateReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Start date and end date are required' }
      });
    });

    it('should handle invalid date formats', async () => {
      mockRequest.query = {
        startDate: 'invalid-date',
        endDate: '2023-12-31'
      };

      await analyticsController.generateReport(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Internal server error' }
      });
    });
  });

  describe('getRealTimeAnalytics', () => {
    it('should return real-time analytics successfully', async () => {
      const mockRealTimeData = {
        activeUsers: 25,
        ongoingOrders: 10,
        openRFQs: 5,
        activeAlerts: 2,
        recentActivity: [
          {
            type: 'order_created',
            description: 'New order created',
            timestamp: new Date()
          }
        ]
      };

      mockAnalyticsService.getRealTimeAnalytics.mockResolvedValue(mockRealTimeData);

      await analyticsController.getRealTimeAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getRealTimeAnalytics).toHaveBeenCalledWith('test-tenant-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockRealTimeData,
        message: 'Real-time analytics retrieved successfully'
      });
    });
  });

  describe('trackEvent', () => {
    it('should track event successfully', async () => {
      mockRequest.body = {
        eventType: 'product_view',
        category: 'product',
        data: { productId: 'prod-123' }
      };
      mockRequest.sessionId = 'session-123';
      mockRequest.ip = '127.0.0.1';
      mockRequest.get = jest.fn().mockReturnValue('Mozilla/5.0');

      mockAnalyticsService.trackEvent.mockResolvedValue(undefined);

      await analyticsController.trackEvent(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.trackEvent).toHaveBeenCalledWith({
        eventType: 'product_view',
        category: 'product',
        data: { productId: 'prod-123' },
        tenantId: 'test-tenant-123',
        userId: 'user-123',
        timestamp: expect.any(Date),
        sessionId: 'session-123',
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Event tracked successfully'
      });
    });

    it('should handle missing event data', async () => {
      mockRequest.body = {}; // No eventType

      await analyticsController.trackEvent(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Internal server error' }
      });
    });
  });

  describe('getAnalyticsByCategory', () => {
    it('should return analytics by category successfully', async () => {
      const mockAnalytics = [
        {
          eventType: 'product_view',
          category: 'product',
          timestamp: new Date(),
          data: { productId: 'prod-123' }
        }
      ];

      mockRequest.params = { category: 'product' };
      mockRequest.query = { limit: '50' };

      mockAnalyticsService.getAnalyticsByCategory.mockResolvedValue(mockAnalytics);

      await analyticsController.getAnalyticsByCategory(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getAnalyticsByCategory).toHaveBeenCalledWith({
        tenantId: 'test-tenant-123',
        category: 'product'
      }, 50);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockAnalytics,
        message: 'Analytics by category retrieved successfully'
      });
    });
  });

  describe('getTopProducts', () => {
    it('should return top products successfully', async () => {
      const mockTopProducts = [
        {
          productId: 'prod-1',
          name: 'Product 1',
          orders: 50,
          revenue: 2500
        },
        {
          productId: 'prod-2',
          name: 'Product 2',
          orders: 35,
          revenue: 1750
        }
      ];

      mockRequest.query = { limit: '5' };

      mockAnalyticsService.getTopProducts.mockResolvedValue(mockTopProducts);

      await analyticsController.getTopProducts(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getTopProducts).toHaveBeenCalledWith(
        'test-tenant-123',
        expect.any(Date),
        expect.any(Date)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTopProducts.slice(0, 5),
        message: 'Top products retrieved successfully'
      });
    });

    it('should handle date range parameters', async () => {
      mockRequest.query = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        limit: '10'
      };

      mockAnalyticsService.getTopProducts.mockResolvedValue([]);

      await analyticsController.getTopProducts(mockRequest as Request, mockResponse as Response);

      expect(mockAnalyticsService.getTopProducts).toHaveBeenCalledWith(
        'test-tenant-123',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );
    });
  });

  describe('getUserAnalytics', () => {
    it('should return user analytics successfully', async () => {
      const mockUserAnalytics = {
        activeUsers: 15,
        topBuyers: [
          { companyId: 'comp-1', companyName: 'Company 1', totalOrders: 25, totalValue: 5000 }
        ],
        topSuppliers: [
          { companyId: 'comp-2', companyName: 'Company 2', totalOrders: 30, totalValue: 6000 }
        ]
      };

      mockAnalyticsService.getActiveUsers.mockResolvedValue(15);
      mockAnalyticsService.getTopBuyers.mockResolvedValue(mockUserAnalytics.topBuyers);
      mockAnalyticsService.getTopSuppliers.mockResolvedValue(mockUserAnalytics.topSuppliers);

      await analyticsController.getUserAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockUserAnalytics,
        message: 'User analytics retrieved successfully'
      });
    });
  });

  describe('getExportData', () => {
    it('should return export data successfully', async () => {
      const mockExportData = {
        totalRevenue: 50000,
        totalOrders: 200,
        averageOrderValue: 250
      };

      mockRequest.query = {
        type: 'dashboard',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        format: 'json'
      };

      mockAnalyticsService.getDashboardMetrics.mockResolvedValue(mockExportData);

      await analyticsController.getExportData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockExportData,
        message: 'Export data retrieved successfully'
      });
    });

    it('should handle missing required parameters', async () => {
      mockRequest.query = { type: 'dashboard' }; // Missing startDate and endDate

      await analyticsController.getExportData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Start date and end date are required' }
      });
    });

    it('should handle invalid export type', async () => {
      mockRequest.query = {
        type: 'invalid',
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      };

      await analyticsController.getExportData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Invalid export type' }
      });
    });
  });
});