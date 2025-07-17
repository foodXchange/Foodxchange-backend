import { Request, Response } from 'express';
import { getAnalyticsService } from '../services/analytics/AnalyticsService';
import { Logger } from '../core/logging/logger';
import { ValidationError } from '../core/errors/customErrors';

const logger = new Logger('AnalyticsController');

export class AnalyticsController {
  private analyticsService = getAnalyticsService();

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate, compareWith } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (compareWith) filters.compareWith = new Date(compareWith as string);

      const metrics = await this.analyticsService.getDashboardMetrics(tenantId, filters);

      res.json({
        success: true,
        data: metrics,
        message: 'Dashboard metrics retrieved successfully'
      });
    } catch (error) {
      logger.error('Get dashboard metrics error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate, category, companyId, productId, userId, groupBy } = req.query;

      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      const filters = {
        tenantId,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        category: category as string,
        companyId: companyId as string,
        productId: productId as string,
        userId: userId as string,
        groupBy: groupBy as ('day' | 'week' | 'month' | 'quarter' | 'year')
      };

      const report = await this.analyticsService.generateReport(filters);

      res.json({
        success: true,
        data: report,
        message: 'Report generated successfully'
      });
    } catch (error) {
      logger.error('Generate report error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }

  /**
   * Get real-time analytics
   */
  async getRealTimeAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const analytics = await this.analyticsService.getRealTimeAnalytics(tenantId);

      res.json({
        success: true,
        data: analytics,
        message: 'Real-time analytics retrieved successfully'
      });
    } catch (error) {
      logger.error('Get real-time analytics error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Track analytics event
   */
  async trackEvent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId;
      const eventData = {
        ...req.body,
        tenantId,
        userId,
        timestamp: new Date(),
        sessionId: req.sessionId,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      };

      await this.analyticsService.trackEvent(eventData);

      res.status(201).json({
        success: true,
        message: 'Event tracked successfully'
      });
    } catch (error) {
      logger.error('Track event error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get analytics by category
   */
  async getAnalyticsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { category } = req.params;
      const { startDate, endDate, limit = 100 } = req.query;

      const filters: any = { tenantId, category };
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      // This would be implemented in the service
      const analytics = await this.analyticsService.getAnalyticsByCategory(filters, parseInt(limit as string));

      res.json({
        success: true,
        data: analytics,
        message: 'Analytics by category retrieved successfully'
      });
    } catch (error) {
      logger.error('Get analytics by category error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get top performing products
   */
  async getTopProducts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate, limit = 10 } = req.query;

      const endDateObj = endDate ? new Date(endDate as string) : new Date();
      const startDateObj = startDate ? new Date(startDate as string) : new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);

      const topProducts = await this.analyticsService.getTopProducts(tenantId, startDateObj, endDateObj);

      res.json({
        success: true,
        data: topProducts.slice(0, parseInt(limit as string)),
        message: 'Top products retrieved successfully'
      });
    } catch (error) {
      logger.error('Get top products error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get revenue trends
   */
  async getRevenueTrends(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate, groupBy = 'month' } = req.query;

      const endDateObj = endDate ? new Date(endDate as string) : new Date();
      const startDateObj = startDate ? new Date(startDate as string) : new Date(endDateObj.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);

      const trends = await this.analyticsService.getRevenueByMonth(tenantId, startDateObj, endDateObj);

      res.json({
        success: true,
        data: trends,
        message: 'Revenue trends retrieved successfully'
      });
    } catch (error) {
      logger.error('Get revenue trends error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate } = req.query;

      const endDateObj = endDate ? new Date(endDate as string) : new Date();
      const startDateObj = startDate ? new Date(startDate as string) : new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);

      const userAnalytics = {
        activeUsers: await this.analyticsService.getActiveUsers(tenantId, startDateObj, endDateObj),
        topBuyers: await this.analyticsService.getTopBuyers(tenantId, startDateObj, endDateObj),
        topSuppliers: await this.analyticsService.getTopSuppliers(tenantId, startDateObj, endDateObj)
      };

      res.json({
        success: true,
        data: userAnalytics,
        message: 'User analytics retrieved successfully'
      });
    } catch (error) {
      logger.error('Get user analytics error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get export data for analytics
   */
  async getExportData(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { type, startDate, endDate, format = 'json' } = req.query;

      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      const filters = {
        tenantId,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      let data;
      switch (type) {
        case 'dashboard':
          data = await this.analyticsService.getDashboardMetrics(tenantId, filters);
          break;
        case 'report':
          data = await this.analyticsService.generateReport(filters);
          break;
        default:
          throw new ValidationError('Invalid export type');
      }

      // Set appropriate headers for download
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${Date.now()}.csv"`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${type}-${Date.now()}.json"`);
      }

      res.json({
        success: true,
        data,
        message: 'Export data retrieved successfully'
      });
    } catch (error) {
      logger.error('Get export data error:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: { message: error.message }
        });
      } else {
        res.status(500).json({
          success: false,
          error: { message: 'Internal server error' }
        });
      }
    }
  }
}

export default new AnalyticsController();