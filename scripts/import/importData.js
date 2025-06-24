const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const Seller = require('../src/models/seller/Seller');
const Product = require('../src/models/seller/Product');
const bcrypt = require('bcryptjs');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

class DataImporter {
  constructor() {
    this.importedSuppliers = 0;
    this.importedProducts = 0;
    this.errors = [];
  }

  // Import suppliers from Excel file
  async importSuppliers(filePath) {
    console.log('📊 Starting supplier import from:', filePath);
    
    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`Found ${data.length} suppliers to import`);
      
      for (const row of data) {
        try {
          await this.importSingleSupplier(row);
        } catch (error) {
          this.errors.push({
            supplier: row['Company Name'] || row['Supplier Name'],
            error: error.message
          });
        }
      }
      
      console.log(`✅ Import completed!`);
      console.log(`   Imported: ${this.importedSuppliers} suppliers`);
      console.log(`   Errors: ${this.errors.length}`);
      
      if (this.errors.length > 0) {
        console.log('\n❌ Errors:');
        this.errors.forEach(err => {
          console.log(`   - ${err.supplier}: ${err.error}`);
        });
      }
      
    } catch (error) {
      console.error('Import failed:', error);
    }
  }

  // Import single supplier
  async importSingleSupplier(data) {
    // Skip if no company name
    if (!data['Company Name'] && !data['Supplier Name']) {
      return;
    }
    
    const companyName = data['Company Name'] || data['Supplier Name'];
    const companyEmail = data['Company Email'] || `contact@${companyName.toLowerCase().replace(/\s+/g, '')}.com`;
    
    // Check if supplier already exists
    const existingSupplier = await Seller.findOne({
      $or: [
        { companyName: companyName },
        { companyEmail: companyEmail }
      ]
    });
    
    if (existingSupplier) {
      console.log(`   ⚠️  Skipping ${companyName} - already exists`);
      return;
    }
    
    // Generate a temporary password
    const tempPassword = await bcrypt.hash('TempPass123!', 10);
    
    // Parse categories
    let categories = [];
    if (data['Categories']) {
      categories = data['Categories'].split(',').map(cat => cat.trim()).filter(Boolean);
    } else if (data['Product Category & family (Txt)']) {
      // Extract categories from description
      const categoryText = data['Product Category & family (Txt)'];
      categories = this.extractCategories(categoryText);
    }
    
    // Parse certifications
    const hasKosher = data['Kosher certification'] === 'Yes' || 
                     data['Kosher?'] === 'Yes' ||
                     (data["Supplier's Description & Products"] && 
                      data["Supplier's Description & Products"].toLowerCase().includes('kosher'));
    
    // Create new supplier
    const newSupplier = new Seller({
      supplierName: companyName,
      companyName: companyName,
      supplierCode: data['Supplier Code'] || data['Auto Number'],
      autoNumber: data['Auto Number'],
      email: companyEmail.toLowerCase(),
      password: tempPassword,
      companyEmail: companyEmail.toLowerCase(),
      companyWebsite: data['Company website'] || data['Open Website'],
      phone: data['Phone'],
      vatNumber: data["Supplier's VAT number"],
      address: data['Address'] || data['Company address'],
      country: data["Supplier's Country"] || 'Unknown',
      closestSeaPort: data['Closest/ Prefered SeaPort'],
      distanceToSeaport: parseFloat(data['Distance to Seaport (km)']) || null,
      categories: categories,
      productCategoryText: data['Product Category & family (Txt)'],
      description: this.cleanDescription(data["Supplier's Description & Products"]),
      incoterms: data['Incoterms'] || data['Incoterms (Price Base)'],
      paymentTerms: data['Terms of Payment'],
      certifications: {
        kosher: hasKosher,
        organic: this.checkCertification(data, 'organic'),
        iso: this.checkCertification(data, 'iso'),
        haccp: this.checkCertification(data, 'haccp'),
        brc: this.checkCertification(data, 'brc'),
        ifs: this.checkCertification(data, 'ifs')
      },
      primaryContact: {
        name: 'Import Contact',
        email: companyEmail.toLowerCase(),
        jobTitle: 'Export Manager'
      },
      isActive: true, // Auto-activate imported suppliers
      isVerified: false, // Require verification
      importSource: 'excel_import',
      originalData: data,
      registeredAt: new Date(data['First Created'] || Date.now())
    });
    
    await newSupplier.save();
    this.importedSuppliers++;
    console.log(`   ✓ Imported: ${companyName} (${newSupplier.country})`);
  }
  
  // Clean description text
  cleanDescription(desc) {
    if (!desc) return '';
    
    // Remove duplicate content
    const lines = desc.split('\\n');
    const uniqueLines = [...new Set(lines)];
    
    // Limit length
    return uniqueLines.join('\n').substring(0, 2000);
  }
  
  // Extract categories from text
  extractCategories(text) {
    if (!text) return [];
    
    const commonCategories = [
      'Dairy Products', 'Frozen Foods', 'Beverages', 'Snacks',
      'Pasta', 'Sauces', 'Oils', 'Canned Goods', 'Bakery',
      'Confectionery', 'Meat', 'Seafood', 'Organic', 'Gluten-Free'
    ];
    
    const foundCategories = [];
    const lowerText = text.toLowerCase();
    
    commonCategories.forEach(cat => {
      if (lowerText.includes(cat.toLowerCase())) {
        foundCategories.push(cat);
      }
    });
    
    return foundCategories;
  }
  
  // Check for certifications in text
  checkCertification(data, certType) {
    const desc = data["Supplier's Description & Products"] || '';
    const categories = data['Product Category & family (Txt)'] || '';
    const combined = (desc + ' ' + categories).toLowerCase();
    
    return combined.includes(certType.toLowerCase());
  }
  
  // Import products from CSV
  async importProducts(filePath) {
    console.log('\n📦 Starting product import from:', filePath);
    
    const products = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        products.push(row);
      })
      .on('end', async () => {
        console.log(`Found ${products.length} products to import`);
        
        for (const product of products) {
          try {
            await this.importSingleProduct(product);
          } catch (error) {
            console.error(`   ❌ Error importing ${product['Product Name']}: ${error.message}`);
          }
        }
        
        console.log(`\n✅ Product import completed!`);
        console.log(`   Imported: ${this.importedProducts} products`);
      });
  }
  
  // Import single product
  async importSingleProduct(data) {
    // Skip if no product name
    if (!data['Product Name']) return;
    
    // Find supplier
    let supplier = null;
    if (data['Supplier']) {
      supplier = await Seller.findOne({ 
        companyName: { $regex: new RegExp(data['Supplier'], 'i') }
      });
    }
    
    // Create product
    const newProduct = new Product({
      productId: data['Product ID'],
      productCode: parseInt(data['Product code']) || null,
      productName: data['Product Name'],
      supplier: supplier?._id,
      supplierName: data['Supplier'],
      supplierCountry: data['Supplier Country'],
      buyerCompany: data['Buyer Company'],
      buyerProductCode: data["Buyer's Product code/ EAN"],
      category: this.parseCategory(data['Products Category & Family']),
      categoryFamily: data['Products Category & Family'],
      unitOfMeasure: data['Unit of Measure'],
      netWeight: parseFloat(data['Net Weight']) || null,
      grossWeight: parseFloat(data['Gross Weight']) || null,
      unitsPerCarton: parseInt(data['Units per carton']) || null,
      minOrderQty: parseInt(data['MOQ (units)']) || null,
      pricing: {
        unitPrice: parseFloat(data['Unit Wholesale Price (latest)']) || 0,
        cartonPrice: parseFloat(data['Price for Carton (wholesale)']) || 0,
        currency: data['Currency for price'] || 'USD',
        incoterms: data['Incoterms'],
        priceBase: data['Incoterms (Price Base)']
      },
      logistics: {
        hsTariffCode: data['HS/ Tariff Code'],
        closestSeaPort: data['Closest/ Prefered SeaPort'],
        cartons20ft: parseInt(data['# of Cartons (20ft)']) || null,
        cartons40ft: parseInt(data['# of Cartons (40ft)']) || null,
        pallets20ft: parseInt(data['# of Pallets (20ft)']) || null,
        pallets40ft: parseInt(data['# of Pallets in (40ft)']) || null,
        totalUnits20ft: parseInt(data['Total units (20ft.)']) || null,
        totalUnits40ft: parseInt(data['Total units (40ft.)']) || null
      },
      storage: {
        shelfLifeDays: parseInt(data['Shelf Life (Days)']) || null,
        minTemperature: parseFloat(data["Product's Min. temperature"]) || null,
        maxTemperature: parseFloat(data["Product's Max temperature"]) || null
      },
      certifications: {
        kosher: data['Kosher?'] === 'Yes'
      },
      status: data['Status'] === 'Sourcing Stage' ? 'active' : 'pending',
      stage: data['Product Stage'],
      createdBy: 'import_script',
      importedFrom: 'csv_import',
      createdAt: new Date(data['First Created'] || Date.now()),
      updatedAt: new Date(data['Last Updated'] || Date.now())
    });
    
    // Add to supplier's products array if supplier found
    if (supplier) {
      await newProduct.save();
      supplier.products.push(newProduct._id);
      supplier.metrics.totalProducts = supplier.products.length;
      await supplier.save();
      
      this.importedProducts++;
      console.log(`   ✓ Imported: ${newProduct.productName} (${supplier.companyName})`);
    } else {
      // Save product without supplier link
      await newProduct.save();
      this.importedProducts++;
      console.log(`   ✓ Imported: ${newProduct.productName} (No supplier linked)`);
    }
  }
  
  // Parse category from string
  parseCategory(categoryString) {
    if (!categoryString) return 'Uncategorized';
    
    const parts = categoryString.split(',');
    return parts[0].trim();
  }
  
  // Import supplier contacts
  async importContacts(filePath) {
    console.log('\n👥 Starting contacts import from:', filePath);
    
    const contacts = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        contacts.push(row);
      })
      .on('end', async () => {
        console.log(`Found ${contacts.length} contacts to import`);
        
        let updatedSuppliers = 0;
        
        for (const contact of contacts) {
          try {
            // Find supplier by company name
            const companyName = contact["Contact's Company"];
            if (!companyName) continue;
            
            const supplier = await Seller.findOne({
              companyName: { $regex: new RegExp(companyName, 'i') }
            });
            
            if (supplier) {
              const newContact = {
                name: contact["Contact person's name"],
                jobTitle: contact['Job title'],
                email: contact['Email'],
                mobile: contact['Mobile phone'],
                office: contact['Office phone'],
                isActive: contact['Active?'] !== 'No'
              };
              
              // Add as additional contact if not primary
              if (supplier.additionalContacts.length < 5) {
                supplier.additionalContacts.push(newContact);
                await supplier.save();
                updatedSuppliers++;
                console.log(`   ✓ Added contact for: ${companyName}`);
              }
            }
          } catch (error) {
            console.error(`   ❌ Error importing contact: ${error.message}`);
          }
        }
        
        console.log(`\n✅ Contacts import completed!`);
        console.log(`   Updated ${updatedSuppliers} suppliers with contacts`);
      });
  }
}

// Run import
async function runImport() {
  const importer = new DataImporter();
  
  try {
    // Import suppliers
    await importer.importSuppliers(
      path.join(__dirname, '../data/Suppliers 23_6_2025.xlsx')
    );
    
    // Wait a bit before importing products
    setTimeout(async () => {
      // Import products
      await importer.importProducts(
        path.join(__dirname, '../data/Products 23_6_2025.csv')
      );
      
      // Import contacts
      setTimeout(async () => {
        await importer.importContacts(
          path.join(__dirname, '../data/Supplier Contacts 23_6_2025.csv')
        );
        
        // Close connection
        setTimeout(() => {
          mongoose.connection.close();
          console.log('\n🎉 All imports completed!');
        }, 5000);
      }, 5000);
    }, 5000);
    
  } catch (error) {
    console.error('Import failed:', error);
    mongoose.connection.close();
  }
}

// Execute if run directly
if (require.main === module) {
  runImport();
}

module.exports = DataImporter;
