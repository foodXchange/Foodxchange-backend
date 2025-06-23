const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
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
  importBuyers();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function importBuyers() {
  const buyers = [];
  const csvPath = path.join(__dirname, '../../data/Buyers 22_6_2025.csv');
  
  console.log('Reading buyers CSV from:', csvPath);
  
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      buyers.push(row);
    })
    .on('end', async () => {
      console.log(`Found ${buyers.length} buyers to import`);
      
      for (const buyer of buyers) {
        try {
          // Create company
          const company = new Company({
            companyType: 'buyer',
            companyName: buyer['Company name'],
            companyCode: buyer['Buyer Code'],
            email: buyer['Email address'] || `${buyer['Buyer Code'].toLowerCase()}@foodxchange.com`,
            phone: buyer['Phone Number'],
            website: buyer['Company website'],
            address: {
              street: buyer["Buyer's company address"],
              country: buyer['Company Country']
            },
            buyerData: {
              businessSector: buyer["Buyer's Description & Bus. Sector"],
              warehouseAddress: buyer['Ship to Address (Warehouse)'],
              vatNumber: buyer["Buyer's V.A.T Number"]
            },
            description: buyer["Buyer's Description & Bus. Sector"],
            status: 'active'
          });
          
          await company.save();
          console.log(`Created company: ${company.companyName}`);
          
          // Create a default user for this company
          const defaultPassword = 'foodx123'; // You should change this
          const hashedPassword = await bcrypt.hash(defaultPassword, 10);
          
          const user = new User({
            email: buyer['Email address'] || `${buyer['Buyer Code'].toLowerCase()}@foodxchange.com`,
            password: hashedPassword,
            firstName: 'Admin',
            lastName: buyer['Company name'].split(' ')[0],
            role: 'buyer',
            company: company._id,
            isActive: true,
            isEmailVerified: true
          });
          
          await user.save();
          console.log(`Created user for: ${company.companyName} with email: ${user.email}`);
          
        } catch (error) {
          console.error(`Error importing buyer ${buyer['Company name']}:`, error.message);
        }
      }
      
      console.log('Buyers import completed');
      process.exit(0);
    });
}
