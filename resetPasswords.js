// resetPasswords.js - Complete password reset
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config();

const resetAllPasswords = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB\n');

    // Direct database update to ensure passwords are reset
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('test123', salt);
    
    // Update all test users
    const testEmails = ['admin@foodxchange.com', 'buyer@foodxchange.com', 'seller@foodxchange.com'];
    
    for (const email of testEmails) {
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { password: hashedPassword } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Password reset for: ${email}`);
      } else if (result.matchedCount > 0) {
        console.log(`⚠️  Password already correct for: ${email}`);
      } else {
        console.log(`❌ User not found: ${email}`);
      }
    }
    
    // Verify the passwords
    console.log('\nVerifying passwords...');
    const users = await usersCollection.find({ email: { $in: testEmails } }).toArray();
    
    for (const user of users) {
      const isValid = await bcrypt.compare('test123', user.password);
      console.log(`${user.email}: ${isValid ? '✅ Password works' : '❌ Password failed'}`);
    }
    
    console.log('\n✅ Password reset complete!');
    console.log('\nTest with these credentials:');
    console.log('admin@foodxchange.com / test123');
    console.log('buyer@foodxchange.com / test123');
    console.log('seller@foodxchange.com / test123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

resetAllPasswords();
