import { Request, Response } from 'express';
import { getExportService } from '../services/export/ExportService';
import { Logger } from '../core/logging/logger';
import { ValidationError } from '../core/errors';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger('ExportController');

export class ExportController {
  private exportService = getExportService();

  /**
   * Export products
   */
  async exportProducts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        fields,
        includeRelated = false,
        fileName,
        ...filters
      } = req.query;

      if (!['csv', 'excel', 'json'].includes(format as string)) {
        throw new ValidationError('Invalid export format. Supported formats: csv, excel, json');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        fields: fields ? (fields as string).split(',') : undefined,
        includeRelated: includeRelated === 'true',
        fileName: fileName as string,
        filters
      };

      const result = await this.exportService.exportProducts(tenantId, options);

      res.json({
        success: true,
        data: result,
        message: 'Products export completed successfully'
      });
    } catch (error) {
      logger.error('Export products error:', error);
      
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
   * Export orders
   */
  async exportOrders(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        fields,
        includeRelated = false,
        fileName,
        ...filters
      } = req.query;

      if (!['csv', 'excel', 'json'].includes(format as string)) {
        throw new ValidationError('Invalid export format. Supported formats: csv, excel, json');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        fields: fields ? (fields as string).split(',') : undefined,
        includeRelated: includeRelated === 'true',
        fileName: fileName as string,
        filters
      };

      const result = await this.exportService.exportOrders(tenantId, options);

      res.json({
        success: true,
        data: result,
        message: 'Orders export completed successfully'
      });
    } catch (error) {
      logger.error('Export orders error:', error);
      
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
   * Export RFQs
   */
  async exportRFQs(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        fields,
        includeRelated = false,
        fileName,
        ...filters
      } = req.query;

      if (!['csv', 'excel', 'json'].includes(format as string)) {
        throw new ValidationError('Invalid export format. Supported formats: csv, excel, json');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        fields: fields ? (fields as string).split(',') : undefined,
        includeRelated: includeRelated === 'true',
        fileName: fileName as string,
        filters
      };

      const result = await this.exportService.exportRFQs(tenantId, options);

      res.json({
        success: true,
        data: result,
        message: 'RFQs export completed successfully'
      });
    } catch (error) {
      logger.error('Export RFQs error:', error);
      
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
   * Export analytics data
   */
  async exportAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        reportType = 'dashboard',
        startDate,
        endDate,
        fields,
        fileName
      } = req.query;

      if (!['csv', 'excel', 'json'].includes(format as string)) {
        throw new ValidationError('Invalid export format. Supported formats: csv, excel, json');
      }

      if (!['dashboard', 'comprehensive', 'custom'].includes(reportType as string)) {
        throw new ValidationError('Invalid report type. Supported types: dashboard, comprehensive, custom');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        reportType: reportType as 'dashboard' | 'comprehensive' | 'custom',
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        fields: fields ? (fields as string).split(',') : undefined,
        fileName: fileName as string
      };

      const result = await this.exportService.exportAnalytics(tenantId, options);

      res.json({
        success: true,
        data: result,
        message: 'Analytics export completed successfully'
      });
    } catch (error) {
      logger.error('Export analytics error:', error);
      
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
   * Import products
   */
  async importProducts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        validateOnly = false,
        batchSize = 100,
        skipErrors = false,
        mapping
      } = req.body;

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      if (!['csv', 'excel', 'json'].includes(format)) {
        throw new ValidationError('Invalid import format. Supported formats: csv, excel, json');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        validateOnly: validateOnly === 'true' || validateOnly === true,
        batchSize: parseInt(batchSize as string) || 100,
        skipErrors: skipErrors === 'true' || skipErrors === true,
        mapping: mapping ? JSON.parse(mapping) : undefined
      };

      const result = await this.exportService.importProducts(
        tenantId,
        req.file.path,
        options
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        data: result,
        message: options.validateOnly ? 'Products validation completed' : 'Products import completed successfully'
      });
    } catch (error) {
      logger.error('Import products error:', error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
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
   * Import orders
   */
  async importOrders(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const {
        format = 'csv',
        validateOnly = false,
        batchSize = 100,
        skipErrors = false,
        mapping
      } = req.body;

      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      if (!['csv', 'excel', 'json'].includes(format)) {
        throw new ValidationError('Invalid import format. Supported formats: csv, excel, json');
      }

      const options = {
        format: format as 'csv' | 'excel' | 'json',
        validateOnly: validateOnly === 'true' || validateOnly === true,
        batchSize: parseInt(batchSize as string) || 100,
        skipErrors: skipErrors === 'true' || skipErrors === true,
        mapping: mapping ? JSON.parse(mapping) : undefined
      };

      const result = await this.exportService.importOrders(
        tenantId,
        req.file.path,
        options
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        data: result,
        message: options.validateOnly ? 'Orders validation completed' : 'Orders import completed successfully'
      });
    } catch (error) {
      logger.error('Import orders error:', error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
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
   * Get export template
   */
  async getExportTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { dataType, format = 'csv' } = req.params;

      if (!['products', 'orders', 'rfqs', 'users'].includes(dataType)) {
        throw new ValidationError('Invalid data type. Supported types: products, orders, rfqs, users');
      }

      if (!['csv', 'excel'].includes(format)) {
        throw new ValidationError('Invalid template format. Supported formats: csv, excel');
      }

      const result = await this.exportService.getExportTemplate(
        dataType as 'products' | 'orders' | 'rfqs' | 'users',
        format as 'csv' | 'excel'
      );

      res.json({
        success: true,
        data: result,
        message: 'Export template generated successfully'
      });
    } catch (error) {
      logger.error('Get export template error:', error);
      
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
   * Download export file
   */
  async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const { fileName } = req.params;
      const exportDir = process.env.EXPORT_DIR || './exports';
      const filePath = path.join(exportDir, fileName);

      // Security check - ensure file is within export directory
      const resolvedPath = path.resolve(filePath);
      const resolvedExportDir = path.resolve(exportDir);
      
      if (!resolvedPath.startsWith(resolvedExportDir)) {
        throw new ValidationError('Invalid file path');
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          error: { message: 'File not found' }
        });
      }

      // Set appropriate headers
      const ext = path.extname(fileName).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.xlsx':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        case '.json':
          contentType = 'application/json';
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Stream the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

      // Clean up file after download (optional)
      fileStream.on('end', () => {
        // Uncomment to delete file after download
        // fs.unlinkSync(filePath);
      });
    } catch (error) {
      logger.error('Download file error:', error);
      
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
   * Get import/export history
   */
  async getExportHistory(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { page = 1, limit = 20, type } = req.query;

      // This would typically come from a database table tracking export/import history
      // For now, returning mock data
      const history = {
        exports: [
          {
            id: 'exp_001',
            type: 'products',
            format: 'csv',
            status: 'completed',
            recordCount: 150,
            fileName: 'products_export_2023-12-01.csv',
            createdAt: '2023-12-01T10:00:00Z',
            downloadUrl: '/api/v1/export/download/products_export_2023-12-01.csv'
          },
          {
            id: 'exp_002',
            type: 'orders',
            format: 'excel',
            status: 'completed',
            recordCount: 75,
            fileName: 'orders_export_2023-12-01.xlsx',
            createdAt: '2023-12-01T09:00:00Z',
            downloadUrl: '/api/v1/export/download/orders_export_2023-12-01.xlsx'
          }
        ],
        imports: [
          {
            id: 'imp_001',
            type: 'products',
            format: 'csv',
            status: 'completed',
            totalRecords: 200,
            successfulRecords: 195,
            failedRecords: 5,
            createdAt: '2023-11-30T15:00:00Z'
          }
        ]
      };

      res.json({
        success: true,
        data: type ? history[type as keyof typeof history] : history,
        message: 'Export/import history retrieved successfully'
      });
    } catch (error) {
      logger.error('Get export history error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Get supported export formats and fields
   */
  async getExportOptions(req: Request, res: Response): Promise<void> {
    try {
      const { dataType } = req.params;

      const options = {
        formats: ['csv', 'excel', 'json'],
        fields: this.getAvailableFields(dataType),
        filters: this.getAvailableFilters(dataType)
      };

      res.json({
        success: true,
        data: options,
        message: 'Export options retrieved successfully'
      });
    } catch (error) {
      logger.error('Get export options error:', error);
      res.status(500).json({
        success: false,
        error: { message: 'Internal server error' }
      });
    }
  }

  /**
   * Helper methods
   */
  private getAvailableFields(dataType: string): string[] {
    switch (dataType) {
      case 'products':
        return [
          'id', 'name', 'description', 'category', 'price', 'currency', 'unit',
          'minOrderQuantity', 'availability', 'location', 'isOrganic', 'isCertified',
          'supplier.name', 'supplier.email', 'createdAt', 'updatedAt'
        ];
      case 'orders':
        return [
          'id', 'orderNumber', 'status', 'totalAmount', 'currency',
          'buyer.name', 'buyer.email', 'supplier.name', 'supplier.email',
          'itemCount', 'createdAt', 'updatedAt'
        ];
      case 'rfqs':
        return [
          'id', 'title', 'description', 'category', 'status', 'budget', 'currency',
          'deadline', 'buyer.name', 'buyer.email', 'quotesCount', 'createdAt', 'updatedAt'
        ];
      default:
        return [];
    }
  }

  private getAvailableFilters(dataType: string): any {
    switch (dataType) {
      case 'products':
        return {
          category: 'string',
          supplier: 'string',
          minPrice: 'number',
          maxPrice: 'number',
          isActive: 'boolean',
          startDate: 'date',
          endDate: 'date'
        };
      case 'orders':
        return {
          status: 'string',
          buyer: 'string',
          supplier: 'string',
          minAmount: 'number',
          maxAmount: 'number',
          startDate: 'date',
          endDate: 'date'
        };
      case 'rfqs':
        return {
          status: 'string',
          category: 'string',
          buyer: 'string',
          minBudget: 'number',
          maxBudget: 'number',
          startDate: 'date',
          endDate: 'date'
        };
      default:
        return {};
    }
  }
}

export default new ExportController();