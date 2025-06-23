// scripts/addTestProduct.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const connectDB = require('../src/config/db');

async function addTestProduct() {
  try {
    await connectDB();
    
    let supplier = await User.findOne({ userType: 'vendor' });
    
    const testProduct = {
      name: 'Extra Virgin Olive Oil Premium',
      title: 'Extra Virgin Olive Oil Premium',
      description: 'Premium cold-pressed extra virgin olive oil from Mediterranean olives. Perfect for cooking and salads.',
      shortDescription: 'Premium Mediterranean olive oil',
      category: 'oils',
      subcategory: 'olive-oil',
      tags: ['olive-oil', 'extra-virgin', 'premium', 'mediterranean', 'cold-pressed'],
      status: 'active',
      visibility: 'public',
      supplier: supplier._id,
      createdBy: supplier._id,
      pricing: {
        currency: 'USD',
        basePrice: { value: 12.50, unit: 'per bottle' }
      },
      availability: {
        status: 'in-stock',
        quantity: { available: 1000, unit: 'bottles' },
        minimumOrder: { value: 10, unit: 'bottles' }
      }
    };
    
    const product = await Product.create(testProduct);
    console.log('Created test product:', product.name);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

addTestProduct();
