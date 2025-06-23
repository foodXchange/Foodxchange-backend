const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define User Schema (in case model doesn't exist)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['buyer', 'supplier', 'admin'], required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Define Company Schema
const companySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['buyer', 'supplier'], required: true },
  email: String,
  phone: String,
  address: String,
  country: String,
  description: String,
  certifications: {
    kosher: { type: Boolean, default: false },
    organic: { type: Boolean, default: false },
    halal: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now }
});

const Company = mongoose.models.Company || mongoose.model('Company', companySchema);

async function seedUsers() {
  try {
    console.log('🌱 Starting user seed...\n');

    // Create test companies
    const buyerCompany = await Company.findOneAndUpdate(
      { name: 'Test Buyer Company' },
      {
        name: 'Test Buyer Company',
        type: 'buyer',
        email: 'buyer@testcompany.com',
        country: 'United States',
        description: 'Test buyer company for development'
      },
      { upsert: true, new: true }
    );

    const supplierCompany = await Company.findOneAndUpdate(
      { name: 'Test Supplier Company' },
      {
        name: 'Test Supplier Company',
        type: 'supplier',
        email: 'supplier@testcompany.com',
        country: 'Canada',
        description: 'Test supplier company for development',
        certifications: {
          kosher: true,
          organic: true
        }
      },
      { upsert: true, new: true }
    );

    console.log('✓ Created test companies');

    // Hash password for all test users
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create test users
    const testUsers = [
      {
        name: 'Test Buyer',
        email: 'buyer@test.com',
        password: hashedPassword,
        role: 'buyer',
        company: buyerCompany._id
      },
      {
        name: 'Test Supplier',
        email: 'supplier@test.com',
        password: hashedPassword,
        role: 'supplier',
        company: supplierCompany._id
      },
      {
        name: 'Admin User',
        email: 'admin@foodxchange.com',
        password: hashedPassword,
        role: 'admin'
      }
    ];

    for (const userData of testUsers) {
      const user = await User.findOneAndUpdate(
        { email: userData.email },
        userData,
        { upsert: true, new: true }
      );
      console.log(`✓ Created/Updated user: ${user.email} (role: ${user.role})`);
    }

    console.log('\n✅ User seed completed successfully!');
    console.log('\nTest credentials:');
    console.log('================');
    console.log('Buyer:    buyer@test.com / password123');
    console.log('Supplier: supplier@test.com / password123');
    console.log('Admin:    admin@foodxchange.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();
