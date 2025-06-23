const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./src/models/User');

async function setupUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully!');
    
    // Clear existing test users
    await User.deleteMany({ email: { $in: ['admin@fdx.trading', 'buyer@fdx.trading', 'supplier@fdx.trading'] } });
    console.log('Cleared existing test users');
    
    const password = 'Admin123!';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create admin (no company required)
    const admin = new User({
      email: 'admin@fdx.trading',
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      isEmailVerified: true
    });
    await admin.save();
    console.log('✅ Created admin@fdx.trading');
    
    // Create agent (no company required)
    const agent = new User({
      email: 'agent@fdx.trading',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'Agent',
      role: 'agent',
      isActive: true,
      isEmailVerified: true
    });
    await agent.save();
    console.log('✅ Created agent@fdx.trading');
    
    console.log('\n=== LOGIN CREDENTIALS ===');
    console.log('Admin: admin@fdx.trading / Admin123!');
    console.log('Agent: agent@fdx.trading / Admin123!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

setupUsers();
