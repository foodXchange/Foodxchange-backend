// scripts/seedRealProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const connectDB = require('../src/config/db');

const simpleProducts = [
  {
    name: 'Premium Basmati Rice',
    title: 'Premium Basmati Rice',
    description: 'High-quality basmati rice from India',
    category: 'grains',
    subcategory: 'rice',
    tags: ['basmati', 'premium', 'rice'],
    status: 'active',
    visibility: 'public',
    pricing: {
      currency: 'USD',
      basePrice: { value: 1.45, unit: 'per kg' }
    },
    availability: {
      status: 'in-stock',
      quantity: { available: 50000, unit: 'kg' },
      minimumOrder: { value: 1000, unit: 'kg' }
    }
  },
  {
    name: 'Organic Wheat Flour',
    title: 'Organic Wheat Flour',
    description: 'Stone ground organic wheat flour',
    category: 'grains',
    subcategory: 'flour',
    tags: ['organic', 'wheat', 'flour'],
    status: 'active',
    visibility: 'public',
    pricing: {
      currency: 'USD',
      basePrice: { value: 0.89, unit: 'per kg' }
    },
    availability: {
      status: 'in-stock',
      quantity: { available: 25000, unit: 'kg' },
      minimumOrder: { value: 500, unit: 'kg' }
    }
  },
  {
    name: 'Yellow Corn Feed Grade',
    title: 'Yellow Corn Feed Grade',
    description: 'High-quality corn for livestock feed',
    category: 'grains',
    subcategory: 'corn',
    tags: ['corn', 'maize', 'feed'],
    status: 'active',
    visibility: 'public',
    pricing: {
      currency: 'USD',
      basePrice: { value: 0.32, unit: 'per kg' }
    },
    availability: {
      status: 'in-stock',
      quantity: { available: 100000, unit: 'kg' },
      minimumOrder: { value: 5000, unit: 'kg' }
    }
  }
];

async function seedRealProducts() {
  try {
    await connectDB();
    console.log('Starting product seeding...');

    let supplier = await User.findOne({ userType: 'vendor' });
    
    if (!supplier) {
      supplier = await User.create({
        email: 'supplier@foodxchange.com',
        password: 'TempPassword123!',
        firstName: 'Test',
        lastName: 'Supplier',
        userType: 'vendor',
        companyName: 'Global Food Suppliers Ltd',
        isVerified: true
      });
      console.log('Created supplier user');
    }

    await Product.deleteMany({
      name: { $in: ['Premium Basmati Rice', 'Organic Wheat Flour', 'Yellow Corn Feed Grade'] }
    });

    for (const productData of simpleProducts) {
      productData.supplier = supplier._id;
      productData.createdBy = supplier._id;
      
      const product = await Product.create(productData);
      console.log('Created:', product.name || product.title);
    }

    console.log('Successfully seeded', simpleProducts.length, 'products!');

  } catch (error) {
    console.error('Seeding failed:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.connection.close();
  }
}

seedRealProducts();
