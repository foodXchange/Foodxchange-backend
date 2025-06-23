const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../../src/models/User');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  // Create admin user
  const adminEmail = 'admin@fdx.trading';
  const adminPassword = 'Admin123!';
  
  // Check if admin already exists
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (existingAdmin) {
    console.log('Admin user already exists!');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    process.exit(0);
  }
  
  // Create new admin
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const admin = new User({
    email: adminEmail,
    password: hashedPassword,
    firstName: 'System',
    lastName: 'Admin',
    role: 'admin',
    isActive: true,
    isEmailVerified: true
  });
  
  await admin.save();
  
  console.log('Admin user created successfully!');
  console.log(`Email: ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
