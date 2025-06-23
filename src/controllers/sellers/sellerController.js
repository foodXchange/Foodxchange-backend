const Seller = require('../models/sellers/Seller');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// @desc    Register new seller
// @route   POST /api/sellers/register
// @access  Public
const registerSeller = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    companyName,
    contactName,
    phone,
    country,
    productCategories,
    description
  } = req.body;

  // Check if seller already exists
  const sellerExists = await Seller.findOne({ email });
  if (sellerExists) {
    res.status(400);
    throw new Error('Seller already exists with this email');
  }

  // Create user account
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    email,
    password: hashedPassword,
    name: contactName,
    role: 'seller'
  });

  // Create seller profile
  const seller = await Seller.create({
    user: user._id,
    companyName,
    contactName,
    email,
    phone,
    country,
    productCategories,
    description
  });

  // Generate token
  const token = jwt.sign(
    { id: user._id, role: 'seller' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.status(201).json({
    success: true,
    token,
    seller: {
      id: seller._id,
      companyName: seller.companyName,
      email: seller.email,
      status: seller.status
    }
  });
});

// @desc    Get seller dashboard data
// @route   GET /api/sellers/dashboard
// @access  Private (Seller)
const getDashboard = asyncHandler(async (req, res) => {
  const sellerId = req.user.sellerId;

  // Get seller data
  const seller = await Seller.findById(sellerId);
  if (!seller) {
    res.status(404);
    throw new Error('Seller not found');
  }

  // Get stats (placeholder data for now)
  const stats = {
    rfqsReceived: 12,
    offersSubmitted: 8,
    samplesRequested: 3,
    shipmentsInProgress: 2,
    totalRevenue: seller.metrics.totalRevenue,
    completedOrders: seller.metrics.completedOrders,
    rating: seller.rating.average
  };

  // Get recent RFQs (placeholder)
  const recentRFQs = [
    {
      id: '1829',
      product: 'Green apples',
      buyer: 'GreenMart',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending'
    }
  ];

  // Get recent activity
  const recentActivity = [
    {
      type: 'offer_submitted',
      description: 'Offer submitted to GreenMart',
      timestamp: new Date(Date.now() - 60 * 60 * 1000)
    }
  ];

  res.json({
    success: true,
    data: {
      seller: {
        companyName: seller.companyName,
        status: seller.status,
        rating: seller.rating
      },
      stats,
      recentRFQs,
      recentActivity
    }
  });
});

// @desc    Update seller profile
// @route   PUT /api/sellers/profile
// @access  Private (Seller)
const updateProfile = asyncHandler(async (req, res) => {
  const sellerId = req.user.sellerId;

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    res.status(404);
    throw new Error('Seller not found');
  }

  // Update allowed fields
  const updates = {
    companyName: req.body.companyName || seller.companyName,
    contactName: req.body.contactName || seller.contactName,
    phone: req.body.phone || seller.phone,
    address: req.body.address || seller.address,
    description: req.body.description || seller.description,
    productCategories: req.body.productCategories || seller.productCategories,
    certifications: req.body.certifications || seller.certifications,
    preferences: req.body.preferences || seller.preferences
  };

  const updatedSeller = await Seller.findByIdAndUpdate(
    sellerId,
    updates,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: updatedSeller
  });
});

// @desc    Get seller products
// @route   GET /api/sellers/products
// @access  Private (Seller)
const getSellerProducts = asyncHandler(async (req, res) => {
  const sellerId = req.user.sellerId;

  // TODO: Implement product fetching logic
  const products = [];

  res.json({
    success: true,
    count: products.length,
    data: products
  });
});

// @desc    Get seller orders
// @route   GET /api/sellers/orders
// @access  Private (Seller)
const getSellerOrders = asyncHandler(async (req, res) => {
  const sellerId = req.user.sellerId;

  // TODO: Implement order fetching logic
  const orders = [];

  res.json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get seller analytics
// @route   GET /api/sellers/analytics
// @access  Private (Seller)
const getAnalytics = asyncHandler(async (req, res) => {
  const sellerId = req.user.sellerId;
  const { startDate, endDate } = req.query;

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    res.status(404);
    throw new Error('Seller not found');
  }

  // TODO: Implement real analytics
  const analytics = {
    overview: {
      totalOffers: 128,
      sampleRequests: 42,
      offersShortlisted: 37,
      dealsCloses: 18,
      avgResponseTime: '1.3 Days',
      buyerEngagement: '87%'
    },
    chartData: {
      offersVsSamples: [
        { week: 'Apr 7', offers: 12, samples: 8 },
        { week: 'Apr 12', offers: 25, samples: 18 },
        { week: 'May 3', offers: 22, samples: 15 },
        { week: 'Apr 20', offers: 23, samples: 16 },
        { week: 'May 18', offers: 26, samples: 20 }
      ],
      responseTimeTrend: [
        { date: 'Apr 19', time: 1.7 },
        { date: 'Mar 12', time: 1.3 },
        { date: 'May 19', time: 1.1 },
        { date: 'May 13', time: 0.9 }
      ]
    },
    topProducts: [
      { name: 'Organic Chickpeas', deals: 9, revenue: 45000 },
      { name: 'Extra Virgin Olive Oil', deals: 7, revenue: 38000 },
      { name: 'Green Tea', deals: 2, revenue: 12000 }
    ],
    buyerEngagement: [
      { buyer: 'FoodMart EU', offers: 29, closed: 8, score: 92 },
      { buyer: 'AgroFresh Ltd', offers: 15, closed: 3, score: 84 }
    ]
  };

  res.json({
    success: true,
    data: analytics
  });
});

module.exports = {
  registerSeller,
  getDashboard,
  updateProfile,
  getSellerProducts,
  getSellerOrders,
  getAnalytics
};
