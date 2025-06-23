// scripts/fixSearchService.js
// This script will help identify and fix the search issue

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Product = require('../src/models/Product');

async function analyzeSearchIssue() {
  try {
    await connectDB();
    console.log('🔍 Analyzing search issue...\n');
    
    // 1. Get a sample product from MongoDB
    const sampleProduct = await Product.findOne({ status: 'active' });
    if (!sampleProduct) {
      console.log('❌ No active products found in MongoDB!');
      return;
    }
    
    console.log('📦 Sample product from MongoDB:');
    console.log({
      id: sampleProduct._id,
      name: sampleProduct.name,
      title: sampleProduct.title,
      category: sampleProduct.category,
      tags: sampleProduct.tags,
      status: sampleProduct.status
    });
    
    // 2. Check what fields are being indexed
    console.log('\n🔍 Fields that should be searchable:');
    console.log('- name:', sampleProduct.name || 'NOT SET');
    console.log('- title:', sampleProduct.title || 'NOT SET');
    console.log('- description:', sampleProduct.description ? 'SET' : 'NOT SET');
    console.log('- category:', sampleProduct.category || 'NOT SET');
    console.log('- tags:', sampleProduct.tags || 'NOT SET');
    
    // 3. Show how to properly structure the search
    console.log('\n✅ Recommended search query structure:');
    console.log(`
// In your search service, make sure you're searching the right fields:
const searchBody = {
  query: {
    bool: {
      should: [
        { match: { name: searchQuery } },
        { match: { title: searchQuery } },
        { match: { description: searchQuery } },
        { match: { tags: searchQuery } }
      ],
      filter: [
        { term: { status: 'active' } }
      ]
    }
  }
};
    `);
    
    // 4. Check Redis cache
    console.log('\n📦 To fix immediately:');
    console.log('1. Clear Redis cache: node scripts/clearCache.js');
    console.log('2. Reindex products: node scripts/reindexProducts.js');
    console.log('3. Restart server: node server-stable.js');
    console.log('4. Test search: curl "http://localhost:5000/api/v1/search?query=rice"');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

analyzeSearchIssue();