import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define schemas
const buyerSchema = new mongoose.Schema({
  buyerId: String,
  name: String,
  companyName: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  country: String,
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  productId: String,
  name: String,
  category: String,
  description: String,
  supplier: String,
  origin: String,
  packaging: String,
  unitPrice: Number,
  minOrderQty: String,
  availability: String,
  certifications: {
    kosher: Boolean,
    organic: Boolean,
    halal: Boolean,
    nonGMO: Boolean
  },
  specifications: Object,
  createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  requestId: String,
  requestNumber: String,
  buyerId: String,
  buyerName: String,
  title: String,
  description: String,
  status: String,
  createdDate: Date,
  requiredDate: Date,
  deliveryLocation: String,
  totalItems: Number,
  totalProposals: Number,
  items: [{
    productName: String,
    quantity: Number,
    unit: String,
    specifications: String
  }]
});

const proposalSchema = new mongoose.Schema({
  proposalId: String,
  requestId: String,
  supplierId: String,
  supplierName: String,
  status: String,
  submittedDate: Date,
  totalPrice: Number,
  items: [{
    productId: String,
    productName: String,
    unitPrice: Number,
    quantity: Number,
    totalPrice: Number
  }],
  notes: String
});

// Create models
const Buyer = mongoose.model('Buyer', buyerSchema);
const Product = mongoose.model('Product', productSchema);
const Request = mongoose.model('Request', requestSchema);
const Proposal = mongoose.model('Proposal', proposalSchema);

// Helper function to parse CSV
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      resolve([]);
      return;
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Import functions
async function importBuyers() {
  console.log('\n📥 Importing Buyers...');
  const filePath = path.join(__dirname, '..', '..', 'data', 'Buyers 23_6_2025.csv');
  const buyers = await parseCSV(filePath);

  if (buyers.length === 0) {
    console.log('No buyer data found');
    return;
  }

  // Clear existing buyers
  await Buyer.deleteMany({});

  for (const buyer of buyers) {
    try {
      await Buyer.create({
        buyerId: buyer['Buyer ID'] || buyer.id,
        name: buyer['Buyer Name'] || buyer.name,
        companyName: buyer['Company Name'] || buyer.company,
        email: buyer['Email'] || buyer.email,
        phone: buyer['Phone'] || buyer.phone,
        address: buyer['Address'] || buyer.address,
        city: buyer['City'] || buyer.city,
        country: buyer['Country'] || buyer.country,
        status: buyer['Status'] || 'active'
      });
    } catch (error) {
      console.error('Error importing buyer:', error.message);
    }
  }

  const count = await Buyer.countDocuments();
  console.log(`✅ Imported ${count} buyers`);
}

async function importProducts() {
  console.log('\n📥 Importing Products...');
  const filePath = path.join(__dirname, '..', '..', 'data', 'Products 23_6_2025.csv');
  const products = await parseCSV(filePath);

  if (products.length === 0) {
    console.log('No product data found');
    return;
  }

  // Clear existing products
  await Product.deleteMany({});

  for (const product of products) {
    try {
      await Product.create({
        productId: product['Product ID'] || product.id,
        name: product['Product Name'] || product.name,
        category: product['Category'] || product.category,
        description: product['Description'] || product.description,
        supplier: product['Supplier'] || product.supplier,
        origin: product['Origin'] || product.origin,
        packaging: product['Packaging'] || product.packaging,
        unitPrice: parseFloat(product['Unit Price'] || product.price || 0),
        minOrderQty: product['Min Order Qty'] || product.minOrder,
        availability: product['Availability'] || 'available',
        certifications: {
          kosher: product['Kosher'] === 'Yes' || product.kosher === true,
          organic: product['Organic'] === 'Yes' || product.organic === true,
          halal: product['Halal'] === 'Yes' || product.halal === true,
          nonGMO: product['Non-GMO'] === 'Yes' || product.nonGMO === true
        }
      });
    } catch (error) {
      console.error('Error importing product:', error.message);
    }
  }

  const count = await Product.countDocuments();
  console.log(`✅ Imported ${count} products`);
}

async function importRequests() {
  console.log('\n📥 Importing Requests (RFQs)...');
  const requestsPath = path.join(__dirname, '..', '..', 'data', 'Requests 23_6_2025.csv');
  const lineItemsPath = path.join(__dirname, '..', '..', 'data', 'Request line items 23_6_2025.csv');

  const requests = await parseCSV(requestsPath);
  const lineItems = await parseCSV(lineItemsPath);

  if (requests.length === 0) {
    console.log('No request data found');
    return;
  }

  // Clear existing requests
  await Request.deleteMany({});

  for (const request of requests) {
    try {
      // Find line items for this request
      const requestItems = lineItems.filter(item =>
        item['Request ID'] === request['Request ID'] ||
        item.requestId === request.id
      );

      await Request.create({
        requestId: request['Request ID'] || request.id,
        requestNumber: request['Request Number'] || `RFQ-${request.id}`,
        buyerId: request['Buyer ID'] || request.buyerId,
        buyerName: request['Buyer Name'] || request.buyer,
        title: request['Title'] || request.title || 'Untitled RFQ',
        description: request['Description'] || request.description,
        status: request['Status'] || request.status || 'active',
        createdDate: new Date(request['Created Date'] || request.created || Date.now()),
        requiredDate: new Date(request['Required Date'] || request.required || Date.now()),
        deliveryLocation: request['Delivery Location'] || request.location,
        totalItems: requestItems.length,
        totalProposals: parseInt(request['Proposals'] || 0),
        items: requestItems.map(item => ({
          productName: item['Product Name'] || item.product,
          quantity: parseFloat(item['Quantity'] || item.qty || 0),
          unit: item['Unit'] || item.unit || 'kg',
          specifications: item['Specifications'] || item.specs
        }))
      });
    } catch (error) {
      console.error('Error importing request:', error.message);
    }
  }

  const count = await Request.countDocuments();
  console.log(`✅ Imported ${count} requests (RFQs)`);
}

async function importProposals() {
  console.log('\n📥 Importing Proposals...');
  const filePath = path.join(__dirname, '..', '..', 'data', 'Proposals Samples 23_6_2025.csv');
  const proposals = await parseCSV(filePath);

  if (proposals.length === 0) {
    console.log('No proposal data found');
    return;
  }

  // Clear existing proposals
  await Proposal.deleteMany({});

  for (const proposal of proposals) {
    try {
      await Proposal.create({
        proposalId: proposal['Proposal ID'] || proposal.id,
        requestId: proposal['Request ID'] || proposal.requestId,
        supplierId: proposal['Supplier ID'] || proposal.supplierId,
        supplierName: proposal['Supplier Name'] || proposal.supplier,
        status: proposal['Status'] || 'submitted',
        submittedDate: new Date(proposal['Submitted Date'] || proposal.submitted || Date.now()),
        totalPrice: parseFloat(proposal['Total Price'] || proposal.total || 0),
        notes: proposal['Notes'] || proposal.notes
      });
    } catch (error) {
      console.error('Error importing proposal:', error.message);
    }
  }

  const count = await Proposal.countDocuments();
  console.log(`✅ Imported ${count} proposals`);
}

// Create demo user accounts for buyers
async function createBuyerAccounts() {
  console.log('\n👤 Creating buyer user accounts...');

  const bcrypt = await import('bcryptjs');
  const User = (await import('./models/User')).default;
  const Company = (await import('./models/Company')).default;

  const buyers = await Buyer.find().limit(5); // Create accounts for first 5 buyers

  for (const buyer of buyers) {
    try {
      // Create company
      const company = await Company.findOneAndUpdate(
        { name: buyer.companyName },
        {
          name: buyer.companyName,
          type: 'buyer',
          email: buyer.email,
          phone: buyer.phone,
          address: buyer.address,
          country: buyer.country
        },
        { upsert: true, new: true }
      );

      // Create user account
      const email = buyer.email || `${buyer.name.toLowerCase().replace(/\s+/g, '.')}@foodxchange.com`;
      const hashedPassword = await bcrypt.hash('password123', 10);

      await User.findOneAndUpdate(
        { email },
        {
          name: buyer.name,
          email,
          password: hashedPassword,
          role: 'buyer',
          company: company._id
        },
        { upsert: true }
      );

      console.log(`✅ Created account for ${buyer.name} (${email})`);
    } catch (error) {
      console.error(`Error creating account for ${buyer.name}:`, error.message);
    }
  }
}

// Main import function
async function runImport() {
  try {
    console.log('🚀 Starting FoodXchange data import...\n');

    await importBuyers();
    await importProducts();
    await importRequests();
    await importProposals();
    await createBuyerAccounts();

    console.log('\n✅ Data import completed successfully!');

    // Show summary
    console.log('\n📊 Database Summary:');
    console.log('===================');
    console.log(`Buyers: ${await Buyer.countDocuments()}`);
    console.log(`Products: ${await Product.countDocuments()}`);
    console.log(`Requests (RFQs): ${await Request.countDocuments()}`);
    console.log(`Proposals: ${await Proposal.countDocuments()}`);

    const User = (await import('./models/User')).default;
    console.log(`User Accounts: ${await User.countDocuments()}`);

    console.log('\n📧 Sample Login Credentials:');
    console.log('===========================');
    const users = await User.find({ role: 'buyer' }).limit(3).populate('company');
    users.forEach(user => {
      console.log(`${user.name}: ${user.email} / password123`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Run the import
runImport();
