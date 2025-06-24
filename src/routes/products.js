const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/auth');
const Product = require('../models/Product');
const Company = require('../models/Company');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
router.get('/', asyncHandler(async (req, res) => {
  const { category, search, supplier, page = 1, limit = 20 } = req.query;
  
  const query = { status: 'active' };
  
  if (category) query.category = category;
  if (supplier) query.supplier = supplier;
  
  if (search) {
    query.$text = { $search: search };
  }
  
  const products = await Product.find(query)
    .populate('supplier', 'name country')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });
    
  const count = await Product.countDocuments(query);
  
  res.json({
    products,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    total: count
  });
}));

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
router.get('/:id', asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('supplier', 'name email phone country certifications');
    
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Increment views
  product.views += 1;
  await product.save();
  
  res.json(product);
}));

// @desc    Create product
// @route   POST /api/products
// @access  Private/Seller
router.post('/', protect, asyncHandler(async (req, res) => {
  const user = req.user;
  
  // Get user's company
  const company = await Company.findOne({ users: user._id, type: { $in: ['supplier', 'both'] } });
  
  if (!company) {
    res.status(403);
    throw new Error('You must be associated with a supplier company to create products');
  }
  
  const productData = {
    ...req.body,
    supplier: company._id
  };
  
  const product = await Product.create(productData);
  res.status(201).json(product);
}));

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Seller
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Check ownership
  const company = await Company.findOne({ users: req.user._id });
  if (product.supplier.toString() !== company._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to update this product');
  }
  
  const updatedProduct = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  
  res.json(updatedProduct);
}));

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Seller/Admin
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  
  // Check ownership
  const company = await Company.findOne({ users: req.user._id });
  if (product.supplier.toString() !== company._id.toString() && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to delete this product');
  }
  
  // Soft delete
  product.status = 'discontinued';
  await product.save();
  
  res.json({ message: 'Product removed' });
}));

module.exports = router;
