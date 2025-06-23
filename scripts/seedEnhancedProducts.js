// scripts/seedEnhancedProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const connectDB = require('../src/config/db');

const enhancedProducts = [
  {
    name: 'Premium Basmati Rice - 1121 Sella',
    title: 'Premium Basmati Rice - 1121 Sella',
    description: 'Extra long grain basmati rice, parboiled (sella) variety. Aged for 2+ years with excellent cooking expansion.',
    shortDescription: 'Premium aged basmati rice with excellent aroma',
    category: 'grains',
    subcategory: 'rice',
    tags: ['basmati', 'sella', 'premium', 'aged', 'long-grain'],
    
    specifications: {
      physical: {
        weight: { value: 25, unit: 'kg' },
        color: 'Golden'
      },
      origin: {
        country: 'INDIA',
        region: 'Punjab'
      },
      quality: {
        grade: 'premium',
        moisture: { value: 12, unit: '%' }
      }
    },
    
    certifications: [
      { type: 'organic', certifier: 'India Organic' },
      { type: 'non-gmo', certifier: 'SGS' }
    ],
    
    pricing: {
      currency: 'USD',
      basePrice: { value: 1.45, unit: 'per kg' }
    },
    
    availability: {
      status: 'in-stock',
      quantity: { available: 50000, unit: 'kg' },
      minimumOrder: { value: 1000, unit: 'kg' }
    },
    
    status: 'active',
    visibility: 'public'
  }
  // Add more enhanced products here
];

async function seedEnhancedProducts() {
  try {
    await connectDB();
    console.log('🌱 Starting enhanced product seeding...');

    let supplier = await User.findOne({ userType: 'vendor' });
    
    if (!supplier) {
      supplier = await User.create({
        email: 'premium@foodxchange.com',
        password: 'TempPassword123!',
        firstName: 'Premium',
        lastName: 'Supplier',
        userType: 'vendor',
        companyName: 'Premium Food Suppliers Ltd',
        isVerified: true
      });
    }

    for (const productData of enhancedProducts) {
      productData.supplier = supplier._id;
      productData.createdBy = supplier._id;
      
      const product = await Product.create(productData);
      console.log('✅ Created enhanced product:', product.name);
    }

    console.log('🎉 Enhanced product seeding complete!');

  } catch (error) {
    console.error('❌ Enhanced seeding failed:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

seedEnhancedProducts();