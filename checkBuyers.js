const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');

// Use the schema from the import
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

async function listBuyers() {
  const buyers = await Buyer.find().limit(10);
  console.log('\nImported Buyers:');
  console.log('================');
  buyers.forEach(b => {
    console.log(`${b.name} - ${b.companyName} - ${b.email || 'No email'}`);
  });
  
  // Show one full buyer to see all fields
  if (buyers.length > 0) {
    console.log('\nSample buyer data:');
    console.log(JSON.stringify(buyers[0], null, 2));
  }
  
  process.exit(0);
}

listBuyers().catch(console.error);
