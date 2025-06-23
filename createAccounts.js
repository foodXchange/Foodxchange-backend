const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Import existing models
const User = require('./src/models/User');
const Company = require('./src/models/Company');

// Define Buyer schema
const buyerSchema = new mongoose.Schema({
  buyerId: String,
  name: String,
  companyName: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  country: String,
  status: String
});

const Buyer = mongoose.model('Buyer', buyerSchema);

async function createUserAccounts() {
  try {
    console.log('Creating user accounts for buyers...\n');
    
    // Get first 5 buyers
    const buyers = await Buyer.find().limit(5);
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    for (const buyer of buyers) {
      if (!buyer.name) continue;
      
      // Create or update company
      const company = await Company.findOneAndUpdate(
        { name: buyer.companyName },
        {
          name: buyer.companyName || buyer.name + ' Company',
          type: 'buyer',
          email: buyer.email,
          phone: buyer.phone,
          address: buyer.address,
          country: buyer.country
        },
        { upsert: true, new: true }
      );
      
      // Create user account
      const email = buyer.email || `${buyer.name.toLowerCase().replace(/\s+/g, '.')}@foodxchange.com`;
      
      await User.findOneAndUpdate(
        { email },
        {
          name: buyer.name,
          email,
          password: hashedPassword,
          role: 'buyer',
          company: company._id
        },
        { upsert: true }
      );
      
      console.log(`✅ Created account for ${buyer.name}`);
      console.log(`   Email: ${email}`);
      console.log(`   Password: password123\n`);
    }
    
    // Also ensure test account exists
    await User.findOneAndUpdate(
      { email: 'buyer@test.com' },
      {
        name: 'Test Buyer',
        email: 'buyer@test.com',
        password: hashedPassword,
        role: 'buyer'
      },
      { upsert: true }
    );
    
    console.log('✅ Test account: buyer@test.com / password123');
    
    console.log('\n✅ All user accounts created successfully!');
    console.log('\nYou can now login to FoodXchange with any of the above credentials.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createUserAccounts();
