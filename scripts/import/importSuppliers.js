const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import models
const User = require('../../src/models/User');
const Company = require('../../src/models/Company');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  importSuppliers();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function importSuppliers() {
  try {
    const xlsxPath = path.join(__dirname, '../../data/Suppliers 22_6_2025.xlsx');
    console.log('Reading suppliers XLSX from:', xlsxPath);
    
    // Read the Excel file
    const workbook = XLSX.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const suppliers = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Found ${suppliers.length} suppliers to import`);
    
    // Import only first 10 active suppliers for testing
    let imported = 0;
    
    for (const supplier of suppliers) {
      if (imported >= 10) break;
      
      try {
        // Skip if no company name
        if (!supplier['Company Name']) continue;
        
        // Create company
        const company = new Company({
          companyType: 'supplier',
          companyName: supplier['Company Name'],
          companyCode: supplier['Supplier Code'] || `SUP${imported + 1}`,
          email: supplier['Company Email'] || `${supplier['Company Name'].toLowerCase().replace(/\s+/g, '')}@supplier.com`,
          phone: supplier['Company Phone'],
          website: supplier['Company Website'],
          address: {
            country: supplier["Supplier's Country"] || 'Unknown'
          },
          supplierData: {
            categories: supplier['Categories'] ? supplier['Categories'].split(',').map(c => c.trim()) : [],
            certifications: {
              kosher: supplier['Kosher certification'] === 'Yes'
            },
            supplierNumber: supplier['Shufersal Supplier number']
          },
          description: supplier["Supplier's Description & Products"] || '',
          status: 'active'
        });
        
        await company.save();
        console.log(`Created supplier company: ${company.companyName}`);
        
        // Create a default user for this company
        const defaultPassword = 'foodx123'; // You should change this
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        const user = new User({
          email: supplier['Company Email'] || `${supplier['Company Name'].toLowerCase().replace(/\s+/g, '')}@supplier.com`,
          password: hashedPassword,
          firstName: 'Admin',
          lastName: supplier['Company Name'].split(' ')[0],
          role: 'supplier',
          company: company._id,
          isActive: true,
          isEmailVerified: true
        });
        
        await user.save();
        console.log(`Created user for: ${company.companyName} with email: ${user.email}`);
        imported++;
        
      } catch (error) {
        console.error(`Error importing supplier ${supplier['Company Name']}:`, error.message);
      }
    }
    
    console.log(`Suppliers import completed. Imported ${imported} suppliers.`);
    process.exit(0);
  } catch (error) {
    console.error('Error reading suppliers file:', error);
    process.exit(1);
  }
}
