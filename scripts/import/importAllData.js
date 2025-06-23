const mongoose = require('mongoose');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import models
const User = require('../../src/models/User');
const Company = require('../../src/models/Company');
const Product = require('../../src/models/Product');

// Default password for all imported users
const DEFAULT_PASSWORD = 'Welcome123!';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  console.log('Starting data import...\n');
  
  // Import all data
  await importBuyers();
  await importSuppliers();
  await importContractors();
  await importBuyerContacts();
  await importSupplierContacts();
  await importContractorContacts();
  await importProducts();
  
  // Create sample users for testing
  await createSampleUsers();
  
  console.log('\n=== IMPORT COMPLETED ===');
  process.exit(0);
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

async function importBuyers() {
  console.log('Importing Buyers...');
  const buyers = [];
  const csvPath = path.join(__dirname, '../../data/Buyers 22_6_2025.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => buyers.push(row))
      .on('end', async () => {
        for (const buyer of buyers) {
          try {
            const company = new Company({
              companyType: 'buyer',
              companyName: buyer['Company name'],
              companyCode: buyer['Buyer Code'],
              email: buyer['Email address'] || `${buyer['Buyer Code'].toLowerCase()}@fdx.trading`,
              phone: buyer['Phone Number'],
              website: buyer['Company website'],
              address: {
                street: buyer["Buyer's company address"],
                country: buyer['Company Country'] || 'Israel'
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
            console.log(`  ✓ Imported buyer: ${company.companyName}`);
          } catch (error) {
            console.error(`  ✗ Error importing buyer ${buyer['Company name']}:`, error.message);
          }
        }
        console.log(`Imported ${buyers.length} buyers\n`);
        resolve();
      });
  });
}

async function importSuppliers() {
  console.log('Importing Suppliers...');
  try {
    const xlsxPath = path.join(__dirname, '../../data/Suppliers 22_6_2025.xlsx');
    const workbook = XLSX.readFile(xlsxPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const suppliers = XLSX.utils.sheet_to_json(worksheet);
    
    let count = 0;
    for (const supplier of suppliers.slice(0, 50)) {
      try {
        if (!supplier['Company Name']) continue;
        
        const company = new Company({
          companyType: 'supplier',
          companyName: supplier['Company Name'],
          companyCode: supplier['Supplier Code'] || `SUP${count + 1}`,
          email: supplier['Company Email'] || `supplier${count + 1}@fdx.trading`,
          phone: supplier['Company Phone'],
          website: supplier['Company Website'],
          address: {
            country: supplier["Supplier's Country"] || 'Unknown'
          },
          supplierData: {
            categories: supplier['Categories'] ? supplier['Categories'].split(',').map(c => c.trim()) : [],
            certifications: {
              kosher: supplier['Kosher certification'] === 'Yes'
            }
          },
          description: supplier["Supplier's Description & Products"] || '',
          status: 'active'
        });
        
        await company.save();
        count++;
        console.log(`  ✓ Imported supplier: ${company.companyName}`);
      } catch (error) {
        console.error(`  ✗ Error importing supplier:`, error.message);
      }
    }
    console.log(`Imported ${count} suppliers\n`);
  } catch (error) {
    console.error('Error reading suppliers file:', error);
  }
}

async function importContractors() {
  console.log('Importing Contractors...');
  const contractors = [];
  const csvPath = path.join(__dirname, '../../data/Contractors 22_6_2025.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => contractors.push(row))
      .on('end', async () => {
        for (const contractor of contractors) {
          try {
            const company = new Company({
              companyType: 'contractor',
              companyName: contractor['Company name'],
              email: contractor['Company email address'] || `contractor@fdx.trading`,
              phone: contractor['Company phone number(s)'],
              website: contractor["Contartor's Website"],
              address: {
                street: contractor["Contractor's Address"],
                country: contractor['Country'] || 'Israel'
              },
              contractorData: {
                category: contractor['Category'],
                contractorType: contractor['Contractor by: foodX, Buyer, Supplier?']
              },
              status: 'active'
            });
            
            await company.save();
            console.log(`  ✓ Imported contractor: ${company.companyName}`);
          } catch (error) {
            console.error(`  ✗ Error importing contractor:`, error.message);
          }
        }
        console.log(`Imported ${contractors.length} contractors\n`);
        resolve();
      });
  });
}

async function importBuyerContacts() {
  console.log('Importing Buyer Contacts...');
  const contacts = [];
  const csvPath = path.join(__dirname, '../../data/Buyer Contacts 22_6_2025.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => contacts.push(row))
      .on('end', async () => {
        for (const contact of contacts) {
          try {
            const company = await Company.findOne({ companyName: contact['Buyer Company'] });
            if (!company) continue;
            
            const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
            const user = new User({
              email: contact['Email'] || `buyer.contact${Date.now()}@fdx.trading`,
              password: hashedPassword,
              firstName: contact['Full Name']?.split(' ')[0] || 'Buyer',
              lastName: contact['Full Name']?.split(' ').slice(1).join(' ') || 'Contact',
              role: 'buyer',
              company: company._id,
              jobTitle: contact['Job Position'],
              phone: contact['Phone'],
              mobile: contact['Mobile'],
              isActive: contact['Active?'] === 'Yes',
              isEmailVerified: true
            });
            
            await user.save();
            console.log(`  ✓ Created buyer contact: ${user.firstName} ${user.lastName} (${user.email})`);
          } catch (error) {
            console.error(`  ✗ Error creating buyer contact:`, error.message);
          }
        }
        console.log(`Imported ${contacts.length} buyer contacts\n`);
        resolve();
      });
  });
}

async function importSupplierContacts() {
  console.log('Importing Supplier Contacts...');
  const contacts = [];
  const csvPath = path.join(__dirname, '../../data/Supplier Contacts 22_6_2025.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => contacts.push(row))
      .on('end', async () => {
        let count = 0;
        for (const contact of contacts.slice(0, 20)) {
          try {
            const company = await Company.findOne({ companyName: contact["Contact's Company"] });
            if (!company) continue;
            
            const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
            const user = new User({
              email: contact['Email'] || `supplier.contact${Date.now()}@fdx.trading`,
              password: hashedPassword,
              firstName: contact["Contact person's name"]?.split(' ')[0] || 'Supplier',
              lastName: contact["Contact person's name"]?.split(' ').slice(1).join(' ') || 'Contact',
              role: 'supplier',
              company: company._id,
              jobTitle: contact['Job title'],
              mobile: contact['Mobile phone'],
              phone: contact['Office phone'],
              isActive: contact['Active?'] === 'Yes',
              isEmailVerified: true
            });
            
            await user.save();
            count++;
            console.log(`  ✓ Created supplier contact: ${user.firstName} ${user.lastName} (${user.email})`);
          } catch (error) {
            console.error(`  ✗ Error creating supplier contact:`, error.message);
          }
        }
        console.log(`Imported ${count} supplier contacts\n`);
        resolve();
      });
  });
}

async function importContractorContacts() {
  console.log('Importing Contractor Contacts...');
  const contacts = [];
  const csvPath = path.join(__dirname, '../../data/Contractors Contacts 22_6_2025.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => contacts.push(row))
      .on('end', async () => {
        for (const contact of contacts) {
          try {
            const company = await Company.findOne({ companyType: 'contractor' });
            if (!company) continue;
            
            const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
            const user = new User({
              email: contact['Email'] || `contractor.contact${Date.now()}@fdx.trading`,
              password: hashedPassword,
              firstName: contact['Full Name']?.split(' ')[0] || 'Contractor',
              lastName: contact['Full Name']?.split(' ').slice(1).join(' ') || 'Contact',
              role: 'contractor',
              company: company._id,
              jobTitle: contact['Job Position'],
              phone: contact['Phone'],
              mobile: contact['Mobile'],
              isActive: true,
              isEmailVerified: true
            });
            
            await user.save();
            console.log(`  ✓ Created contractor contact: ${user.firstName} ${user.lastName} (${user.email})`);
          } catch (error) {
            console.error(`  ✗ Error creating contractor contact:`, error.message);
          }
        }
        console.log(`Imported ${contacts.length} contractor contacts\n`);
        resolve();
      });
  });
}

async function importProducts() {
  console.log('Importing Products...');
  const products = [];
  const csvPath = path.join(__dirname, '../../data/Products 22_6_2025 1.csv');
  
  return new Promise((resolve) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => products.push(row))
      .on('end', async () => {
        let count = 0;
        for (const product of products.slice(0, 50)) {
          try {
            const supplier = await Company.findOne({ companyName: product['Supplier'] });
            if (!supplier) continue;
            
            const newProduct = new Product({
              productCode: product['Product code'],
              supplier: supplier._id,
              name: product['Product Name'],
              description: product["Supplier's Description & Products"] || '',
              category: product['Products Category & Family'] || 'General',
              specifications: {
                grossWeight: parseFloat(product['Gross Weight']) || 0,
                netWeight: parseFloat(product['Net Weight']) || 0,
                unitOfMeasure: product['Unit of Measure'],
                unitsPerCarton: parseInt(product['Units per carton']) || 0,
                minTemperature: parseFloat(product["Product's Min. temperature"]) || 0,
                maxTemperature: parseFloat(product["Product's Max temperature"]) || 0,
                shelfLifeDays: parseInt(product['Shelf Life (Days)']) || 0
              },
              pricing: {
                currency: product['Currency for price'] || 'USD',
                wholesalePrice: parseFloat(product['Unit Wholesale Price (latest)']) || 0,
                pricePerCarton: parseFloat(product['Price for Carton (wholesale)']) || 0,
                moqUnits: parseInt(product['MOQ (units)']) || 0,
                incoterms: product['Incoterms (Price Base)'],
                paymentTerms: product['Payment Terms']
              },
              certifications: {
                kosher: product['Kosher?'] === 'Yes'
              },
              status: 'active'
            });
            
            await newProduct.save();
            count++;
            console.log(`  ✓ Imported product: ${newProduct.name}`);
          } catch (error) {
            console.error(`  ✗ Error importing product:`, error.message);
          }
        }
        console.log(`Imported ${count} products\n`);
        resolve();
      });
  });
}

async function createSampleUsers() {
  console.log('Creating sample users for testing...');
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  
  // Create one user of each type for easy testing
  const sampleUsers = [
    {
      email: 'buyer@fdx.trading',
      firstName: 'Test',
      lastName: 'Buyer',
      role: 'buyer',
      company: await Company.findOne({ companyType: 'buyer' })
    },
    {
      email: 'supplier@fdx.trading',
      firstName: 'Test',
      lastName: 'Supplier',
      role: 'supplier',
      company: await Company.findOne({ companyType: 'supplier' })
    },
    {
      email: 'contractor@fdx.trading',
      firstName: 'Test',
      lastName: 'Contractor',
      role: 'contractor',
      company: await Company.findOne({ companyType: 'contractor' })
    },
    {
      email: 'agent@fdx.trading',
      firstName: 'Test',
      lastName: 'Agent',
      role: 'agent'
    }
  ];
  
  for (const userData of sampleUsers) {
    try {
      const user = new User({
        ...userData,
        password: hashedPassword,
        isActive: true,
        isEmailVerified: true,
        company: userData.company?._id
      });
      
      await user.save();
      console.log(`  ✓ Created sample ${userData.role}: ${userData.email}`);
    } catch (error) {
      console.error(`  ✗ Error creating sample user:`, error.message);
    }
  }
  
  console.log(`\n=== LOGIN CREDENTIALS ===`);
  console.log(`Default password for ALL users: ${DEFAULT_PASSWORD}`);
  console.log(`\nSample accounts:`);
  console.log(`Buyer:      buyer@fdx.trading`);
  console.log(`Supplier:   supplier@fdx.trading`);
  console.log(`Contractor: contractor@fdx.trading`);
  console.log(`Agent:      agent@fdx.trading`);
}
