// scripts/indexProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const searchService = require('../src/services/enhancedSearchService');
const connectDB = require('../src/config/db');

async function indexAllProducts() {
  try {
    await connectDB();
    console.log('Starting product indexing...');
    
    const products = await Product.find({ status: 'active' });
    console.log('Found', products.length, 'products to index');
    
    for (const product of products) {
      const searchDoc = {
        projectId: product._id.toString(),
        title: product.name || product.title,
        description: product.description,
        category: product.category,
        subcategory: product.subcategory,
        tags: product.tags || [],
        status: product.status,
        visibility: product.visibility,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      };
      
      try {
        await searchService.indexProduct(searchDoc);
        console.log('Indexed:', product.name || product.title);
      } catch (error) {
        console.log('Failed to index:', product.name, error.message);
      }
    }
    
    console.log('Indexing complete!');
    
  } catch (error) {
    console.error('Indexing failed:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

indexAllProducts();
