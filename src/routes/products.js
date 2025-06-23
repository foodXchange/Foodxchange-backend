const router = require('express').Router();
const mongoose = require('mongoose');

// Product schema
const productSchema = new mongoose.Schema({
  productId: String,
  name: String,
  category: String,
  description: String,
  supplier: String,
  origin: String,
  packaging: String,
  unitPrice: Number,
  minOrderQty: String,
  availability: String,
  certifications: {
    kosher: Boolean,
    organic: Boolean,
    halal: Boolean,
    nonGMO: Boolean
  }
});

const Product = mongoose.model('Product', productSchema);

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
