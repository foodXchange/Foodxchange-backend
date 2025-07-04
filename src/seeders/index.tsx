const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const {
  User,
  Company,
  Product,
  Category,
  RFQ,
  Order,
  Review,
  Conversation,
  Message,
  AnalyticsEvent,
  Notification
} = require('../models');

const connectDB = require('../config/database');

// Sample data
const sampleCategories = [
  {
    name: 'Beverages',
    slug: 'beverages',
    description: 'All types of beverages including juices, sodas, and specialty drinks',
    attributes: [
      { name: 'Volume', type: 'number', unit: 'ml', required: true },
      { name: 'Packaging', type: 'select', options: ['Bottle', 'Can', 'Carton', 'Pouch'], required: true },
      { name: 'Organic', type: 'boolean', required: false }
    ]
  },
  {
    name: 'Dairy Products',
    slug: 'dairy-products',
    description: 'Milk, cheese, yogurt, and other dairy products',
    attributes: [
      { name: 'Fat Content', type: 'select', options: ['Whole', 'Low-fat', 'Non-fat'], required: true },
      { name: 'Pasteurized', type: 'boolean', required: true },
      { name: 'Shelf Life', type: 'number', unit: 'days', required: true }
    ]
  },
  {
    name: 'Packaged Foods',
    slug: 'packaged-foods',
    description: 'Pre-packaged ready-to-eat and prepared foods',
    attributes: [
      { name: 'Weight', type: 'number', unit: 'g', required: true },
      { name: 'Preservatives', type: 'boolean', required: false },
      { name: 'Gluten-Free', type: 'boolean', required: false }
    ]
  }
];

const sampleCompanies = [
  {
    name: 'Global Food Distributors Inc.',
    type: 'distributor',
    industry: 'packaged_foods',
    address: {
      street: '123 Commerce St',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      postalCode: '10001'
    },
    contact: {
      email: 'contact@globalfood.com',
      phone: '+1-555-0123',
      website: 'https://globalfood.com'
    },
    businessInfo: {
      registrationNumber: 'REG123456',
      taxId: 'TAX789012',
      yearEstablished: 2010,
      employeeCount: '51-200',
      annualRevenue: '10M-50M'
    },
    verification: {
      status: 'verified',
      verifiedAt: new Date()
    }
  },
  {
    name: 'Fresh Valley Farms',
    type: 'supplier',
    industry: 'produce',
    address: {
      street: '456 Farm Road',
      city: 'Fresno',
      state: 'CA',
      country: 'USA',
      postalCode: '93701'
    },
    contact: {
      email: 'sales@freshvalley.com',
      phone: '+1-555-0456'
    },
    businessInfo: {
      registrationNumber: 'REG654321',
      taxId: 'TAX210987',
      yearEstablished: 1995,
      employeeCount: '11-50',
      annualRevenue: '1M-10M'
    },
    verification: {
      status: 'verified',
      verifiedAt: new Date()
    }
  }
];

const sampleUsers = [
  {
    email: 'admin@foodxchange.com',
    password: 'admin123',
    role: 'admin',
    profile: {
      firstName: 'Admin',
      lastName: 'User',
      phone: '+1-555-0100'
    },
    verification: {
      email: true,
      phone: true,
      company: true
    }
  },
  {
    email: 'buyer@foodxchange.com',
    password: 'buyer123',
    role: 'buyer',
    profile: {
      firstName: 'John',
      lastName: 'Buyer',
      phone: '+1-555-0200'
    },
    verification: {
      email: true,
      phone: true,
      company: true
    }
  },
  {
    email: 'seller@foodxchange.com',
    password: 'seller123',
    role: 'seller',
    profile: {
      firstName: 'Jane',
      lastName: 'Seller',
      phone: '+1-555-0300'
    },
    verification: {
      email: true,
      phone: true,
      company: true
    }
  },
  {
    email: 'agent@foodxchange.com',
    password: 'agent123',
    role: 'agent',
    profile: {
      firstName: 'Mike',
      lastName: 'Agent',
      phone: '+1-555-0400'
    },
    verification: {
      email: true,
      phone: true,
      company: false
    }
  },
  {
    email: 'contractor@foodxchange.com',
    password: 'contractor123',
    role: 'contractor',
    profile: {
      firstName: 'Sarah',
      lastName: 'Contractor',
      phone: '+1-555-0500'
    },
    verification: {
      email: true,
      phone: true,
      company: false
    }
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    
    await connectDB();
    
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Company.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      RFQ.deleteMany({}),
      Order.deleteMany({}),
      Review.deleteMany({}),
      Conversation.deleteMany({}),
      Message.deleteMany({}),
      AnalyticsEvent.deleteMany({}),
      Notification.deleteMany({})
    ]);
    
    // Seed categories
    console.log('📂 Seeding categories...');
    const categories = await Category.insertMany(sampleCategories);
    console.log(`✅ Created ${categories.length} categories`);
    
    // Seed companies
    console.log('🏢 Seeding companies...');
    const companies = await Company.insertMany(sampleCompanies);
    console.log(`✅ Created ${companies.length} companies`);
    
    // Seed users and associate with companies
    console.log('👥 Seeding users...');
    const users = [];
    for (let i = 0; i < sampleUsers.length; i++) {
      const userData = sampleUsers[i];
      
      // Associate buyers with distributor company, sellers with supplier company
      if (userData.role === 'buyer' && companies[0]) {
        userData.company = companies[0]._id;
      } else if (userData.role === 'seller' && companies[1]) {
        userData.company = companies[1]._id;
      }
      
      const user = new User(userData);
      await user.save();
      users.push(user);
    }
    console.log(`✅ Created ${users.length} users`);
    
    // Create sample products
    if (categories.length > 0 && companies.length > 1) {
      console.log('📦 Seeding products...');
      const sampleProducts = [
        {
          name: 'Organic Apple Juice',
          description: 'Premium organic apple juice from fresh valley apples',
          category: categories[0]._id, // Beverages
          supplier: companies[1]._id, // Fresh Valley Farms
          specifications: {
            brand: 'Fresh Valley',
            sku: 'FV-AJ-001',
            weight: { value: 1, unit: 'liters' },
            packaging: {
              type: 'Bottle',
              unitsPerCase: 12,
              caseWeight: 12
            }
          },
          pricing: {
            basePrice: 4.99,
            currency: 'USD',
            minimumOrder: { quantity: 100, unit: 'cases' }
          },
          availability: {
            inStock: true,
            stockQuantity: 500,
            leadTime: { min: 3, max: 7, unit: 'days' }
          },
          dietaryAttributes: ['organic', 'vegan', 'gluten-free'],
          isActive: true,
          isFeatured: true
        }
      ];
      
      const products = await Product.insertMany(sampleProducts);
      console.log(`✅ Created ${products.length} products`);
    }
    
    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('🔑 Default login credentials:');
    console.log('Admin: admin@foodxchange.com / admin123');
    console.log('Buyer: buyer@foodxchange.com / buyer123');
    console.log('Seller: seller@foodxchange.com / seller123');
    console.log('Agent: agent@foodxchange.com / agent123');
    console.log('Contractor: contractor@foodxchange.com / contractor123');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
}

// Run seeder if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
