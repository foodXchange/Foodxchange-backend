// scripts/checkProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const connectDB = require('../src/config/db');

async function checkProducts() {
  try {
    await connectDB();
    const products = await Product.find({});
    console.log('Products found:', products.length);
    products.forEach(p => {
      console.log('-', p.name || p.title);
      console.log('  Category:', p.category);
      console.log('  Status:', p.status);
      console.log('  Created:', p.createdAt);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkProducts();
