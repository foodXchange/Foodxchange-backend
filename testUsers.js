// testUsers.js - Run this after server starts
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const Company = require('./src/models/Company');

require('dotenv').config();

const createTestUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB');

    // Create test companies
    const buyerCompany = await Company.create({
      name: 'Test Buyer Company',
      type: 'buyer',
      email: 'buyer@test.com',
      phone: '+1234567890',
      address: {
        country: 'USA',
        city: 'New York'
      },
      description: 'Test buyer company',
      status: 'active'
    });

    const supplierCompany = await Company.create({
      name: 'Test Supplier Company',
      type: 'supplier',
      email: 'supplier@test.com',
      phone: '+1234567890',
      address: {
        country: 'Israel',
        city: 'Tel Aviv'
      },
      description: 'Test supplier company',
      categories: ['Dairy', 'Beverages'],
      certifications: {
        kosher: { certified: true },
        organic: { certified: true }
      },
      status: 'active'
    });

    // Create test users
    const hashedPassword = await bcrypt.hash('test123', 10);

    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@foodxchange.com',
      password: hashedPassword,
      role: 'admin',
      isActive: true
    });

    const buyerUser = await User.create({
      name: 'Buyer User',
      email: 'buyer@foodxchange.com',
      password: hashedPassword,
      role: 'buyer',
      company: buyerCompany._id,
      isActive: true
    });

    const sellerUser = await User.create({
      name: 'Seller User',
      email: 'seller@foodxchange.com',
      password: hashedPassword,
      role: 'seller',
      company: supplierCompany._id,
      isActive: true
    });

    // Add users to companies
    buyerCompany.users.push(buyerUser._id);
    await buyerCompany.save();

    supplierCompany.users.push(sellerUser._id);
    await supplierCompany.save();

    console.log('\n✅ Test users created successfully!\n');
    console.log('Test Accounts:');
    console.log('==============');
    console.log('Admin:  admin@foodxchange.com / test123');
    console.log('Buyer:  buyer@foodxchange.com / test123');
    console.log('Seller: seller@foodxchange.com / test123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error creating test users:', error);
    process.exit(1);
  }
};

createTestUsers();
