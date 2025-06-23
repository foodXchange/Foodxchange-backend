require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const fs = require('fs');
const csv = require('csv-parser');
const User = require('../src/models/User');
const Product = require('../src/models/Product');

async function importSuppliers() {
  try {
    await connectDB();
    console.log('Starting supplier import...');
    
    const suppliers = [];
    
    // Read your CSV file
    fs.createReadStream('./data/Suppliers.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Process each supplier
        suppliers.push({
          email: row['Company Email'] || `supplier${Date.now()}@foodxchange.com`,
          companyName: row['Company Name'],
          userType: 'vendor',
          country: row['Supplier\'s Country'],
          // Add more fields as needed
        });
      })
      .on('end', async () => {
        console.log(`Importing ${suppliers.length} suppliers...`);
        
        for (const supplier of suppliers.slice(0, 100)) { // Import first 100
          try {
            // Create user account
            const user = new User({
              ...supplier,
              password: 'TempPassword123!', // You'll need to hash this
              firstName: 'Supplier',
              lastName: 'User',
              isEmailVerified: true,
              isActive: true
            });
            
            await user.save();
            console.log(`Imported: ${supplier.companyName}`);
          } catch (error) {
            console.error(`Failed to import ${supplier.companyName}:`, error.message);
          }
        }
        
        console.log('Import complete!');
        process.exit(0);
      });
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

importSuppliers();
