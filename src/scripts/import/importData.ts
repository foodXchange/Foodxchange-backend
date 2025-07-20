const fs = require('fs');
const path = require('path');

const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const BuyerContact = require('../models/BuyerContact');
const Company = require('../models/Company');
const Product = require('../models/Product');
const Proposal = require('../models/Proposal');
const Request = require('../models/Request');
const RequestLineItem = require('../models/RequestLineItem');
const User = require('../models/User');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Helper function to clean and parse data
function cleanData(str) {
  if (!str || str === 'N/A' || str === 'null') return null;
  return str.trim();
}

function parseBoolean(str) {
  return str && (str.toLowerCase() === 'yes' || str.toLowerCase() === 'true');
}

function parseDate(str) {
  if (!str) return null;
  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

// Import Buyers
async function importBuyers() {
  console.log('Importing Buyers...');
  const buyers = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Buyers 23_6_2025.csv'))
      .pipe(csv())
      .on('data', (row) => {
        const buyer = {
          name: cleanData(row['Company name']),
          type: 'buyer',
          email: cleanData(row['Email address']) || `${row['Buyer Code']}@foodxchange.com`,
          phone: cleanData(row['Phone Number']),
          website: cleanData(row['Company website']),
          country: cleanData(row['Company Country']) || 'Unknown',
          address: {
            street: cleanData(row['Buyer\'s company address']),
            shipping: cleanData(row['Ship to Address (Warehouse)'])
          },
          description: cleanData(row['Buyer\'s Description & Bus. Sector']),
          logo: cleanData(row['Company logo']),
          buyerCode: cleanData(row['Buyer Code']),
          buyerId: cleanData(row['Buyer\'s Company ID']),
          vatNumber: cleanData(row['Buyer\'s V.A.T Number']),
          status: 'active',
          createdAt: parseDate(row['First Created']) || new Date(),
          updatedAt: parseDate(row['Last Updated']) || new Date()
        };

        if (buyer.name) {
          buyers.push(buyer);
        }
      })
      .on('end', async () => {
        console.log(`Found ${buyers.length} buyers to import`);

        for (const buyer of buyers) {
          try {
            await Company.findOneAndUpdate(
              { buyerId: buyer.buyerId },
              buyer,
              { upsert: true, new: true }
            );
          } catch (error) {
            console.error(`Error importing buyer ${buyer.name}:`, error.message);
          }
        }

        console.log('Buyers import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Import Buyer Contacts
async function importBuyerContacts() {
  console.log('Importing Buyer Contacts...');
  const contacts = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Buyer Contacts 23_6_2025.csv'))
      .pipe(csv())
      .on('data', async (row) => {
        const contact = {
          buyerContactName: cleanData(row['Buyer\'s Contact Name']),
          fullName: cleanData(row['Full Name']),
          email: cleanData(row['Email']),
          jobPosition: cleanData(row['Job Position']),
          phone: cleanData(row['Phone']),
          mobile: cleanData(row['Mobile']),
          isActive: row['Active?'] === 'Yes',
          buyerCompanyName: cleanData(row['Buyer Company'])
        };

        if (contact.email && contact.fullName) {
          contacts.push(contact);
        }
      })
      .on('end', async () => {
        console.log(`Found ${contacts.length} contacts to import`);

        for (const contact of contacts) {
          try {
            // Find the buyer company
            const company = await Company.findOne({ name: contact.buyerCompanyName });
            if (company) {
              contact.buyerCompany = company._id;
              delete contact.buyerCompanyName;

              await BuyerContact.findOneAndUpdate(
                { email: contact.email },
                contact,
                { upsert: true, new: true }
              );
            }
          } catch (error) {
            console.error(`Error importing contact ${contact.email}:`, error.message);
          }
        }

        console.log('Buyer contacts import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Import Requests
async function importRequests() {
  console.log('Importing Requests...');
  const requests = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Requests 23_6_2025.csv'))
      .pipe(csv())
      .on('data', async (row) => {
        const request = {
          requestName: cleanData(row['Request name']),
          requestId: parseInt(row['Request ID']) || Math.floor(Math.random() * 10000),
          requestStatus: cleanData(row['Request status']) || 'Draft',
          productCategory: cleanData(row['Products Category & Family']) || 'General',
          requestBrief: cleanData(row['Request\'s Brief']),
          briefStatus: cleanData(row['Brief\'s Status']),
          projectStatus: cleanData(row['Project Status']),
          kosher: {
            required: row['Kosher'] === 'Yes',
            type: cleanData(row['Kosher Type']),
            passover: row['Passover Kosher'] === 'Yes'
          },
          packagingPreference: cleanData(row['Packaging preferance']),
          brandingRequirements: cleanData(row['Branding Requirements']),
          buyerName: cleanData(row['Buyer']),
          buyerDescription: cleanData(row['Buyer\'s Company Description']),
          latestSupplierAdded: parseDate(row['Latest Supplier Added']),
          createdAt: parseDate(row['First created']) || new Date(),
          updatedAt: parseDate(row['Last Updated']) || new Date(),
          openComments: parseInt(row['Open Comments']) || 0
        };

        if (request.requestName) {
          requests.push(request);
        }
      })
      .on('end', async () => {
        console.log(`Found ${requests.length} requests to import`);

        for (const request of requests) {
          try {
            // Find the buyer company
            const buyer = await Company.findOne({ name: request.buyerName });
            if (buyer) {
              request.buyer = buyer._id;
              delete request.buyerName;
              delete request.buyerDescription;

              await Request.findOneAndUpdate(
                { requestId: request.requestId },
                request,
                { upsert: true, new: true }
              );
            }
          } catch (error) {
            console.error(`Error importing request ${request.requestName}:`, error.message);
          }
        }

        console.log('Requests import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Import Request Line Items
async function importRequestLineItems() {
  console.log('Importing Request Line Items...');
  const items = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Request line items 23_6_2025.csv'))
      .pipe(csv())
      .on('data', async (row) => {
        const item = {
          requestProductName: cleanData(row['Request Product Name']) || cleanData(row['Requested Product name']),
          nutritionalAttributes: cleanData(row['Nutritional attributes']),
          sourcedWeight: cleanData(row['Sourced weight']),
          weightUnits: cleanData(row['Weight units']) || 'kg',
          additionalDetails: cleanData(row['Additional details']),
          benchmarkCompanyBrand: cleanData(row['Benchmark\'s Company/Brand']),
          benchmarkProductLink: cleanData(row['Benchmark\'s product link']),
          autoNumber: cleanData(row['Auto Number']),
          buyerCompanyName: cleanData(row['Buyer company']),
          requestName: cleanData(row['Link to Requests']),
          createdAt: parseDate(row['First Created']) || new Date(),
          updatedAt: parseDate(row['Last Updated']) || new Date(),
          openComments: parseInt(row['Open Comments']) || 0
        };

        if (item.requestProductName) {
          items.push(item);
        }
      })
      .on('end', async () => {
        console.log(`Found ${items.length} request line items to import`);

        for (const item of items) {
          try {
            // Find the request
            const request = await Request.findOne({ requestName: item.requestName });
            const buyerCompany = await Company.findOne({ name: item.buyerCompanyName });

            if (request) {
              item.request = request._id;
              item.buyerCompany = buyerCompany ? buyerCompany._id : null;
              delete item.requestName;
              delete item.buyerCompanyName;

              await RequestLineItem.create(item);
            }
          } catch (error) {
            console.error(`Error importing line item ${item.requestProductName}:`, error.message);
          }
        }

        console.log('Request line items import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Import Products
async function importProducts() {
  console.log('Importing Products...');
  const products = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Products 23_6_2025.csv'))
      .pipe(csv())
      .on('data', async (row) => {
        const product = {
          productId: cleanData(row['Product ID']),
          productCode: parseInt(row['Product code']),
          productName: cleanData(row['Product Name']),
          supplierName: cleanData(row['Supplier']),
          buyerCompanyName: cleanData(row['Buyer Company']),
          status: cleanData(row['Status']) || 'Pending',
          category: cleanData(row['Products Category & Family']) || 'General',
          pricing: {
            unitWholesalePrice: {
              latest: parseFloat(row['Unit Wholesale Price (latest)']) || 0,
              initial: parseFloat(row['Unit Wholesale Price (Initial)']) || 0,
              currency: cleanData(row['Currency for price']) || 'USD'
            },
            cartonPrice: parseFloat(row['Price for Carton (wholesale)']) || 0,
            incoterms: cleanData(row['Incoterms (Price Base)']) || cleanData(row['Incoterms']),
            paymentTerms: cleanData(row['Payment Terms'])
          },
          specifications: {
            grossWeight: parseFloat(row['Gross Weight']) || 0,
            netWeight: parseFloat(row['Net Weight']) || 0,
            unitsPerCarton: parseFloat(row['Units per carton']) || 0,
            unitOfMeasure: cleanData(row['Unit of Measure']) || 'units',
            hsTariffCode: cleanData(row['HS/ Tariff Code']),
            moqUnits: parseFloat(row['MOQ (units)']) || 0,
            shelfLifeDays: parseFloat(row['Shelf Life (Days)']) || 0,
            temperature: {
              min: parseFloat(row['Product\'s Min. temperature']) || null,
              max: parseFloat(row['Product\'s Max temperature']) || null
            }
          },
          logistics: {
            cartonsPerTwentyFt: parseFloat(row['# of Cartons (20ft)']) || 0,
            cartonsPerFortyFt: parseFloat(row['# of Cartons (40ft)']) || 0,
            palletsPerTwentyFt: parseFloat(row['# of Pallets (20ft)']) || 0,
            palletsPerFortyFt: parseFloat(row['# of Pallets in (40ft)']) || 0,
            totalUnitsTwentyFt: parseFloat(row['Total units (20ft.)']) || 0,
            totalUnitsFortyFt: parseFloat(row['Total units (40ft.)']) || 0,
            closestSeaPort: cleanData(row['Closest/ Prefered SeaPort'])
          },
          certifications: {
            kosher: row['Kosher?'] === 'Yes'
          },
          supplierProductCode: cleanData(row['Supplier Product Code']),
          buyerProductCode: cleanData(row['Buyer\'s Product code/ EAN']),
          productStage: cleanData(row['Product Stage']),
          supplierCountry: cleanData(row['Supplier Country']),
          createdAt: parseDate(row['First Created']) || new Date(),
          updatedAt: parseDate(row['Last Updated']) || new Date(),
          openComments: parseInt(row['Open Comments']) || 0
        };

        if (product.productName && product.productId) {
          products.push(product);
        }
      })
      .on('end', async () => {
        console.log(`Found ${products.length} products to import`);

        // First, ensure all suppliers exist
        const uniqueSuppliers = [...new Set(products.map(p => p.supplierName).filter(Boolean))];
        for (const supplierName of uniqueSuppliers) {
          if (supplierName) {
            await Company.findOneAndUpdate(
              { name: supplierName },
              {
                name: supplierName,
                type: 'supplier',
                status: 'active',
                country: products.find(p => p.supplierName === supplierName)?.supplierCountry || 'Unknown'
              },
              { upsert: true, new: true }
            );
          }
        }

        // Import products
        for (const product of products) {
          try {
            const supplier = await Company.findOne({ name: product.supplierName });
            const buyer = product.buyerCompanyName ?
              await Company.findOne({ name: product.buyerCompanyName }) : null;

            if (supplier) {
              product.supplier = supplier._id;
              product.buyerCompany = buyer ? buyer._id : null;
              delete product.supplierName;
              delete product.buyerCompanyName;
              delete product.supplierCountry;

              await Product.findOneAndUpdate(
                { productId: product.productId },
                product,
                { upsert: true, new: true }
              );
            }
          } catch (error) {
            console.error(`Error importing product ${product.productName}:`, error.message);
          }
        }

        console.log('Products import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Import Proposals
async function importProposals() {
  console.log('Importing Proposals...');
  const proposals = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(path.join(__dirname, '../../data/csv/Proposals  Samples 23_6_2025.csv'))
      .pipe(csv())
      .on('data', async (row) => {
        const proposal = {
          proposalId: cleanData(row['Proposal ID']),
          requestName: cleanData(row['Request']),
          buyerName: cleanData(row['Buyer']),
          supplierName: cleanData(row['Supplier']),
          status: cleanData(row['Status']) || 'Draft',
          logistics: {
            incoterms: cleanData(row['Incoterms']),
            portOfLoading: cleanData(row['Port of loading']),
            paymentTerms: cleanData(row['Payment Terms'])
          },
          documents: {
            proposalDoc: cleanData(row['Proposal Doc.']),
            productImages: cleanData(row['Product images']) ? [row['Product images']] : [],
            supplierLogo: cleanData(row['Supplier\'s Logo']),
            supplierProfileImages: cleanData(row['Supplier\'s Profile images']) ? [row['Supplier\'s Profile images']] : [],
            forecastFiles: cleanData(row['Forecast Files']) ? [row['Forecast Files']] : []
          },
          brandingLabel: cleanData(row['Branding Label']),
          sellerVatNumber: cleanData(row['Seller\'s VAT number']),
          supplierCountry: cleanData(row['Supplier\'s country']),
          autoNumber: parseInt(row['Auto Number']) || 0,
          createdAt: parseDate(row['First Created']) || new Date(),
          updatedAt: parseDate(row['Last Updated']) || new Date(),
          openComments: parseInt(row['Open Comments']) || 0
        };

        if (proposal.proposalId) {
          proposals.push(proposal);
        }
      })
      .on('end', async () => {
        console.log(`Found ${proposals.length} proposals to import`);

        for (const proposal of proposals) {
          try {
            // Find related entities
            const request = await Request.findOne({ requestName: proposal.requestName });
            const buyer = await Company.findOne({ name: proposal.buyerName });
            const supplier = await Company.findOne({ name: proposal.supplierName });

            if (request && buyer && supplier) {
              proposal.request = request._id;
              proposal.buyer = buyer._id;
              proposal.supplier = supplier._id;
              delete proposal.requestName;
              delete proposal.buyerName;
              delete proposal.supplierName;
              delete proposal.supplierCountry;

              await Proposal.findOneAndUpdate(
                { proposalId: proposal.proposalId },
                proposal,
                { upsert: true, new: true }
              );
            }
          } catch (error) {
            console.error(`Error importing proposal ${proposal.proposalId}:`, error.message);
          }
        }

        console.log('Proposals import completed');
        resolve();
      })
      .on('error', reject);
  });
}

// Main import function
async function importAllData() {
  try {
    console.log('Starting complete data import...\n');

    // Import in order of dependencies
    await importBuyers();
    await importBuyerContacts();
    await importRequests();
    await importRequestLineItems();
    await importProducts();
    await importProposals();

    console.log('\nData import completed successfully!');

    // Display summary
    const buyerCount = await Company.countDocuments({ type: 'buyer' });
    const supplierCount = await Company.countDocuments({ type: 'supplier' });
    const requestCount = await Request.countDocuments();
    const productCount = await Product.countDocuments();
    const proposalCount = await Proposal.countDocuments();

    console.log('\nImport Summary:');
    console.log(`- Buyers: ${buyerCount}`);
    console.log(`- Suppliers: ${supplierCount}`);
    console.log(`- Requests (RFQs): ${requestCount}`);
    console.log(`- Products: ${productCount}`);
    console.log(`- Proposals: ${proposalCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

// Run the import
importAllData();
