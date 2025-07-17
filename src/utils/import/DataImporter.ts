const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

class DataImporter {
  constructor() {
    this.results = [];
    this.errors = [];
    this.mappings = {
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
  }

  // Detect file type and route to appropriate handler
  async importFile(filePath, modelName = 'Product') {
    const ext = path.extname(filePath).toLowerCase();
    
    console.log(`?? Importing ${ext} file into ${modelName} collection...`);
    
    if (ext === '.csv') {
      return await this.importCSV(filePath, modelName);
    } else if (ext === '.xlsx' || ext === '.xls') {
      return await this.importExcel(filePath, modelName);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  // Import CSV file
  async importCSV(filePath, modelName) {
    const Model = mongoose.model(modelName);
    const results = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', async (row) => {
          const mappedData = this.mapHeaders(row);
          results.push(mappedData);
        })
        .on('end', async () => {
          console.log(`?? Found ${results.length} rows in CSV`);
          const imported = await this.saveToDatabase(Model, results);
          resolve(imported);
        })
        .on('error', reject);
    });
  }

  // Import Excel file
  async importExcel(filePath, modelName) {
    const Model = mongoose.model(modelName);
    
    // Read Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(1); // First worksheet
    const sheetName = worksheet.name;
    
    // Convert to JSON
    const jsonData = [];
    const headers = [];
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // First row contains headers
        row.eachCell((cell) => {
          headers.push(cell.value);
        });
      } else {
        // Data rows
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });
        jsonData.push(rowData);
      }
    });
    
    console.log(`?? Found ${jsonData.length} rows in Excel sheet: ${sheetName}`);
    
    // Map headers and save
    const mappedData = jsonData.map(row => this.mapHeaders(row));
    return await this.saveToDatabase(Model, mappedData);
  }

  // Map CSV/Excel headers to database fields
  mapHeaders(row) {
    const mapped = {};
    
    for (const [header, value] of Object.entries(row)) {
      // Clean header (remove spaces, special chars)
      const cleanHeader = header.trim();
      
      // Check if we have a mapping for this header
      const dbField = this.mappings[cleanHeader] || this.camelCase(cleanHeader);
      
      // Convert values
      mapped[dbField] = this.convertValue(value, dbField);
    }
    
    return mapped;
  }

  // Convert string values to appropriate types
  convertValue(value, field) {
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
    if (field.includes('price') || field.includes('quantity') || field.includes('Quantity')) {
      const num = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? value : num;
    }

    // Handle date fields
    if (field.includes('date') || field.includes('Date')) {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date;
    }

    // Handle arrays (comma-separated values)
    if (value.toString().includes(',') && !field.includes('address')) {
      return value.toString().split(',').map(v => v.trim());
    }

    return value;
  }

  // Convert header to camelCase
  camelCase(str) {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
      })
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  // Save data to database
  async saveToDatabase(Model, data) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      try {
        // Use insertMany with ordered: false to continue on error
        const inserted = await Model.insertMany(batch, { 
          ordered: false,
          rawResult: true 
        });
        
        results.success += inserted.insertedCount || batch.length;
      } catch (error) {
        if (error.writeErrors) {
          results.failed += error.writeErrors.length;
          results.errors.push(...error.writeErrors.map(e => ({
            index: e.index + i,
            error: e.errmsg
          })));
        } else {
          results.failed += batch.length;
          results.errors.push({ error: error.message });
        }
      }
    }

    return results;
  }

  // Get all unique headers from file
  async analyzeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let headers = [];
    
    if (ext === '.csv') {
      // Read first line of CSV
      const firstLine = await this.getFirstLine(filePath);
      headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));
    } else if (ext === '.xlsx' || ext === '.xls') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);
      const firstRow = worksheet.getRow(1);
      headers = [];
      firstRow.eachCell((cell) => {
        headers.push(cell.value);
      });
    }
    
    return {
      headers,
      mappedFields: headers.map(h => ({
        original: h,
        mapped: this.mappings[h] || this.camelCase(h)
      }))
    };
  }

  getFirstLine(filePath) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let firstLine = '';
      
      stream.on('data', chunk => {
        const lines = chunk.split('\n');
        firstLine = lines[0];
        stream.destroy();
      });
      
      stream.on('close', () => resolve(firstLine));
      stream.on('error', reject);
    });
  }
}

module.exports = DataImporter;
