// testUsersUpdated.js - Checks for existing users before creating
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const Company = require('./src/models/Company');

require('dotenv').config();

const createOrUpdateTestUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB');

    // Check for existing users
    const existingAdmin = await User.findOne({ email: 'admin@foodxchange.com' });
    const existingBuyer = await User.findOne({ email: 'buyer@foodxchange.com' });
    const existingSeller = await User.findOne({ email: 'seller@foodxchange.com' });

    if (existingAdmin && existingBuyer && existingSeller) {
      console.log('\n✅ Test users already exist!\n');
      console.log('Test Accounts:');
      console.log('==============');
      console.log('Admin:  admin@foodxchange.com / test123');
      console.log('Buyer:  buyer@foodxchange.com / test123');
      console.log('Seller: seller@foodxchange.com / test123');
      process.exit(0);
    }

    // Create companies if they don't exist
    let buyerCompany = await Company.findOne({ email: 'buyer@test.com' });
    if (!buyerCompany) {
      buyerCompany = await Company.create({
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
      console.log('Created buyer company');
    }

    let supplierCompany = await Company.findOne({ email: 'supplier@test.com' });
    if (!supplierCompany) {
      supplierCompany = await Company.create({
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
      console.log('Created supplier company');
    }

    // Create users if they don't exist
    const hashedPassword = await bcrypt.hash('test123', 10);

    if (!existingAdmin) {
      await User.create({
        name: 'Admin User',
        email: 'admin@foodxchange.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true
      });
      console.log('Created admin user');
    }

    if (!existingBuyer) {
      const buyerUser = await User.create({
        name: 'Buyer User',
        email: 'buyer@foodxchange.com',
        password: hashedPassword,
        role: 'buyer',
        company: buyerCompany._id,
        isActive: true
      });
      buyerCompany.users.push(buyerUser._id);
      await buyerCompany.save();
      console.log('Created buyer user');
    }

    if (!existingSeller) {
      const sellerUser = await User.create({
        name: 'Seller User',
        email: 'seller@foodxchange.com',
        password: hashedPassword,
        role: 'seller',
        company: supplierCompany._id,
        isActive: true
      });
      supplierCompany.users.push(sellerUser._id);
      await supplierCompany.save();
      console.log('Created seller user');
    }

    console.log('\n✅ Test users ready!\n');
    console.log('Test Accounts:');
    console.log('==============');
    console.log('Admin:  admin@foodxchange.com / test123');
    console.log('Buyer:  buyer@foodxchange.com / test123');
    console.log('Seller: seller@foodxchange.com / test123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error with test users:', error);
    process.exit(1);
  }
};

createOrUpdateTestUsers();
