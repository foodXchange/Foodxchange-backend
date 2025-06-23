const mongoose = require('mongoose');
const RFQ = require('./src/models/RFQ');
const User = require('./src/models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');

async function createSampleRFQs() {
  try {
    console.log('Creating sample RFQs...');
    
    // Get a buyer user
    const buyer = await User.findOne({ role: 'buyer' });
    if (!buyer) {
      console.log('No buyer found. Please create a buyer user first.');
      process.exit(1);
    }

    const sampleRFQs = [
      {
        buyer: buyer._id,
        title: 'Organic Quinoa - 500 tons',
        description: 'Looking for certified organic quinoa for our retail chain',
        items: [{
          productName: 'Organic White Quinoa',
          quantity: 300,
          unit: 'ton',
          packaging: '25kg bags',
          targetPrice: 3500,
          notes: 'Must be certified organic'
        }, {
          productName: 'Organic Red Quinoa',
          quantity: 200,
          unit: 'ton',
          packaging: '25kg bags',
          targetPrice: 4000,
          notes: 'Premium quality required'
        }],
        deliveryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        deliveryAddress: 'Central Warehouse, Tel Aviv, Israel',
        requirements: {
          organic: true,
          kosher: true
        },
        status: 'active'
      },
      {
        buyer: buyer._id,
        title: 'Almonds - Bulk Order',
        description: 'Need almonds for our production facility',
        items: [{
          productName: 'Raw Almonds',
          quantity: 50,
          unit: 'ton',
          packaging: 'Bulk containers',
          targetPrice: 8000
        }],
        deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        deliveryAddress: 'Production Facility, Haifa, Israel',
        requirements: {
          kosher: true
        },
        status: 'active'
      }
    ];

    for (const rfqData of sampleRFQs) {
      const rfq = new RFQ(rfqData);
      await rfq.save();
      console.log(`Created RFQ: ${rfq.title}`);
    }

    console.log('Sample RFQs created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating sample RFQs:', error);
    process.exit(1);
  }
}

createSampleRFQs();
