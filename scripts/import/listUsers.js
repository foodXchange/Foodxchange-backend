const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const User = require('../../src/models/User');
const Company = require('../../src/models/Company');

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log('Connected to MongoDB');
  
  const users = await User.find().populate('company').limit(20);
  
  console.log('\n=== AVAILABLE USERS FOR LOGIN ===\n');
  console.log('Default password for all users: foodx123\n');
  
  users.forEach(user => {
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`Role: ${user.role}`);
    console.log(`Company: ${user.company?.companyName || 'N/A'}`);
    console.log('---');
  });
  
  process.exit(0);
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
