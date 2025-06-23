const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../../src/models/User');
const Company = require('../../src/models/Company');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB\n');
  
  // Get counts
  const userCount = await User.countDocuments();
  const companyCount = await Company.countDocuments();
  
  console.log(`Total Users: ${userCount}`);
  console.log(`Total Companies: ${companyCount}\n`);
  
  // List users by role
  const roles = ['buyer', 'supplier', 'contractor', 'agent'];
  
  for (const role of roles) {
    console.log(`\n=== ${role.toUpperCase()} USERS ===`);
    const users = await User.find({ role }).populate('company').limit(5);
    
    users.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.firstName} ${user.lastName}`);
      console.log(`Company: ${user.company?.companyName || 'N/A'}`);
      console.log(`Active: ${user.isActive ? 'Yes' : 'No'}`);
      console.log('---');
    });
    
    const totalRole = await User.countDocuments({ role });
    console.log(`Total ${role}s: ${totalRole}`);
  }
  
  console.log('\n=== DEFAULT PASSWORD FOR ALL USERS ===');
  console.log('Password: Welcome123!');
  
  process.exit(0);
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
