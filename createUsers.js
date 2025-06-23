const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Define User schema inline for simplicity
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Create admin user
    const adminEmail = 'admin@fdx.trading';
    const password = 'Admin123!';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Delete existing users
    await User.deleteMany({ email: { $in: [adminEmail, 'test@fdx.trading'] } });
    
    // Create admin
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
    console.log('✅ Admin created: admin@fdx.trading / Admin123!');
    
    // Create test buyer
    const testBuyer = new User({
      email: 'test@fdx.trading',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'Buyer',
      role: 'buyer',
      isActive: true,
      isEmailVerified: true
    });
    await testBuyer.save();
    console.log('✅ Test buyer created: test@fdx.trading / Admin123!');
    
    // List all users
    const allUsers = await User.find({}, 'email role');
    console.log('\nAll users in database:');
    allUsers.forEach(u => console.log(`- ${u.email} (${u.role})`));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createUsers();
