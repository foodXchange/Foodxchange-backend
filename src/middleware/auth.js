const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Seller = require('../models/sellers/Seller');

// Protect routes
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401);
        throw new Error('Not authorized');
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Not authorized');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});

// Seller only middleware
const sellerOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === 'seller') {
    // Get seller profile
    const seller = await Seller.findOne({ user: req.user._id });
    if (!seller) {
      res.status(403);
      throw new Error('Seller profile not found');
    }
    
    // Check if seller is approved
    if (seller.status !== 'approved' && seller.status !== 'pending') {
      res.status(403);
      throw new Error('Seller account is not active');
    }
    
    req.user.sellerId = seller._id;
    next();
  } else {
    res.status(403);
    throw new Error('Access restricted to sellers only');
  }
});

module.exports = { protect, sellerOnly };
