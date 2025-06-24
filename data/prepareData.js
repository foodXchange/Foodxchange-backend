#!/usr/bin/env node

/**
 * FoodXchange Data Preparation Script
 * This script prepares your CSV/Excel data for import
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const csv = require('csv-parser');

class DataPreparation {
  constructor() {
    this.stats = {
      suppliers: { total: 0, valid: 0, invalid: 0 },
      products: { total: 0, valid: 0, invalid: 0 },
      contacts: { total: 0, valid: 0, invalid: 0 }
    };
  }

  // Analyze suppliers data
  async analyzeSuppliers() {
    console.log('\n📊 Analyzing Suppliers Data...\n');
    
    const filePath = path.join(__dirname, 'Suppliers 23_6_2025.xlsx');
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ Suppliers file not found:', filePath);
      return;
    }
    
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    this.stats.suppliers.total = data.length;
    
    // Analyze data quality
    const issues = [];
    const countryCounts = {};
    const categoryCounts = {};
    
    data.forEach((row, index) => {
      const rowIssues = [];
      
      // Check required fields
      if (!row['Company Name'] && !row['Supplier Name']) {
        rowIssues.push('Missing company name');
      }
      
      if (!row["Supplier's Country"]) {
        rowIssues.push('Missing country');
      } else {
        countryCounts[row["Supplier's Country"]] = (countryCounts[row["Supplier's Country"]] || 0) + 1;
      }
      
      if (!row['Company Email']) {
        rowIssues.push('Missing email');
      }
      
      // Count categories
      if (row['Categories']) {
        row['Categories'].split(',').forEach(cat => {
          const trimmed = cat.trim();
          if (trimmed) {
            categoryCounts[trimmed] = (categoryCounts[trimmed] || 0) + 1;
          }
        });
      }
      
      if (rowIssues.length > 0) {
        issues.push({
          row: index + 2,
          company: row['Company Name'] || row['Supplier Name'] || 'Unknown',
          issues: rowIssues
        });
        this.stats.suppliers.invalid++;
      } else {
        this.stats.suppliers.valid++;
      }
    });
    
    // Display results
    console.log('📈 Supplier Statistics:');
    console.log(`   Total Suppliers: ${this.stats.suppliers.total}`);
    console.log(`   Valid Suppliers: ${this.stats.suppliers.valid}`);
    console.log(`   Invalid Suppliers: ${this.stats.suppliers.invalid}`);
    
    console.log('\n🌍 Countries (Top 10):');
    Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([country, count]) => {
        console.log(`   ${country}: ${count} suppliers`);
      });
    
    console.log('\n📦 Categories (Top 10):');
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count} suppliers`);
      });
    
    if (issues.length > 0) {
      console.log('\n⚠️  Data Issues (First 10):');
      issues.slice(0, 10).forEach(issue => {
        console.log(`   Row ${issue.row} - ${issue.company}: ${issue.issues.join(', ')}`);
      });
      
      // Save issues to file
      fs.writeFileSync(
        path.join(__dirname, 'supplier_issues.json'),
        JSON.stringify(issues, null, 2)
      );
      console.log(`\n   Full issues report saved to supplier_issues.json`);
    }
  }

  // Analyze products data
  async analyzeProducts() {
    console.log('\n\n📊 Analyzing Products Data...\n');
    
    const filePath = path.join(__dirname, 'Products 23_6_2025.csv');
    
    if (!fs.existsSync(filePath)) {
      console.error('❌ Products file not found:', filePath);
      return;
    }
    
    const products = [];
    const supplierCounts = {};
    const categoryCounts = {};
    const currencyCounts = {};
    
    await new Promise((resolve) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          products.push(row);
          
          // Count by supplier
          if (row['Supplier']) {
            supplierCounts[row['Supplier']] = (supplierCounts[row['Supplier']] || 0) + 1;
          }
          
          // Count by category
          if (row['Products Category & Family']) {
            const mainCategory = row['Products Category & Family'].split(',')[0].trim();
            categoryCounts[mainCategory] = (categoryCounts[mainCategory] || 0) + 1;
          }
          
          // Count by currency
          if (row['Currency for price']) {
            currencyCounts[row['Currency for price']] = (currencyCounts[row['Currency for price']] || 0) + 1;
          }
        })
        .on('end', () => {
          resolve();
        });
    });
    
    this.stats.products.total = products.length;
    
    // Validate products
    const issues = [];
    products.forEach((product, index) => {
      const rowIssues = [];
      
      if (!product['Product Name']) {
        rowIssues.push('Missing product name');
      }
      
      if (!product['Unit Wholesale Price (latest)'] && !product['Unit Wholesale Price (Initial)']) {
        rowIssues.push('Missing price');
      }
      
      if (rowIssues.length > 0) {
        issues.push({
          row: index + 2,
          product: product['Product Name'] || 'Unknown',
          issues: rowIssues
        });
        this.stats.products.invalid++;
      } else {
        this.stats.products.valid++;
      }
    });
    
    // Display results
    console.log('📈 Product Statistics:');
    console.log(`   Total Products: ${this.stats.products.total}`);
    console.log(`   Valid Products: ${this.stats.products.valid}`);
    console.log(`   Invalid Products: ${this.stats.products.invalid}`);
    
    console.log('\n🏭 Top Suppliers by Product Count:');
    Object.entries(supplierCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([supplier, count]) => {
        console.log(`   ${supplier}: ${count} products`);
      });
    
    console.log('\n📦 Product Categories:');
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count} products`);
      });
    
    console.log('\n💱 Currencies Used:');
    Object.entries(currencyCounts).forEach(([currency, count]) => {
      console.log(`   ${currency}: ${count} products`);
    });
  }

  // Generate import-ready files
  async generateCleanData() {
    console.log('\n\n🧹 Generating Clean Data Files...\n');
    
    // Clean suppliers
    const suppliersPath = path.join(__dirname, 'Suppliers 23_6_2025.xlsx');
    if (fs.existsSync(suppliersPath)) {
      const workbook = XLSX.readFile(suppliersPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const suppliers = XLSX.utils.sheet_to_json(sheet);
      
      const cleanSuppliers = suppliers
        .filter(s => (s['Company Name'] || s['Supplier Name']) && s["Supplier's Country"])
        .map(s => ({
          ...s,
          'Company Email': s['Company Email'] || `contact@${(s['Company Name'] || s['Supplier Name']).toLowerCase().replace(/\s+/g, '')}.com`,
          'Import Status': 'Ready'
        }));
      
      // Save clean suppliers
      const cleanWorkbook = XLSX.utils.book_new();
      const cleanSheet = XLSX.utils.json_to_sheet(cleanSuppliers);
      XLSX.utils.book_append_sheet(cleanWorkbook, cleanSheet, 'Suppliers');
      XLSX.writeFile(cleanWorkbook, path.join(__dirname, 'suppliers_clean.xlsx'));
      
      console.log(`✅ Generated suppliers_clean.xlsx (${cleanSuppliers.length} suppliers)`);
    }
    
    // Generate summary report
    const summary = {
      generatedAt: new Date().toISOString(),
      stats: this.stats,
      recommendations: [
        'Review supplier_issues.json for data quality issues',
        'Ensure all suppliers have valid email addresses',
        'Verify product categories are standardized',
        'Check currency values for consistency'
      ]
    };
    
    fs.writeFileSync(
      path.join(__dirname, 'migration_summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    console.log('✅ Generated migration_summary.json');
  }

  // Run all analyses
  async run() {
    console.log('🚀 FoodXchange Data Preparation Tool');
    console.log('====================================\n');
    
    await this.analyzeSuppliers();
    await this.analyzeProducts();
    await this.generateCleanData();
    
    console.log('\n\n✅ Data preparation complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Review supplier_issues.json for data quality issues');
    console.log('   2. Use suppliers_clean.xlsx for import');
    console.log('   3. Run the import script: npm run import-suppliers');
  }
}

// Run if executed directly
if (require.main === module) {
  const prep = new DataPreparation();
  prep.run().catch(console.error);
}

module.exports = DataPreparation;
