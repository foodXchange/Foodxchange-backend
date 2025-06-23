// scripts/reindexProducts.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const { esClient } = require('../src/config/elasticsearch');
const connectDB = require('../src/config/db');

async function reindexProducts() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    // Get all products
    const products = await Product.find({ status: 'active' });
    console.log(`Found ${products.length} products to reindex`);

    // Delete existing index
    try {
      await esClient.indices.delete({ index: 'foodxchange_products' });
      console.log('Deleted old index');
    } catch (e) {
      console.log('No existing index to delete');
    }

    // Create new index with proper mapping
    await esClient.indices.create({
      index: 'foodxchange_products',
      body: {
        mappings: {
          properties: {
            title: { type: 'text' },
            description: { type: 'text' },
            category: { type: 'keyword' },
            subcategory: { type: 'keyword' },
            tags: { type: 'text' },
            status: { type: 'keyword' }
          }
        }
      }
    });
    console.log('Created new index');

    // Index each product
    for (const product of products) {
      const doc = {
        projectId: product._id.toString(),
        title: product.name || product.title,
        description: product.description,
        category: product.category,
        subcategory: product.subcategory,
        tags: product.tags ? product.tags.join(' ') : '',
        status: product.status
      };

      await esClient.index({
        index: 'foodxchange_products',
        id: product._id.toString(),
        body: doc
      });

      console.log(`Reindexed: ${doc.title}`);
    }

    // Refresh index
    await esClient.indices.refresh({ index: 'foodxchange_products' });
    console.log('✅ Reindexing complete!');

  } catch (error) {
    console.error('Reindexing failed:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

reindexProducts();
