const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const User = require('../../models/User');
const Company = require('../../models/Company');
const Request = require('../../models/Request');
const RequestLineItem = require('../../models/RequestLineItem');
const Product = require('../../models/Product');
const Proposal = require('../../models/Proposal');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected for data import');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Helper function to parse CSV
const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`));
      return;
    }
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

// Import Buyers
const importBuyers = async (filePath) => {
  console.log('\n📥 Importing Buyers...');
  try {
    const buyers = await parseCSV(filePath);
    let imported = 0;
    
    for (const buyer of buyers) {
      try {
        // Create company
        const company = new Company({
          name: buyer['Company name'],
          type: 'buyer',
          email: buyer['Email address'] || `${buyer['Buyer Code']}@foodxchange.com`,
          phone: buyer['Phone Number'],
          website: buyer['Company website'],
          country: buyer['Company Country'],
          description: buyer["Buyer's Description & Bus. Sector"],
          address: {
            street: buyer["Buyer's company address"],
            city: buyer['Company Country'] // You might want to parse this better
          },
          status: 'active',
          logo: buyer['Company logo']
        });
        
        await company.save();
        
        // Create default user for the company
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = new User({
          email: buyer['Email address'] || `${buyer['Buyer Code']}@foodxchange.com`,
          password: hashedPassword,
          name: buyer['Company name'] + ' Admin',
          role: 'buyer',
          company: company._id,
          isActive: true
        });
        
        await user.save();
        imported++;
      } catch (error) {
        console.error(`Error importing buyer ${buyer['Company name']}:`, error.message);
      }
    }
    
    console.log(`✅ Imported ${imported} buyers`);
  } catch (error) {
    console.error('Error importing buyers:', error);
  }
};

// Import Requests
const importRequests = async (filePath) => {
  console.log('\n📥 Importing Requests...');
  try {
    const requests = await parseCSV(filePath);
    let imported = 0;
    
    // First, get a mapping of buyer names to company IDs
    const buyers = await Company.find({ type: 'buyer' });
    const buyerMap = {};
    buyers.forEach(b => {
      buyerMap[b.name] = b._id;
    });
    
    for (const request of requests) {
      try {
        const buyerCompany = buyerMap[request['Buyer']];
        if (!buyerCompany) {
          console.warn(`Buyer not found: ${request['Buyer']}`);
          continue;
        }
        
        const newRequest = new Request({
          requestId: request['Request ID'],
          requestName: request['Request name'],
          status: request['Request status'] || 'draft',
          buyer: buyerCompany,
          category: request['Products Category & Family'],
          brief: request["Request's Brief"],
          kosher: request['Kosher'] === 'Yes',
          kosherType: request['Kosher Type'],
          passoverKosher: request['Passover Kosher'] === 'Yes',
          packaging: request['Packaging preferance'],
          brandingRequirements: request['Branding Requirements'],
          createdAt: new Date(request['First created']),
          updatedAt: new Date(request['Last Updated'])
        });
        
        await newRequest.save();
        imported++;
      } catch (error) {
        console.error(`Error importing request ${request['Request name']}:`, error.message);
      }
    }
    
    console.log(`✅ Imported ${imported} requests`);
  } catch (error) {
    console.error('Error importing requests:', error);
  }
};

// Import Request Line Items
const importRequestLineItems = async (filePath) => {
  console.log('\n📥 Importing Request Line Items...');
  try {
    const lineItems = await parseCSV(filePath);
    let imported = 0;
    
    // Get all requests for mapping
    const requests = await Request.find();
    const requestMap = {};
    requests.forEach(r => {
      requestMap[r.requestName] = r._id;
    });
    
    for (const item of lineItems) {
      try {
        // Find the associated request
        const requestName = item['Link to Requests'];
        const requestId = requestMap[requestName];
        
        if (!requestId) {
          console.warn(`Request not found for line item: ${requestName}`);
          continue;
        }
        
        const lineItem = new RequestLineItem({
          request: requestId,
          productName: item['Requested Product name'],
          benchmarkImages: item['benchmark images'],
          nutritionalAttributes: item['Nutritional attributes'],
          weight: item['Sourced weight'],
          weightUnit: item['Weight units'],
          additionalDetails: item['Additional details'],
          benchmarkCompany: item["Benchmark's Company/Brand"],
          benchmarkLink: item["Benchmark's product link"]
        });
        
        await lineItem.save();
        
        // Update the request with this line item
        await Request.findByIdAndUpdate(requestId, {
          $push: { lineItems: lineItem._id }
        });
        
        imported++;
      } catch (error) {
        console.error(`Error importing line item ${item['Request Product Name']}:`, error.message);
      }
    }
    
    console.log(`✅ Imported ${imported} request line items`);
  } catch (error) {
    console.error('Error importing request line items:', error);
  }
};

// Import Products
const importProducts = async (filePath) => {
  console.log('\n📥 Importing Products...');
  try {
    const products = await parseCSV(filePath);
    let imported = 0;
    
    // Get supplier mapping
    const suppliers = await Company.find({ type: 'supplier' });
    const supplierMap = {};
    suppliers.forEach(s => {
      supplierMap[s.name] = s._id;
    });
    
    for (const product of products) {
      try {
        // Find or create supplier
        let supplierId = supplierMap[product['Supplier']];
        if (!supplierId && product['Supplier']) {
          // Create supplier if doesn't exist
          const supplier = new Company({
            name: product['Supplier'],
            type: 'supplier',
            email: `${product['Supplier'].toLowerCase().replace(/\s+/g, '')}@supplier.com`,
            country: product['Supplier Country'] || 'Unknown',
            description: product["Supplier's Description & Products"],
            website: product["Supplier's Website"],
            status: 'active'
          });
          await supplier.save();
          supplierId = supplier._id;
          supplierMap[product['Supplier']] = supplier._id;
        }
        
        const newProduct = new Product({
          productId: product['Product ID'],
          productCode: product['Product code'],
          name: product['Product Name'],
          supplier: supplierId,
          category: product['Products Category & Family'],
          status: product['Status'] || 'active',
          pricing: {
            unitPrice: parseFloat(product['Unit Wholesale Price (latest)']) || 0,
            currency: product['Currency for price'] || 'USD',
            incoterms: product['Incoterms (Price Base)'],
            paymentTerms: product['Payment Terms']
          },
          packaging: {
            unitsPerCarton: parseInt(product['Units per carton']) || 0,
            grossWeight: parseFloat(product['Gross Weight']) || 0,
            netWeight: parseFloat(product['Net Weight']) || 0,
            unitOfMeasure: product['Unit of Measure']
          },
          logistics: {
            moq: parseInt(product['MOQ (units)']) || 0,
            containers20ft: parseInt(product['# of Cartons (20ft)']) || 0,
            containers40ft: parseInt(product['# of Cartons (40ft)']) || 0,
            pallets20ft: parseInt(product['# of Pallets (20ft)']) || 0,
            pallets40ft: parseInt(product['# of Pallets in (40ft)']) || 0,
            preferredPort: product['Closest/ Prefered SeaPort']
          },
          specifications: {
            hsTariffCode: product['HS/ Tariff Code'],
            shelfLife: parseInt(product['Shelf Life (Days)']) || 0,
            minTemp: parseFloat(product["Product's Min. temperature"]) || null,
            maxTemp: parseFloat(product["Product's Max temperature"]) || null
          },
          certifications: {
            kosher: product['Kosher?'] === 'Yes'
          },
          images: product['Product Images'] ? [product['Product Images']] : []
        });
        
        await newProduct.save();
        imported++;
      } catch (error) {
        console.error(`Error importing product ${product['Product Name']}:`, error.message);
      }
    }
    
    console.log(`✅ Imported ${imported} products`);
  } catch (error) {
    console.error('Error importing products:', error);
  }
};

// Import Proposals
const importProposals = async (filePath) => {
  console.log('\n📥 Importing Proposals...');
  try {
    const proposals = await parseCSV(filePath);
    let imported = 0;
    
    // Get mappings
    const requests = await Request.find();
    const suppliers = await Company.find({ type: 'supplier' });
    const products = await Product.find();
    
    const requestMap = {};
    requests.forEach(r => {
      if (r.requestId) requestMap[r.requestId] = r._id;
    });
    
    const supplierMap = {};
    suppliers.forEach(s => {
      supplierMap[s.name] = s._id;
    });
    
    const productMap = {};
    products.forEach(p => {
      productMap[p.name] = p._id;
    });
    
    for (const proposal of proposals) {
      try {
        const requestId = requestMap[proposal['ID (lookup from Request)']];
        const supplierId = supplierMap[proposal['Supplier']];
        
        if (!requestId || !supplierId) {
          console.warn(`Missing request or supplier for proposal ${proposal['Proposal ID']}`);
          continue;
        }
        
        const newProposal = new Proposal({
          proposalId: proposal['Proposal ID'],
          request: requestId,
          supplier: supplierId,
          status: proposal['Status'] || 'pending',
          products: proposal['Products'] ? [{
            product: productMap[proposal['Products']],
            quantity: 1,
            price: 0
          }] : [],
          incoterms: proposal['Incoterms'],
          portOfLoading: proposal['Port of loading'],
          paymentTerms: proposal['Payment Terms'],
          brandingLabel: proposal['Branding Label'],
          documents: {
            proposal: proposal['Proposal Doc.'],
            productImages: proposal['Product images'],
            forecast: proposal['Forecast Files']
          }
        });
        
        await newProposal.save();
        imported++;
      } catch (error) {
        console.error(`Error importing proposal ${proposal['Proposal ID']}:`, error.message);
      }
    }
    
    console.log(`✅ Imported ${imported} proposals`);
  } catch (error) {
    console.error('Error importing proposals:', error);
  }
};

// Main import function
const runImport = async () => {
  try {
    await connectDB();
    
    // Define file paths - adjust these to your actual CSV locations
    const dataDir = path.join(__dirname, '../../../data');
    
    // Import in order of dependencies
    await importBuyers(path.join(dataDir, 'Buyers 23_6_2025.csv'));
    await importRequests(path.join(dataDir, 'Requests 23_6_2025.csv'));
    await importRequestLineItems(path.join(dataDir, 'Request line items 23_6_2025.csv'));
    await importProducts(path.join(dataDir, 'Products 23_6_2025.csv'));
    await importProposals(path.join(dataDir, 'Proposals  Samples 23_6_2025.csv'));
    
    console.log('\n✅ Data import completed!');
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
};

// Run the import
runImport();
