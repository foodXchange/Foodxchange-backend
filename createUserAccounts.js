const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Define User schema directly
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
});

const User = mongoose.model('User', userSchema);

// Get the imported buyers
const Buyer = mongoose.model('Buyer');

async function createUserAccounts() {
  try {
    console.log('Creating user accounts for buyers...');
    
    // Get first 5 buyers
    const buyers = await Buyer.find().limit(5);
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    for (const buyer of buyers) {
      const email = buyer.email || `${buyer.name.toLowerCase().replace(/\s+/g, '.')}@foodxchange.com`;
      
      await User.findOneAndUpdate(
        { email },
        {
          name: buyer.name,
          email,
          password: hashedPassword,
          role: 'buyer'
        },
        { upsert: true }
      );
      
      console.log(`Created account for ${buyer.name}: ${email}`);
    }
    
    console.log('\nLogin credentials:');
    console.log('==================');
    const users = await User.find({ role: 'buyer' });
    users.forEach(user => {
      console.log(`${user.email} / password123`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createUserAccounts();
