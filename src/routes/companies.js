const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/auth');
const Company = require('../models/Company');
const User = require('../models/User');

// @desc    Get all companies
// @route   GET /api/companies
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { type, country, status, search, page = 1, limit = 20 } = req.query;
  
  const query = {};
  
  if (type) query.type = type;
  if (country) query['address.country'] = country;
  if (status) query.status = status;
  
  if (search) {
    query.$text = { $search: search };
  }
  
  const companies = await Company.find(query)
    .select('-documents')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });
    
  const count = await Company.countDocuments(query);
  
  res.json({
    companies,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    total: count
  });
}));

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id)
    .populate('users', 'name email role');
    
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  
  res.json(company);
}));

// @desc    Create company
// @route   POST /api/companies
// @access  Private/Admin
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  const company = await Company.create(req.body);
  res.status(201).json(company);
}));

// @desc    Update company
// @route   PUT /api/companies/:id
// @access  Private
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.params.id);
  
  if (!company) {
    res.status(404);
    throw new Error('Company not found');
  }
  
  // Check if user belongs to company or is admin
  const isCompanyUser = company.users.includes(req.user._id);
  if (!isCompanyUser && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to update this company');
  }
  
  const updatedCompany = await Company.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );
  
  res.json(updatedCompany);
}));

// @desc    Add user to company
// @route   POST /api/companies/:id/users
// @access  Private/Admin
router.post('/:id/users', protect, admin, asyncHandler(async (req, res) => {
  const { userId } = req.body;
  
  const company = await Company.findById(req.params.id);
  const user = await User.findById(userId);
  
  if (!company || !user) {
    res.status(404);
    throw new Error('Company or user not found');
  }
  
  if (!company.users.includes(userId)) {
    company.users.push(userId);
    await company.save();
  }
  
  res.json({ message: 'User added to company' });
}));

module.exports = router;
