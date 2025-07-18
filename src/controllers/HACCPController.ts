import { Request, Response } from 'express';
import { getHACCPService } from '../services/compliance/HACCPService';
import { Logger } from '../core/logging/logger';
import { ValidationError, AuthorizationError, NotFoundError } from '../core/errors';

const logger = new Logger('HACCPController');

export class HACCPController {
  private haccpService = getHACCPService();

  /**
   * Get HACCP dashboard data
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const dashboardData = await this.haccpService.getDashboardData(tenantId);

      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      logger.error('Get HACCP dashboard error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Create Critical Control Point
   */
  async createCCP(req: Request, res: Response): Promise<void> {
    try {
      const ccpData = {
        ...req.body,
        tenantId: req.tenantId,
        createdBy: req.userId
      };

      const ccp = await this.haccpService.createCCP(ccpData);

      res.status(201).json({
        success: true,
        data: ccp,
        message: 'Critical Control Point created successfully'
      });
    } catch (error) {
      logger.error('Create CCP error:', error);
      
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
   * Record CCP measurement
   */
  async recordMeasurement(req: Request, res: Response): Promise<void> {
    try {
      const measurementData = {
        ...req.body,
        tenantId: req.tenantId,
        recordedBy: req.userId
      };

      const measurement = await this.haccpService.recordMeasurement(measurementData);

      res.status(201).json({
        success: true,
        data: measurement,
        message: 'CCP measurement recorded successfully'
      });
    } catch (error) {
      logger.error('Record measurement error:', error);
      
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
   * Get CCP measurements
   */
  async getMeasurements(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const filters = {
        ...req.query,
        tenantId
      };

      const result = await this.haccpService.getCCPMeasurements(tenantId, filters);

      res.json({
        success: true,
        data: result.measurements,
        totalCount: result.totalCount
      });
    } catch (error) {
      logger.error('Get measurements error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get compliance alerts
   */
  async getAlerts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const filters = {
        ...req.query,
        tenantId
      };

      const result = await this.haccpService.getComplianceAlerts(tenantId, filters);

      res.json({
        success: true,
        data: result.alerts,
        totalCount: result.totalCount
      });
    } catch (error) {
      logger.error('Get alerts error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Acknowledge compliance alert
   */
  async acknowledgeAlert(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.userId!;

      const alert = await this.haccpService.acknowledgeAlert(id, userId);

      res.json({
        success: true,
        data: alert,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      logger.error('Acknowledge alert error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
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
   * Resolve compliance alert
   */
  async resolveAlert(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const resolution = req.body;

      const alert = await this.haccpService.resolveAlert(id, userId, resolution);

      res.json({
        success: true,
        data: alert,
        message: 'Alert resolved successfully'
      });
    } catch (error) {
      logger.error('Resolve alert error:', error);
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
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
   * Generate compliance report
   */
  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      const report = await this.haccpService.generateComplianceReport(
        tenantId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        data: report
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
}

export default new HACCPController();