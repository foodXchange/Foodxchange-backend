const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const Product = require('../models/Product');

// Get all products
router.get('/', protect, async (req, res) => {
  try {
    const { category, supplier, search, limit = 50, page = 1 } = req.query;
    
    // Build query
    let query = {};
    
    if (category && category !== 'All') {
      query.category = category;
    }
    
    if (supplier && supplier !== 'All') {
      query.supplier = supplier;
    }
    
    if (search) {
      query.$text = { $search: search };
    }
    
    // Pagination
    const skip = (page - 1) * limit;
    
    const products = await Product.find(query)
      .populate('supplier', 'name country')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });
    
    const total = await Product.countDocuments(query);
    
    res.json({
      products,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('supplier', 'name country email phone');
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (supplier only)
router.post('/', protect, authorize('supplier'), async (req, res) => {
  try {
    const productData = {
      ...req.body,
      supplier: req.user.company
    };
    
    const product = new Product(productData);
    await product.save();
    
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (supplier only)
router.put('/:id', protect, authorize('supplier'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check ownership
    if (product.supplier.toString() !== req.user.company.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && key !== 'supplier') {
        product[key] = req.body[key];
      }
    });
    
    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

module.exports = router;
