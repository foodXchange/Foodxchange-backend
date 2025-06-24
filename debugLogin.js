// debugLogin.js - Debug login issues
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

require('dotenv').config();

const debugLogin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB\n');

    // Find all test users
    const users = await User.find({ 
      email: { $in: ['admin@foodxchange.com', 'buyer@foodxchange.com', 'seller@foodxchange.com'] }
    });

    console.log('Found users:');
    for (const user of users) {
      console.log(`\n${user.role.toUpperCase()} User:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Active: ${user.isActive}`);
      
      // Test password
      const testPassword = 'test123';
      const isMatch = await bcrypt.compare(testPassword, user.password);
      console.log(`  Password 'test123' works: ${isMatch ? '✅ YES' : '❌ NO'}`);
      
      if (!isMatch) {
        // Reset password to test123
        const hashedPassword = await bcrypt.hash('test123', 10);
        user.password = hashedPassword;
        await user.save();
        console.log('  ✅ Password reset to: test123');
      }
    }

    console.log('\n✅ All test accounts should now work with password: test123');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

debugLogin();
