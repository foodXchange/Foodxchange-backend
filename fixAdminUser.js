const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixAdminUser() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import User model
    const User = require('./src/models/User');

    // Delete existing admin user
    await User.deleteOne({ email: 'admin@fdx.trading' });
    console.log('Deleted existing admin user (if any)');

    // Create new admin user
    const adminData = {
      email: 'admin@fdx.trading',
      password: 'Admin123!', // This will be hashed by the pre-save hook
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      isEmailVerified: true
    };

    const admin = new User(adminData);
    await admin.save();
    console.log('✅ Admin user created successfully');

    // Verify the user can login
    const savedAdmin = await User.findOne({ email: 'admin@fdx.trading' });
    if (savedAdmin) {
      const isPasswordValid = await savedAdmin.comparePassword('Admin123!');
      console.log(`Password verification: ${isPasswordValid ? '✅ PASSED' : '❌ FAILED'}`);
      
      console.log('\nAdmin user details:');
      console.log('- Email:', savedAdmin.email);
      console.log('- Role:', savedAdmin.role);
      console.log('- Active:', savedAdmin.isActive);
      console.log('- ID:', savedAdmin._id);
    }

    console.log('\n=== LOGIN CREDENTIALS ===');
    console.log('Email: admin@fdx.trading');
    console.log('Password: Admin123!');
    console.log('=========================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 11000) {
      console.error('Duplicate key error - user might already exist');
    }
    process.exit(1);
  }
}

// Run the fix
fixAdminUser();
