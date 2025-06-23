const mongoose = require('mongoose');
require('dotenv').config();

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const User = require('./src/models/User');
    
    // Find all users
    const users = await User.find({});
    console.log(`\nTotal users in database: ${users.length}`);
    
    users.forEach(user => {
      console.log(`\nEmail: ${user.email}`);
      console.log(`Role: ${user.role}`);
      console.log(`Active: ${user.isActive}`);
      console.log(`Has password: ${!!user.password}`);
    });
    
    // Check specifically for admin
    const admin = await User.findOne({ email: 'admin@fdx.trading' });
    if (admin) {
      console.log('\n✅ Admin user exists');
      // Test password
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare('Admin123!', admin.password);
      console.log(`Password test: ${isValid ? 'PASSED' : 'FAILED'}`);
    } else {
      console.log('\n❌ Admin user NOT found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
