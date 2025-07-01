const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const setupAdmin = async () => {
  try {
    console.log('Setting up FoodXchange Admin...');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB');

    const adminExists = await User.findOne({ email: 'admin@foodxchange.com' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        email: 'admin@foodxchange.com',
        password: hashedPassword,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        companyName: 'FoodXchange',
        isActive: true
      });
      console.log('Admin created: admin@foodxchange.com / admin123');
    }

    console.log('Setup completed!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
};

setupAdmin();
