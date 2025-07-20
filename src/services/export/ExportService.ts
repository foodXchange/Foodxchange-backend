import * as csv from 'csv-writer';
import { createObjectCsvWriter } from 'csv-writer';
import * as XLSX from 'xlsx';

import { Logger } from '../../core/logging/logger';
import { Company } from '../../models/Company';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { RFQ } from '../../models/RFQ';
import { User } from '../../models/User';
import { getAnalyticsService } from '../analytics/AnalyticsService';

const logger = new Logger('ExportService');

export interface IExportOptions {
  format: 'csv' | 'excel' | 'json';
  filters?: any;
  fields?: string[];
  includeRelated?: boolean;
  fileName?: string;
}

export interface IExportResult {
  fileName: string;
  filePath: string;
  format: string;
  recordCount: number;
  fileSize: number;
  downloadUrl: string;
}

export interface IImportOptions {
  format: 'csv' | 'excel' | 'json';
  validateOnly?: boolean;
  batchSize?: number;
  skipErrors?: boolean;
  mapping?: { [key: string]: string };
}

export interface IImportResult {
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value: any;
  }>;
  warnings: Array<{
    row: number;
    field: string;
    message: string;
    value: any;
  }>;
}

export class ExportService {
  private readonly analyticsService = getAnalyticsService();

  /**
   * Export products to various formats
   */
  async exportProducts(
    tenantId: string,
    options: IExportOptions
  ): Promise<IExportResult> {
    try {
      logger.info('Starting product export', { tenantId, format: options.format });

      // Build query with filters
      const query = this.buildProductQuery(tenantId, options.filters);

      // Get products with optional population
      const products = await Product.find(query)
        .populate(options.includeRelated ? 'supplier' : '')
        .lean();

      // Transform data based on selected fields
      const transformedData = this.transformProductData(products, options.fields);

      // Generate export file
      const result = await this.generateExportFile(
        'products',
        transformedData,
        options
      );

      // Track export event
      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_export',
        category: 'export',
        data: {
          type: 'products',
          format: options.format,
          recordCount: products.length,
          filters: options.filters
        }
      });

      logger.info('Product export completed', {
        tenantId,
        recordCount: products.length,
        format: options.format
      });

      return result;
    } catch (error) {
      logger.error('Error exporting products:', error);
      throw error;
    }
  }

  /**
   * Export orders to various formats
   */
  async exportOrders(
    tenantId: string,
    options: IExportOptions
  ): Promise<IExportResult> {
    try {
      logger.info('Starting order export', { tenantId, format: options.format });

      const query = this.buildOrderQuery(tenantId, options.filters);

      const orders = await Order.find(query)
        .populate(options.includeRelated ? ['buyer', 'supplier', 'items.productId'] : '')
        .lean();

      const transformedData = this.transformOrderData(orders, options.fields);

      const result = await this.generateExportFile(
        'orders',
        transformedData,
        options
      );

      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_export',
        category: 'export',
        data: {
          type: 'orders',
          format: options.format,
          recordCount: orders.length,
          filters: options.filters
        }
      });

      logger.info('Order export completed', {
        tenantId,
        recordCount: orders.length,
        format: options.format
      });

      return result;
    } catch (error) {
      logger.error('Error exporting orders:', error);
      throw error;
    }
  }

  /**
   * Export RFQs to various formats
   */
  async exportRFQs(
    tenantId: string,
    options: IExportOptions
  ): Promise<IExportResult> {
    try {
      logger.info('Starting RFQ export', { tenantId, format: options.format });

      const query = this.buildRFQQuery(tenantId, options.filters);

      const rfqs = await RFQ.find(query)
        .populate(options.includeRelated ? ['buyer', 'quotes.supplier'] : '')
        .lean();

      const transformedData = this.transformRFQData(rfqs, options.fields);

      const result = await this.generateExportFile(
        'rfqs',
        transformedData,
        options
      );

      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_export',
        category: 'export',
        data: {
          type: 'rfqs',
          format: options.format,
          recordCount: rfqs.length,
          filters: options.filters
        }
      });

      logger.info('RFQ export completed', {
        tenantId,
        recordCount: rfqs.length,
        format: options.format
      });

      return result;
    } catch (error) {
      logger.error('Error exporting RFQs:', error);
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    tenantId: string,
    options: IExportOptions & {
      reportType: 'dashboard' | 'comprehensive' | 'custom';
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<IExportResult> {
    try {
      logger.info('Starting analytics export', { tenantId, format: options.format });

      let analyticsData: any;

      switch (options.reportType) {
        case 'dashboard':
          analyticsData = await this.analyticsService.getDashboardMetrics(tenantId, {
            startDate: options.startDate,
            endDate: options.endDate
          });
          break;
        case 'comprehensive':
          analyticsData = await this.analyticsService.generateReport({
            tenantId,
            startDate: options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: options.endDate || new Date()
          });
          break;
        default:
          throw new Error('Invalid report type');
      }

      const transformedData = this.transformAnalyticsData(analyticsData, options.fields);

      const result = await this.generateExportFile(
        'analytics',
        transformedData,
        options
      );

      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_export',
        category: 'export',
        data: {
          type: 'analytics',
          format: options.format,
          reportType: options.reportType,
          dateRange: {
            startDate: options.startDate,
            endDate: options.endDate
          }
        }
      });

      logger.info('Analytics export completed', {
        tenantId,
        format: options.format,
        reportType: options.reportType
      });

      return result;
    } catch (error) {
      logger.error('Error exporting analytics:', error);
      throw error;
    }
  }

  /**
   * Import products from various formats
   */
  async importProducts(
    tenantId: string,
    filePath: string,
    options: IImportOptions
  ): Promise<IImportResult> {
    try {
      logger.info('Starting product import', { tenantId, format: options.format });

      // Parse file based on format
      const rawData = await this.parseImportFile(filePath, options.format);

      // Transform and validate data
      const validatedData = await this.validateProductData(rawData, options.mapping);

      if (options.validateOnly) {
        return {
          totalRecords: rawData.length,
          successfulRecords: validatedData.validRecords.length,
          failedRecords: validatedData.invalidRecords.length,
          errors: validatedData.errors,
          warnings: validatedData.warnings
        };
      }

      // Import data in batches
      const result = await this.importProductsInBatches(
        tenantId,
        validatedData.validRecords,
        options
      );

      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_import',
        category: 'import',
        data: {
          type: 'products',
          format: options.format,
          totalRecords: rawData.length,
          successfulRecords: result.successfulRecords,
          failedRecords: result.failedRecords
        }
      });

      logger.info('Product import completed', {
        tenantId,
        totalRecords: rawData.length,
        successful: result.successfulRecords,
        failed: result.failedRecords
      });

      return {
        totalRecords: rawData.length,
        successfulRecords: result.successfulRecords,
        failedRecords: result.failedRecords,
        errors: [...validatedData.errors, ...result.errors],
        warnings: validatedData.warnings
      };
    } catch (error) {
      logger.error('Error importing products:', error);
      throw error;
    }
  }

  /**
   * Import orders from various formats
   */
  async importOrders(
    tenantId: string,
    filePath: string,
    options: IImportOptions
  ): Promise<IImportResult> {
    try {
      logger.info('Starting order import', { tenantId, format: options.format });

      const rawData = await this.parseImportFile(filePath, options.format);
      const validatedData = await this.validateOrderData(rawData, options.mapping);

      if (options.validateOnly) {
        return {
          totalRecords: rawData.length,
          successfulRecords: validatedData.validRecords.length,
          failedRecords: validatedData.invalidRecords.length,
          errors: validatedData.errors,
          warnings: validatedData.warnings
        };
      }

      const result = await this.importOrdersInBatches(
        tenantId,
        validatedData.validRecords,
        options
      );

      await this.analyticsService.trackEvent({
        tenantId,
        eventType: 'data_import',
        category: 'import',
        data: {
          type: 'orders',
          format: options.format,
          totalRecords: rawData.length,
          successfulRecords: result.successfulRecords,
          failedRecords: result.failedRecords
        }
      });

      logger.info('Order import completed', {
        tenantId,
        totalRecords: rawData.length,
        successful: result.successfulRecords,
        failed: result.failedRecords
      });

      return {
        totalRecords: rawData.length,
        successfulRecords: result.successfulRecords,
        failedRecords: result.failedRecords,
        errors: [...validatedData.errors, ...result.errors],
        warnings: validatedData.warnings
      };
    } catch (error) {
      logger.error('Error importing orders:', error);
      throw error;
    }
  }

  /**
   * Get export template for specific data type
   */
  async getExportTemplate(
    dataType: 'products' | 'orders' | 'rfqs' | 'users',
    format: 'csv' | 'excel'
  ): Promise<IExportResult> {
    try {
      const templateData = this.getTemplateData(dataType);

      const result = await this.generateExportFile(
        `${dataType}_template`,
        templateData,
        { format, fileName: `${dataType}_template` }
      );

      logger.info('Export template generated', { dataType, format });

      return result;
    } catch (error) {
      logger.error('Error generating export template:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private buildProductQuery(tenantId: string, filters?: any): any {
    const query: any = { tenantId };

    if (filters) {
      if (filters.category) query.category = filters.category;
      if (filters.supplier) query.supplier = filters.supplier;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      if (filters.minPrice || filters.maxPrice) {
        query.price = {};
        if (filters.minPrice) query.price.$gte = filters.minPrice;
        if (filters.maxPrice) query.price.$lte = filters.maxPrice;
      }
      if (filters.isActive !== undefined) query.isActive = filters.isActive;
    }

    return query;
  }

  private buildOrderQuery(tenantId: string, filters?: any): any {
    const query: any = { tenantId };

    if (filters) {
      if (filters.status) query.status = filters.status;
      if (filters.buyer) query.buyer = filters.buyer;
      if (filters.supplier) query.supplier = filters.supplier;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      if (filters.minAmount || filters.maxAmount) {
        query.totalAmount = {};
        if (filters.minAmount) query.totalAmount.$gte = filters.minAmount;
        if (filters.maxAmount) query.totalAmount.$lte = filters.maxAmount;
      }
    }

    return query;
  }

  private buildRFQQuery(tenantId: string, filters?: any): any {
    const query: any = { tenantId };

    if (filters) {
      if (filters.status) query.status = filters.status;
      if (filters.buyer) query.buyer = filters.buyer;
      if (filters.category) query.category = filters.category;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      if (filters.minBudget || filters.maxBudget) {
        query.budget = {};
        if (filters.minBudget) query.budget.$gte = filters.minBudget;
        if (filters.maxBudget) query.budget.$lte = filters.maxBudget;
      }
    }

    return query;
  }

  private transformProductData(products: any[], fields?: string[]): any[] {
    const defaultFields = [
      'id', 'name', 'description', 'category', 'price', 'currency', 'unit',
      'minOrderQuantity', 'availability', 'location', 'isOrganic', 'isCertified',
      'supplier.name', 'createdAt', 'updatedAt'
    ];

    const selectedFields = fields || defaultFields;

    return products.map(product => {
      const transformed: any = {};

      selectedFields.forEach(field => {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (product[parent] && product[parent][child] !== undefined) {
            transformed[field] = product[parent][child];
          }
        } else if (product[field] !== undefined) {
          transformed[field] = product[field];
        }
      });

      // Special handling for ID field
      if (selectedFields.includes('id') && product._id) {
        transformed.id = product._id.toString();
      }

      return transformed;
    });
  }

  private transformOrderData(orders: any[], fields?: string[]): any[] {
    const defaultFields = [
      'id', 'orderNumber', 'status', 'totalAmount', 'currency',
      'buyer.name', 'supplier.name', 'itemCount', 'createdAt', 'updatedAt'
    ];

    const selectedFields = fields || defaultFields;

    return orders.map(order => {
      const transformed: any = {};

      selectedFields.forEach(field => {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (order[parent] && order[parent][child] !== undefined) {
            transformed[field] = order[parent][child];
          }
        } else if (order[field] !== undefined) {
          transformed[field] = order[field];
        }
      });

      // Special handling
      if (selectedFields.includes('id') && order._id) {
        transformed.id = order._id.toString();
      }
      if (selectedFields.includes('itemCount')) {
        transformed.itemCount = order.items ? order.items.length : 0;
      }

      return transformed;
    });
  }

  private transformRFQData(rfqs: any[], fields?: string[]): any[] {
    const defaultFields = [
      'id', 'title', 'description', 'category', 'status', 'budget', 'currency',
      'deadline', 'buyer.name', 'quotesCount', 'createdAt', 'updatedAt'
    ];

    const selectedFields = fields || defaultFields;

    return rfqs.map(rfq => {
      const transformed: any = {};

      selectedFields.forEach(field => {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          if (rfq[parent] && rfq[parent][child] !== undefined) {
            transformed[field] = rfq[parent][child];
          }
        } else if (rfq[field] !== undefined) {
          transformed[field] = rfq[field];
        }
      });

      // Special handling
      if (selectedFields.includes('id') && rfq._id) {
        transformed.id = rfq._id.toString();
      }
      if (selectedFields.includes('quotesCount')) {
        transformed.quotesCount = rfq.quotes ? rfq.quotes.length : 0;
      }

      return transformed;
    });
  }

  private transformAnalyticsData(analytics: any, fields?: string[]): any[] {
    // Convert analytics object to array format suitable for export
    const flattenedData = this.flattenObject(analytics);

    if (fields && fields.length > 0) {
      const filteredData: any = {};
      fields.forEach(field => {
        if (flattenedData[field] !== undefined) {
          filteredData[field] = flattenedData[field];
        }
      });
      return [filteredData];
    }

    return [flattenedData];
  }

  private flattenObject(obj: any, prefix = ''): any {
    const flattened: any = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }

    return flattened;
  }

  private async generateExportFile(
    type: string,
    data: any[],
    options: IExportOptions
  ): Promise<IExportResult> {
    const fileName = options.fileName || `${type}_export_${Date.now()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fullFileName = `${fileName}_${timestamp}`;

    const exportDir = process.env.EXPORT_DIR || './exports';
    const filePath = `${exportDir}/${fullFileName}`;

    // Ensure export directory exists
    const fs = require('fs');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let finalFilePath: string;
    let fileSize: number;

    switch (options.format) {
      case 'csv':
        finalFilePath = `${filePath}.csv`;
        await this.generateCSV(data, finalFilePath);
        break;
      case 'excel':
        finalFilePath = `${filePath}.xlsx`;
        await this.generateExcel(data, finalFilePath);
        break;
      case 'json':
        finalFilePath = `${filePath}.json`;
        await this.generateJSON(data, finalFilePath);
        break;
      default:
        throw new Error('Unsupported export format');
    }

    // Get file size
    const stats = fs.statSync(finalFilePath);
    fileSize = stats.size;

    return {
      fileName: `${fullFileName}.${options.format}`,
      filePath: finalFilePath,
      format: options.format,
      recordCount: data.length,
      fileSize,
      downloadUrl: `/api/v1/export/download/${fullFileName}.${options.format}`
    };
  }

  private async generateCSV(data: any[], filePath: string): Promise<void> {
    if (data.length === 0) {
      throw new Error('No data to export');
    }

    const headers = Object.keys(data[0]).map(key => ({ id: key, title: key }));
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers
    });

    await csvWriter.writeRecords(data);
  }

  private async generateExcel(data: any[], filePath: string): Promise<void> {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    XLSX.writeFile(workbook, filePath);
  }

  private async generateJSON(data: any[], filePath: string): Promise<void> {
    const fs = require('fs');
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData);
  }

  private async parseImportFile(filePath: string, format: string): Promise<any[]> {
    const fs = require('fs');

    switch (format) {
      case 'csv':
        return await this.parseCSV(filePath);
      case 'excel':
        return await this.parseExcel(filePath);
      case 'json':
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      default:
        throw new Error('Unsupported import format');
    }
  }

  private async parseCSV(filePath: string): Promise<any[]> {
    const fs = require('fs');
    const csvParse = require('csv-parse/sync');

    const fileContent = fs.readFileSync(filePath, 'utf8');
    return csvParse.parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
  }

  private async parseExcel(filePath: string): Promise<any[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  }

  private async validateProductData(data: any[], mapping?: { [key: string]: string }): Promise<{
    validRecords: any[];
    invalidRecords: any[];
    errors: any[];
    warnings: any[];
  }> {
    const validRecords: any[] = [];
    const invalidRecords: any[] = [];
    const errors: any[] = [];
    const warnings: any[] = [];

    const requiredFields = ['name', 'category', 'price', 'currency', 'unit'];
    const fieldMapping = mapping || {};

    data.forEach((record, index) => {
      const mappedRecord: any = {};
      let isValid = true;

      // Apply field mapping
      for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
        if (record[sourceField] !== undefined) {
          mappedRecord[targetField] = record[sourceField];
        }
      }

      // Copy unmapped fields
      for (const field in record) {
        if (!Object.keys(fieldMapping).includes(field)) {
          mappedRecord[field] = record[field];
        }
      }

      // Validate required fields
      for (const field of requiredFields) {
        if (!mappedRecord[field] || mappedRecord[field] === '') {
          errors.push({
            row: index + 1,
            field,
            message: `${field} is required`,
            value: mappedRecord[field]
          });
          isValid = false;
        }
      }

      // Validate data types
      if (mappedRecord.price && isNaN(Number(mappedRecord.price))) {
        errors.push({
          row: index + 1,
          field: 'price',
          message: 'Price must be a number',
          value: mappedRecord.price
        });
        isValid = false;
      }

      if (mappedRecord.minOrderQuantity && isNaN(Number(mappedRecord.minOrderQuantity))) {
        warnings.push({
          row: index + 1,
          field: 'minOrderQuantity',
          message: 'Minimum order quantity should be a number',
          value: mappedRecord.minOrderQuantity
        });
      }

      if (isValid) {
        validRecords.push(mappedRecord);
      } else {
        invalidRecords.push(mappedRecord);
      }
    });

    return { validRecords, invalidRecords, errors, warnings };
  }

  private async validateOrderData(data: any[], mapping?: { [key: string]: string }): Promise<{
    validRecords: any[];
    invalidRecords: any[];
    errors: any[];
    warnings: any[];
  }> {
    const validRecords: any[] = [];
    const invalidRecords: any[] = [];
    const errors: any[] = [];
    const warnings: any[] = [];

    const requiredFields = ['orderNumber', 'buyer', 'supplier', 'totalAmount', 'currency'];
    const fieldMapping = mapping || {};

    data.forEach((record, index) => {
      const mappedRecord: any = {};
      let isValid = true;

      // Apply field mapping
      for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
        if (record[sourceField] !== undefined) {
          mappedRecord[targetField] = record[sourceField];
        }
      }

      // Copy unmapped fields
      for (const field in record) {
        if (!Object.keys(fieldMapping).includes(field)) {
          mappedRecord[field] = record[field];
        }
      }

      // Validate required fields
      for (const field of requiredFields) {
        if (!mappedRecord[field] || mappedRecord[field] === '') {
          errors.push({
            row: index + 1,
            field,
            message: `${field} is required`,
            value: mappedRecord[field]
          });
          isValid = false;
        }
      }

      // Validate data types
      if (mappedRecord.totalAmount && isNaN(Number(mappedRecord.totalAmount))) {
        errors.push({
          row: index + 1,
          field: 'totalAmount',
          message: 'Total amount must be a number',
          value: mappedRecord.totalAmount
        });
        isValid = false;
      }

      if (isValid) {
        validRecords.push(mappedRecord);
      } else {
        invalidRecords.push(mappedRecord);
      }
    });

    return { validRecords, invalidRecords, errors, warnings };
  }

  private async importProductsInBatches(
    tenantId: string,
    products: any[],
    options: IImportOptions
  ): Promise<{
    successfulRecords: number;
    failedRecords: number;
    errors: any[];
  }> {
    const batchSize = options.batchSize || 100;
    const errors: any[] = [];
    let successfulRecords = 0;
    let failedRecords = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      for (const productData of batch) {
        try {
          const product = new Product({
            ...productData,
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          await product.save();
          successfulRecords++;
        } catch (error) {
          failedRecords++;
          errors.push({
            row: i + batch.indexOf(productData) + 1,
            field: 'general',
            message: error.message,
            value: productData
          });

          if (!options.skipErrors) {
            throw error;
          }
        }
      }
    }

    return { successfulRecords, failedRecords, errors };
  }

  private async importOrdersInBatches(
    tenantId: string,
    orders: any[],
    options: IImportOptions
  ): Promise<{
    successfulRecords: number;
    failedRecords: number;
    errors: any[];
  }> {
    const batchSize = options.batchSize || 100;
    const errors: any[] = [];
    let successfulRecords = 0;
    let failedRecords = 0;

    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);

      for (const orderData of batch) {
        try {
          const order = new Order({
            ...orderData,
            tenantId,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          await order.save();
          successfulRecords++;
        } catch (error) {
          failedRecords++;
          errors.push({
            row: i + batch.indexOf(orderData) + 1,
            field: 'general',
            message: error.message,
            value: orderData
          });

          if (!options.skipErrors) {
            throw error;
          }
        }
      }
    }

    return { successfulRecords, failedRecords, errors };
  }

  private getTemplateData(dataType: string): any[] {
    switch (dataType) {
      case 'products':
        return [{
          name: 'Sample Product',
          description: 'Product description',
          category: 'Category',
          price: 10.99,
          currency: 'USD',
          unit: 'kg',
          minOrderQuantity: 1,
          availability: 'in_stock',
          location: 'City, State',
          isOrganic: false,
          isCertified: true
        }];
      case 'orders':
        return [{
          orderNumber: 'ORD-001',
          buyer: 'buyer-id',
          supplier: 'supplier-id',
          totalAmount: 100.00,
          currency: 'USD',
          status: 'pending'
        }];
      case 'rfqs':
        return [{
          title: 'Sample RFQ',
          description: 'RFQ description',
          category: 'Category',
          budget: 1000.00,
          currency: 'USD',
          deadline: '2024-12-31'
        }];
      default:
        return [];
    }
  }
}

// Singleton instance
let exportService: ExportService;

export const getExportService = (): ExportService => {
  if (!exportService) {
    exportService = new ExportService();
  }
  return exportService;
};

export default getExportService();
