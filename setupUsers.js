const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import the User model
const User = require('./src/models/User');

async function createUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB successfully!');
    
    const password = 'Admin123!';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Users to create
    const users = [
      {
        email: 'admin@fdx.trading',
        firstName: 'System',
        lastName: 'Admin',
        role: 'admin'
      },
      {
        email: 'buyer@fdx.trading',
        firstName: 'Test',
        lastName: 'Buyer',
        role: 'buyer'
      },
      {
        email: 'supplier@fdx.trading',
        firstName: 'Test',
        lastName: 'Supplier',
        role: 'supplier'
      },
      {
        email: 'test@fdx.trading',
        firstName: 'Test',
        lastName: 'User',
        role: 'buyer'
      }
    ];
    
    console.log('\nCreating users...');
    
    for (const userData of users) {
      try {
        // Delete existing user if exists
        await User.deleteOne({ email: userData.email });
        
        // Create new user
        const user = new User({
          ...userData,
          password: hashedPassword,
          isActive: true,
          isEmailVerified: true
        });
        
        await user.save();
        console.log(`✅ Created: ${userData.email} (${userData.role})`);
      } catch (error) {
        console.error(`❌ Failed to create ${userData.email}:`, error.message);
      }
    }
    
    // Verify users were created
    console.log('\n📋 All users in database:');
    const allUsers = await User.find({}, 'email role isActive');
    allUsers.forEach(u => {
      console.log(`   - ${u.email} | Role: ${u.role} | Active: ${u.isActive}`);
    });
    
    console.log('\n✅ Setup complete! You can now login with:');
    console.log('   Email: admin@fdx.trading');
    console.log('   Password: Admin123!');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createUsers();
