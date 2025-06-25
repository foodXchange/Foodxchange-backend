#!/usr/bin/env node

/**
 * FoodXchange Complete Data Migration Script
 * Migrates all CSV data to Azure-optimized MongoDB schema
 */

const mongoose = require('mongoose');
const XLSX = require('xlsx');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Import models
const Company = require('../src/models/core/Company');
const User = require('../src/models/core/User');
const Product = require('../src/models/core/Product');
const Request = require('../src/models/business/Request');
const Order = require('../src/models/business/Order');

// Import Azure service
const { AzureService } = require('../src/services/azure/AzureService');

class DataMigrator {
  constructor() {
    this.azureService = new AzureService();
    this.stats = {
      companies: { total: 0, imported: 0, errors: 0 },
      users: { total: 0, imported: 0, errors: 0 },
      products: { total: 0, imported: 0, errors: 0 },
      requests: { total: 0, imported: 0, errors: 0 },
      orders: { total: 0, imported: 0, errors: 0 }
    };
    this.errors = [];
    this.mappings = {
      supplierToCompany: new Map(),
      buyerToCompany: new Map(),
      contactToUser: new Map(),
      productMappings: new Map()
    };
  }

  async initialize() {
    console.log('🚀 Initializing Data Migration...\n');
    
    try {
      // Connect to MongoDB
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ Connected to MongoDB Atlas');
      
      // Initialize Azure services
      await this.azureService.initialize();
      console.log('✅ Azure services initialized');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  // Step 1: Import Suppliers as Companies
  async importSuppliers() {
    console.log('\n📊 Importing Suppliers...');
    
    const filePath = path.join(__dirname, '../data/Suppliers 23_6_2025.xlsx');
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }

    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const suppliers = XLSX.utils.sheet_to_json(sheet);
    
    this.stats.companies.total += suppliers.length;
    
    for (const supplier of suppliers) {
      try {
        // Create company record
        const companyData = {
          legacyId: supplier['Supplier ID'] || supplier['ID'],
          name: supplier['Company Name'] || supplier['Supplier Name'],
          type: 'supplier',
          
          contact: {
            email: supplier['Company Email'] || this.generateEmail(supplier['Company Name']),
            phone: supplier['Phone Number'],
            website: supplier['Company website']
          },
          
          address: {
            country: supplier["Supplier's Country"],
            city: supplier['City'],
            street: supplier['Address']
          },
          
          business: {
            description: supplier['Company Description'] || supplier["Supplier's Description & Products"],
            categories: supplier['Categories'] ? supplier['Categories'].split(',').map(c => c.trim()) : []
          },
          
          originalData: {
            source: 'suppliers_csv',
            importedAt: new Date(),
            rawData: supplier
          }
        };
        
        const company = new Company(companyData);
        await company.save();
        
        // Store mapping for later use
        this.mappings.supplierToCompany.set(supplier['Company Name'] || supplier['Supplier Name'], company._id);
        
        this.stats.companies.imported++;
        
        if (this.stats.companies.imported % 10 === 0) {
          process.stdout.write(`\r   Imported ${this.stats.companies.imported}/${this.stats.companies.total} suppliers...`);
        }
        
      } catch (error) {
        this.stats.companies.errors++;
        this.errors.push({
          type: 'supplier',
          data: supplier,
          error: error.message
        });
      }
    }
    
    console.log(`\n✅ Suppliers imported: ${this.stats.companies.imported}/${this.stats.companies.total}`);
  }

  // Step 2: Import Buyers as Companies
  async importBuyers() {
    console.log('\n📊 Importing Buyers...');
    
    const filePath = path.join(__dirname, '../data/Buyers 23_6_2025.csv');
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }

    const buyers = await this.readCSV(filePath);
    this.stats.companies.total += buyers.length;
    
    for (const buyer of buyers) {
      try {
        const companyData = {
          legacyId: buyer["Buyer's Company ID"],
          name: buyer['Company name'],
          type: 'buyer',
          
          contact: {
            email: buyer['Email address'],
            phone: buyer['Phone Number'],
            website: buyer['Company website']
          },
          
          address: {
            country: buyer['Company Country'],
            street: buyer["Buyer's company address"]
          },
          
          warehouseAddress: {
            street: buyer['Ship to Address (Warehouse)']
          },
          
          business: {
            description: buyer["Buyer's Description & Bus. Sector"],
            vatNumber: buyer["Buyer's V.A.T Number"]
          },
          
          originalData: {
            source: 'buyers_csv',
            importedAt: new Date(),
            rawData: buyer
          }
        };
        
        const company = new Company(companyData);
        await company.save();
        
        this.mappings.buyerToCompany.set(buyer['Company name'], company._id);
        this.stats.companies.imported++;
        
      } catch (error) {
        this.stats.companies.errors++;
        this.errors.push({
          type: 'buyer',
          data: buyer,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Buyers imported: ${buyers.length}`);
  }

  // Step 3: Import Contacts as Users
  async importContacts() {
    console.log('\n👥 Importing Contacts...');
    
    // Import Supplier Contacts
    const supplierContactsPath = path.join(__dirname, '../data/Supplier Contacts 23_6_2025.csv');
    if (fs.existsSync(supplierContactsPath)) {
      const supplierContacts = await this.readCSV(supplierContactsPath);
      
      for (const contact of supplierContacts) {
        try {
          const companyId = this.mappings.supplierToCompany.get(contact["Contact's Company"]);
          if (!companyId) continue;
          
          const userData = {
            email: contact['Email'] || this.generateEmail(contact["Contact person's name"]),
            tempPassword: this.generateTempPassword(),
            role: 'supplier',
            company: companyId,
            
            profile: {
              fullName: contact["Contact person's name"],
              jobTitle: contact['Job title']
            },
            
            contact: {
              phone: contact['Office phone'],
              mobile: contact['Mobile phone']
            },
            
            originalData: {
              contactId: contact['Supplier Contact ID'],
              source: 'supplier_contacts_csv',
              importedAt: new Date(),
              rawData: contact
            }
          };
          
          const user = new User(userData);
          await user.save();
          this.stats.users.imported++;
          
        } catch (error) {
          this.stats.users.errors++;
          this.errors.push({
            type: 'supplier_contact',
            data: contact,
            error: error.message
          });
        }
      }
    }
    
    // Import Buyer Contacts
    const buyerContactsPath = path.join(__dirname, '../data/Buyer Contacts 23_6_2025.csv');
    if (fs.existsSync(buyerContactsPath)) {
      const buyerContacts = await this.readCSV(buyerContactsPath);
      
      for (const contact of buyerContacts) {
        try {
          const companyId = this.mappings.buyerToCompany.get(contact['Buyer Company']);
          if (!companyId) continue;
          
          const userData = {
            email: contact['Email'],
            tempPassword: this.generateTempPassword(),
            role: 'buyer',
            company: companyId,
            
            profile: {
              fullName: contact['Full Name'],
              jobTitle: contact['Job Position']
            },
            
            contact: {
              phone: contact['Phone'],
              mobile: contact['Mobile']
            },
            
            originalData: {
              source: 'buyer_contacts_csv',
              importedAt: new Date(),
              rawData: contact
            }
          };
          
          const user = new User(userData);
          await user.save();
          this.stats.users.imported++;
          
        } catch (error) {
          this.stats.users.errors++;
        }
      }
    }
    
    console.log(`✅ Contacts imported: ${this.stats.users.imported}`);
  }

  // Step 4: Import Products
  async importProducts() {
    console.log('\n📦 Importing Products...');
    
    const filePath = path.join(__dirname, '../data/Products 23_6_2025.csv');
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }

    const products = await this.readCSV(filePath);
    this.stats.products.total = products.length;
    
    for (const product of products) {
      try {
        const supplierId = this.mappings.supplierToCompany.get(product['Supplier']);
        if (!supplierId) {
          console.log(`⚠️  Supplier not found for product: ${product['Product Name']}`);
          continue;
        }
        
        const productData = {
          legacyId: product['Product ID'],
          name: product['Product Name'],
          description: product["Supplier's Description & Products"],
          supplier: supplierId,
          supplierProductCode: product['Supplier Product Code'],
          
          classification: {
            hsCode: product['HS/ Tariff Code']
          },
          
          specifications: {
            weight: {
              gross: parseFloat(product['Gross Weight']) || 0,
              net: parseFloat(product['Net Weight']) || 0,
              unit: 'kg'
            },
            packaging: {
              unitsPerCarton: parseInt(product['Units per carton']) || 0
            },
            containerLoading: {
              cartons20ft: parseInt(product['# of Cartons (20ft)']) || 0,
              cartons40ft: parseInt(product['# of Cartons (40ft)']) || 0,
              pallets20ft: parseInt(product['# of Pallets (20ft)']) || 0,
              pallets40ft: parseInt(product['# of Pallets in (40ft)']) || 0,
              totalUnits20ft: parseInt(product['Total units (20ft.)']) || 0,
              totalUnits40ft: parseInt(product['Total units (40ft.)']) || 0
            },
            storage: {
              temperature: {
                min: parseFloat(product["Product's Min. temperature"]) || 0,
                max: parseFloat(product["Product's Max temperature"]) || 0
              },
              shelfLife: {
                duration: parseInt(product['Shelf Life (Days)']) || 0,
                unit: 'days'
              }
            }
          },
          
          pricing: {
            unitPrice: {
              wholesale: mongoose.Types.Decimal128.fromString(String(product['Unit Wholesale Price (latest)'] || product['Unit Wholesale Price (Initial)'] || '0')),
              currency: product['Currency for price'] || 'USD'
            },
            cartonPrice: product['Price for Carton (wholesale)'] ? 
              mongoose.Types.Decimal128.fromString(String(product['Price for Carton (wholesale)'])) : undefined,
            moq: {
              quantity: parseInt(product['MOQ (units)']) || 0,
              unit: product['Unit of Measure'] || 'units'
            },
            terms: {
              incoterms: product['Incoterms'],
              paymentTerms: product['Payment Terms']
            }
          },
          
          logistics: {
            originCountry: product['Supplier Country'],
            preferredPorts: product['Closest/ Prefered SeaPort'] ? [product['Closest/ Prefered SeaPort']] : []
          },
          
          dietary: {
            attributes: product['Kosher?'] === 'Yes' ? ['kosher'] : []
          },
          
          status: {
            stage: 'active',
            isActive: true
          },
          
          originalData: {
            source: 'products_csv',
            importedAt: new Date(),
            rawData: product
          }
        };
        
        const productDoc = new Product(productData);
        await productDoc.save();
        
        this.mappings.productMappings.set(product['Product Name'], productDoc._id);
        this.stats.products.imported++;
        
        if (this.stats.products.imported % 10 === 0) {
          process.stdout.write(`\r   Imported ${this.stats.products.imported}/${this.stats.products.total} products...`);
        }
        
      } catch (error) {
        this.stats.products.errors++;
        this.errors.push({
          type: 'product',
          data: product,
          error: error.message
        });
      }
    }
    
    console.log(`\n✅ Products imported: ${this.stats.products.imported}/${this.stats.products.total}`);
  }

  // Utility functions
  generateEmail(name) {
    if (!name) return `user${Date.now()}@foodxchange.com`;
    return `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@foodxchange.com`;
  }

  generateTempPassword() {
    return Math.random().toString(36).slice(-8).toUpperCase();
  }

  async readCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  // Generate migration report
  async generateReport() {
    const report = {
      migration: {
        completedAt: new Date().toISOString(),
        duration: 'Calculated at runtime',
        environment: process.env.NODE_ENV || 'development'
      },
      statistics: this.stats,
      mappings: {
        suppliers: this.mappings.supplierToCompany.size,
        buyers: this.mappings.buyerToCompany.size,
        products: this.mappings.productMappings.size
      },
      errors: {
        count: this.errors.length,
        details: this.errors.slice(0, 50) // First 50 errors
      },
      recommendations: [
        'Send welcome emails to all imported users with temporary passwords',
        'Review and fix any data quality issues listed in errors',
        'Set up Azure AI processing for imported products',
        'Configure user permissions based on roles',
        'Test user login functionality'
      ]
    };

    fs.writeFileSync(
      path.join(__dirname, '../data/migration_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n📊 Migration Report Generated');
    console.log('=====================================');
    console.log(`Companies: ${this.stats.companies.imported}/${this.stats.companies.total} (${this.stats.companies.errors} errors)`);
    console.log(`Users: ${this.stats.users.imported} (${this.stats.users.errors} errors)`);
    console.log(`Products: ${this.stats.products.imported}/${this.stats.products.total} (${this.stats.products.errors} errors)`);
    console.log(`Total Errors: ${this.errors.length}`);
  }

  // Main migration process
  async migrate() {
    const startTime = Date.now();
    
    try {
      await this.initialize();
      
      // Clear existing data (optional)
      if (process.env.CLEAR_EXISTING_DATA === 'true') {
        console.log('🧹 Clearing existing data...');
        await Promise.all([
          Company.deleteMany({}),
          User.deleteMany({}),
          Product.deleteMany({})
        ]);
      }
      
      // Step-by-step migration
      await this.importSuppliers();
      await this.importBuyers();
      await this.importContacts();
      await this.importProducts();
      
      // Generate report
      const duration = Math.round((Date.now() - startTime) / 1000);
      await this.generateReport();
      
      console.log(`\n🎉 Migration completed in ${duration} seconds!`);
      console.log(`\n📧 Next: Send welcome emails to ${this.stats.users.imported} users`);
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error);
      throw error;
    } finally {
      await mongoose.connection.close();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new DataMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = DataMigrator;
