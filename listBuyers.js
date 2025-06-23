const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');

const Buyer = mongoose.model('Buyer', new mongoose.Schema({
  name: String,
  email: String,
  companyName: String
}));

async function listBuyers() {
  const buyers = await Buyer.find().limit(10);
  console.log('\nImported Buyers:');
  console.log('================');
  buyers.forEach(b => {
    console.log(`${b.name} - ${b.companyName} - ${b.email || 'No email'}`);
  });
  process.exit(0);
}

listBuyers();
