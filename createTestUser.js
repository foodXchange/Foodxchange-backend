const mongoose = require('mongoose');
require('dotenv').config();

async function createTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Define a simple schema without complex validation
    const simpleUserSchema = new mongoose.Schema({
      email: String,
      password: String,
      firstName: String,
      lastName: String,
      role: String,
      isActive: Boolean,
      isEmailVerified: Boolean
    });
    
    const SimpleUser = mongoose.model('User', simpleUserSchema, 'users');
    
    // Delete existing admin
    await SimpleUser.deleteOne({ email: 'admin@fdx.trading' });
    
    // Create admin with hashed password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    
    const admin = new SimpleUser({
      email: 'admin@fdx.trading',
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      isActive: true,
      isEmailVerified: true
    });
    
    await admin.save();
    console.log('✅ Admin created successfully');
    
    // Verify
    const check = await SimpleUser.findOne({ email: 'admin@fdx.trading' });
    console.log('Verification:', check ? 'User exists' : 'User not found');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestUser();
