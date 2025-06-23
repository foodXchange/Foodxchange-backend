const router = require('express').Router();
const { auth, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Company = require('../models/Company');
const Product = require('../models/Product');

// Admin overview - get system statistics
router.get('/overview', auth, authorize('admin'), async (req, res) => {
  try {
    // Get counts
    const totalUsers = await User.countDocuments();
    const totalCompanies = await Company.countDocuments();
    const totalProducts = await Product.countDocuments();
    
    // Get counts by type
    const usersByRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    const companiesByType = await Company.aggregate([
      { $group: { _id: '$companyType', count: { $sum: 1 } } }
    ]);
    
    // Get recent users
    const recentUsers = await User.find()
      .populate('company')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get recent companies
    const recentCompanies = await Company.find()
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json({
      overview: {
        totalUsers,
        totalCompanies,
        totalProducts,
        usersByRole: usersByRole.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
        companiesByType: companiesByType.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      },
      recentUsers,
      recentCompanies
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users with pagination
router.get('/users', auth, authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const users = await User.find()
      .populate('company')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await User.countDocuments();
    
    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all companies with pagination
router.get('/companies', auth, authorize('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const companies = await Company.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Company.countDocuments();
    
    res.json({
      companies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
