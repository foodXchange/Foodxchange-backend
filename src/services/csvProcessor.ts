import { DataImporter } from '../utils/import/DataImporter';
import { UploadHistory } from '../models/UploadHistory';
import { logger } from '../config/logger';
import mongoose from 'mongoose';
const User = require('../models/core/User');
const Product = require('../models/marketplace/Product');
const Company = require('../models/core/Company');
const Order = require('../models/Order');

export interface ProcessResult {
  processed: number;
  failed: number;
  errors: string[];
}

export interface CSVMapping {
  csvColumn: string;
  dbField: string;
  transform?: (value: any) => any;
  required?: boolean;
}

export class CSVProcessor {
  private dataImporter: DataImporter;
  private mappings: Record<string, CSVMapping[]>;

  constructor() {
    this.dataImporter = new DataImporter();
    this.mappings = this.initializeMappings();
  }

  private initializeMappings(): Record<string, CSVMapping[]> {
    return {
      products: [
        { csvColumn: 'SKU', dbField: 'sku', required: true },
        { csvColumn: 'Product Name', dbField: 'name', required: true },
        { csvColumn: 'Description', dbField: 'description' },
        { csvColumn: 'Category', dbField: 'category', required: true },
        { csvColumn: 'Subcategory', dbField: 'subcategory' },
        { csvColumn: 'Tags', dbField: 'tags', transform: (v: string) => v?.split(',').map(t => t.trim()) },
        { csvColumn: 'Supplier ID', dbField: 'supplier', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Brand', dbField: 'brand' },
        { csvColumn: 'Country of Origin', dbField: 'countryOfOrigin' },
        { csvColumn: 'Base Price', dbField: 'basePrice', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Currency', dbField: 'currency' },
        { csvColumn: 'Unit', dbField: 'unit' },
        { csvColumn: 'Min Order Quantity', dbField: 'minOrderQuantity', transform: (v: any) => parseInt(v) || 1 },
        { csvColumn: 'Current Stock', dbField: 'quantity', transform: (v: any) => parseInt(v) || 0 },
        { csvColumn: 'Weight Value', dbField: 'weight.value', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Weight Unit', dbField: 'weight.unit' },
        { csvColumn: 'Units Per Case', dbField: 'packaging.unitsPerCase', transform: (v: any) => parseInt(v) || 1 },
        { csvColumn: 'Cases Per Pallet', dbField: 'packaging.casesPerPallet', transform: (v: any) => parseInt(v) || 1 },
        { csvColumn: 'Is Organic', dbField: 'isOrganic', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Is Kosher', dbField: 'isKosher', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Is Halal', dbField: 'isHalal', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Is Vegan', dbField: 'isVegan', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Allergens', dbField: 'allergens', transform: (v: string) => v?.split(',').map(a => a.trim()) },
        { csvColumn: 'Storage Temp Min', dbField: 'storageConditions.temperatureRange.min', transform: (v: any) => parseFloat(v) },
        { csvColumn: 'Storage Temp Max', dbField: 'storageConditions.temperatureRange.max', transform: (v: any) => parseFloat(v) },
        { csvColumn: 'Shelf Life Days', dbField: 'shelfLife', transform: (v: any) => parseInt(v) || 0 }
      ],
      users: [
        { csvColumn: 'Email', dbField: 'email', required: true },
        { csvColumn: 'First Name', dbField: 'firstName', required: true },
        { csvColumn: 'Last Name', dbField: 'lastName', required: true },
        { csvColumn: 'Phone', dbField: 'phone' },
        { csvColumn: 'Role', dbField: 'role', transform: (v: string) => v?.toLowerCase() },
        { csvColumn: 'Company ID', dbField: 'company', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Company Verified', dbField: 'companyVerified', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Email Verified', dbField: 'isEmailVerified', transform: (v: any) => v?.toLowerCase() === 'yes' || v === true },
        { csvColumn: 'Language', dbField: 'preferences.language' },
        { csvColumn: 'Timezone', dbField: 'preferences.timezone' },
        { csvColumn: 'Account Status', dbField: 'accountStatus' }
      ],
      companies: [
        { csvColumn: 'Company Name', dbField: 'name', required: true },
        { csvColumn: 'Description', dbField: 'description' },
        { csvColumn: 'Type', dbField: 'type', transform: (v: string) => v?.toLowerCase() },
        { csvColumn: 'Industry', dbField: 'industry' },
        { csvColumn: 'Street Address', dbField: 'address.street' },
        { csvColumn: 'City', dbField: 'address.city' },
        { csvColumn: 'State', dbField: 'address.state' },
        { csvColumn: 'Country', dbField: 'address.country' },
        { csvColumn: 'Postal Code', dbField: 'address.postalCode' },
        { csvColumn: 'Email', dbField: 'contactInfo.email', required: true },
        { csvColumn: 'Phone', dbField: 'contactInfo.phone' },
        { csvColumn: 'Website', dbField: 'contactInfo.website' },
        { csvColumn: 'Registration Number', dbField: 'businessInfo.registrationNumber' },
        { csvColumn: 'Tax ID', dbField: 'businessInfo.taxId' },
        { csvColumn: 'Year Established', dbField: 'businessInfo.yearEstablished', transform: (v: any) => parseInt(v) },
        { csvColumn: 'Employee Count', dbField: 'businessInfo.employeeCount', transform: (v: any) => parseInt(v) },
        { csvColumn: 'Annual Revenue', dbField: 'businessInfo.annualRevenue', transform: (v: any) => parseFloat(v) },
        { csvColumn: 'Subscription Tier', dbField: 'subscription.plan' },
        { csvColumn: 'Subscription Status', dbField: 'subscription.status' }
      ],
      orders: [
        { csvColumn: 'Order Number', dbField: 'orderNumber', required: true },
        { csvColumn: 'PO Number', dbField: 'purchaseOrderNumber' },
        { csvColumn: 'RFQ ID', dbField: 'rfqId', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Buyer ID', dbField: 'buyer', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Buyer Company ID', dbField: 'buyerCompany', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Supplier ID', dbField: 'supplier', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Supplier Company ID', dbField: 'supplierCompany', transform: (v: string) => mongoose.Types.ObjectId.isValid(v) ? v : null },
        { csvColumn: 'Order Date', dbField: 'createdAt', transform: (v: any) => new Date(v) },
        { csvColumn: 'Delivery Date', dbField: 'deliveryDetails.requestedDate', transform: (v: any) => new Date(v) },
        { csvColumn: 'Status', dbField: 'status' },
        { csvColumn: 'Currency', dbField: 'currency' },
        { csvColumn: 'Subtotal', dbField: 'subtotal', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Tax Amount', dbField: 'taxAmount', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Shipping Cost', dbField: 'shippingCost', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Total Amount', dbField: 'totalAmount', transform: (v: any) => parseFloat(v) || 0 },
        { csvColumn: 'Payment Terms', dbField: 'paymentTerms' },
        { csvColumn: 'Payment Status', dbField: 'paymentStatus' },
        { csvColumn: 'Delivery Address', dbField: 'deliveryDetails.address.street' },
        { csvColumn: 'Delivery City', dbField: 'deliveryDetails.address.city' },
        { csvColumn: 'Delivery Country', dbField: 'deliveryDetails.address.country' },
        { csvColumn: 'Incoterm', dbField: 'deliveryDetails.incoterm' }
      ]
    };
  }

  async getTemplate(type: string): Promise<string | null> {
    const mapping = this.mappings[type];
    if (!mapping) {
      return null;
    }

    const headers = mapping.map(m => m.csvColumn);
    const sampleRow = this.generateSampleRow(type);
    
    return [headers.join(','), sampleRow.join(',')].join('\n');
  }

  private generateSampleRow(type: string): string[] {
    const samples: Record<string, string[]> = {
      products: [
        'SKU001', 'Organic Tomatoes', 'Fresh organic tomatoes from local farms', 'Vegetables', 'Fresh Produce',
        'organic,fresh,tomatoes', '507f1f77bcf86cd799439011', 'FarmFresh', 'USA', '2.99', 'USD', 'kg',
        '10', '500', '1', 'kg', '24', '48', 'Yes', 'No', 'Yes', 'Yes', '', '2', '8', '7'
      ],
      users: [
        'john.doe@example.com', 'John', 'Doe', '+1234567890', 'buyer', '507f1f77bcf86cd799439012',
        'Yes', 'Yes', 'en', 'America/New_York', 'active'
      ],
      companies: [
        'ABC Trading Co', 'Leading food distributor', 'buyer', 'Food & Beverage', '123 Main St',
        'New York', 'NY', 'USA', '10001', 'info@abctrading.com', '+1234567890', 'www.abctrading.com',
        'REG123456', 'TAX789012', '2010', '50', '5000000', 'premium', 'active'
      ],
      orders: [
        'ORD-2024-001', 'PO-2024-001', '507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014',
        '507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016', '507f1f77bcf86cd799439017',
        '2024-01-15', '2024-01-25', 'pending', 'USD', '1000', '100', '50', '1150', 'Net 30',
        'pending', '456 Delivery St', 'Chicago', 'USA', 'FOB'
      ]
    };

    return samples[type] || [];
  }

  async processRecords(
    type: string, 
    records: any[], 
    userId: string, 
    uploadId: string
  ): Promise<ProcessResult> {
    const result: ProcessResult = {
      processed: 0,
      failed: 0,
      errors: []
    };

    const mapping = this.mappings[type];
    if (!mapping) {
      result.errors.push(`Unknown type: ${type}`);
      return result;
    }

    const Model = this.getModel(type);
    if (!Model) {
      result.errors.push(`Model not found for type: ${type}`);
      return result;
    }

    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const processedBatch = [];

      for (const record of batch) {
        try {
          const processedRecord = this.transformRecord(record, mapping, type);
          
          // Add metadata
          if (type !== 'users') {
            processedRecord.createdBy = userId;
            processedRecord.updatedBy = userId;
          }

          // Validate required fields
          const missingFields = this.validateRequiredFields(processedRecord, mapping, record);
          if (missingFields.length > 0) {
            result.errors.push(`Row ${i + batch.indexOf(record) + 2}: Missing required fields: ${missingFields.join(', ')}`);
            result.failed++;
            continue;
          }

          processedBatch.push(processedRecord);
        } catch (error) {
          result.errors.push(`Row ${i + batch.indexOf(record) + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
        }
      }

      // Save batch to database
      if (processedBatch.length > 0) {
        try {
          await Model.insertMany(processedBatch, { ordered: false });
          result.processed += processedBatch.length;
        } catch (error: any) {
          if (error.writeErrors) {
            result.processed += processedBatch.length - error.writeErrors.length;
            result.failed += error.writeErrors.length;
            error.writeErrors.forEach((e: any) => {
              result.errors.push(`Row ${i + e.index + 2}: ${e.errmsg || e.message}`);
            });
          } else {
            result.failed += processedBatch.length;
            result.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
          }
        }
      }

      // Update progress
      await UploadHistory.findByIdAndUpdate(uploadId, {
        processedRecords: result.processed,
        failedRecords: result.failed
      });
    }

    return result;
  }

  private transformRecord(record: any, mappings: CSVMapping[], type: string): any {
    const transformed: any = {};

    for (const mapping of mappings) {
      const value = record[mapping.csvColumn];
      if (value !== undefined && value !== null && value !== '') {
        const fieldPath = mapping.dbField.split('.');
        let current = transformed;
        
        for (let i = 0; i < fieldPath.length - 1; i++) {
          if (!current[fieldPath[i]]) {
            current[fieldPath[i]] = {};
          }
          current = current[fieldPath[i]];
        }

        const finalValue = mapping.transform ? mapping.transform(value) : value;
        if (finalValue !== null && finalValue !== undefined) {
          current[fieldPath[fieldPath.length - 1]] = finalValue;
        }
      }
    }

    // Add default values based on type
    if (type === 'products') {
      transformed.status = transformed.status || 'draft';
      transformed.availability = transformed.quantity > 0;
    } else if (type === 'users') {
      transformed.password = this.generateTempPassword();
      transformed.accountStatus = transformed.accountStatus || 'active';
      transformed.role = transformed.role || 'buyer';
    } else if (type === 'companies') {
      transformed.type = transformed.type || 'buyer';
      transformed.verified = false;
      transformed.active = true;
    } else if (type === 'orders') {
      transformed.status = transformed.status || 'pending';
      transformed.paymentStatus = transformed.paymentStatus || 'pending';
      transformed.items = []; // Will need to be populated separately
    }

    return transformed;
  }

  private validateRequiredFields(record: any, mappings: CSVMapping[], originalRecord: any): string[] {
    const missingFields: string[] = [];

    for (const mapping of mappings) {
      if (mapping.required) {
        const fieldPath = mapping.dbField.split('.');
        let current = record;
        let hasValue = true;

        for (const field of fieldPath) {
          if (!current || current[field] === undefined || current[field] === null || current[field] === '') {
            hasValue = false;
            break;
          }
          current = current[field];
        }

        if (!hasValue) {
          missingFields.push(mapping.csvColumn);
        }
      }
    }

    return missingFields;
  }

  private getModel(type: string): any {
    const models: Record<string, any> = {
      products: Product,
      users: User,
      companies: Company,
      orders: Order
    };

    return models[type];
  }

  private generateTempPassword(): string {
    return `TempPass${Math.random().toString(36).substr(2, 9)}!`;
  }
}

export default new CSVProcessor();