import * as ExcelJS from 'exceljs';
const csv = require('csv-parser');
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';

export class DataImporter {
  public results: any[] = [];
  public errors: any[] = [];
  public mappings: Record<string, string> = {
    // Map common CSV headers to database fields
    'Product Name': 'name',
    'Product Description': 'description',
    'Price': 'price',
    'Unit': 'unit',
    'MOQ': 'minOrderQuantity',
    'Min Order Quantity': 'minOrderQuantity',
    'Category': 'category',
    'Supplier': 'supplier',
    'In Stock': 'availability',
    'Available': 'availability'
  };

  // Detect file type and route to appropriate handler
  async importFile(filePath: string, modelName: string = 'Product'): Promise<any> {
    const ext = path.extname(filePath).toLowerCase();
    
    console.log(`🔄 Importing ${ext} file into ${modelName} collection...`);
    
    try {
      switch (ext) {
        case '.csv':
          return await this.importCSV(filePath, modelName);
        case '.xlsx':
        case '.xls':
          return await this.importExcel(filePath, modelName);
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      throw error;
    }
  }

  async importCSV(filePath: string, modelName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: any) => {
          const processedRow = this.processRow(row);
          if (processedRow) {
            results.push(processedRow);
          }
        })
        .on('end', async () => {
          try {
            const Model = mongoose.model(modelName);
            const savedData = await this.saveToDatabase(Model, results);
            resolve(savedData);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  async importExcel(filePath: string, modelName: string): Promise<any> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        throw new Error('No worksheet found');
      }
      
      const jsonData: any[] = [];
      const headers: string[] = [];
      
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) {
          // Header row
          row.eachCell((cell: any, colNumber: number) => {
            headers[colNumber] = cell.value?.toString() || '';
          });
        } else {
          // Data row
          const rowData: any = {};
          row.eachCell((cell: any, colNumber: number) => {
            const header = headers[colNumber];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          
          const processedRow = this.processRow(rowData);
          if (processedRow) {
            jsonData.push(processedRow);
          }
        }
      });
      
      const Model = mongoose.model(modelName);
      return await this.saveToDatabase(Model, jsonData);
    } catch (error) {
      console.error('Excel import failed:', error);
      throw error;
    }
  }

  processRow(row: any): any {
    try {
      const mapped: any = {};
      
      for (const [header, value] of Object.entries(row)) {
        const cleanHeader = header.trim();
        const dbField = this.mappings[cleanHeader] || this.toCamelCase(cleanHeader);
        mapped[dbField] = this.transformValue(value, dbField);
      }
      
      return mapped;
    } catch (error) {
      console.error('Row processing failed:', error);
      return null;
    }
  }

  transformValue(value: any, field: string): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    // Handle boolean fields
    if (field.includes('availability') || field.includes('active') || field.includes('verified')) {
      return value.toString().toLowerCase() === 'true' || 
             value.toString().toLowerCase() === 'yes' || 
             value.toString() === '1';
    }

    // Handle numeric fields
    if (field.includes('price') || field.includes('quantity') || field.includes('weight')) {
      const numValue = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
      return isNaN(numValue) ? null : numValue;
    }

    // Handle date fields
    if (field.includes('date') || field.includes('created') || field.includes('updated')) {
      const dateValue = new Date(value);
      return isNaN(dateValue.getTime()) ? null : dateValue;
    }

    // Handle arrays (comma-separated values)
    if (field.includes('tags') || field.includes('categories') || field.includes('certifications')) {
      return value.toString().split(',').map((v: string) => v.trim()).filter(Boolean);
    }

    // Default: return as string
    return value.toString().trim();
  }

  toCamelCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word: string, index: number) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  async saveToDatabase(Model: any, data: any[]): Promise<any> {
    try {
      const batchSize = 100;
      const results = {
        success: 0,
        errors: [] as any[]
      };

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        try {
          const saved = await Model.insertMany(batch, { ordered: false });
          results.success += saved.length;
        } catch (error: any) {
          // Handle partial success in batch
          if (error.writeErrors) {
            results.success += batch.length - error.writeErrors.length;
            results.errors.push(...error.writeErrors.map((e: any) => ({
              index: i + e.index,
              error: e.errmsg || e.message
            })));
          } else {
            results.errors.push({
              batch: i / batchSize,
              error: error.message
            });
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Database save failed:', error);
      throw error;
    }
  }

  async inferSchema(filePath: string): Promise<any> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.csv') {
        return new Promise((resolve, reject) => {
          const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
          const headers = firstLine.split(',').map((h: string) => h.trim());
          
          resolve({
            headers,
            suggestedMapping: this.generateMapping(headers)
          });
        });
      } else if (ext === '.xlsx' || ext === '.xls') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(1);
        if (!worksheet) {
          throw new Error('No worksheet found');
        }

        const headers: string[] = [];
        const firstRow = worksheet.getRow(1);
        firstRow.eachCell((cell: any) => {
          headers.push(cell.value?.toString() || '');
        });

        return {
          headers,
          suggestedMapping: this.generateMapping(headers)
        };
      }

      throw new Error(`Unsupported file type: ${ext}`);
    } catch (error) {
      console.error('Schema inference failed:', error);
      throw error;
    }
  }

  generateMapping(headers: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    
    headers.forEach((header: string) => {
      const cleanHeader = header.trim();
      mapping[cleanHeader] = this.mappings[cleanHeader] || this.toCamelCase(cleanHeader);
    });
    
    return mapping;
  }

  async processFiles(filePath: string): Promise<any> {
    try {
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        const files = fs.readdirSync(filePath);
        const results = [];
        
        for (const file of files) {
          const fullPath = path.join(filePath, file);
          const ext = path.extname(file).toLowerCase();
          
          if (['.csv', '.xlsx', '.xls'].includes(ext)) {
            try {
              const result = await this.importFile(fullPath);
              results.push({
                file,
                success: true,
                result
              });
            } catch (error) {
              results.push({
                file,
                success: false,
                error: error.message
              });
            }
          }
        }
        
        return results;
      } else {
        return await this.importFile(filePath);
      }
    } catch (error) {
      console.error('File processing failed:', error);
      throw error;
    }
  }
}

// Export default instance
export default new DataImporter();