const Seller = require('../models/seller/Seller');
const Product = require('../models/seller/Product');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

// Configure file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/seller/';
    if (file.fieldname === 'certificationDocs') {
      uploadPath = 'uploads/certifications/';
    } else if (file.fieldname === 'productImages') {
      uploadPath = 'uploads/products/';
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

class SellerController {
  // Register new seller
  async register(req, res) {
    try {
      const {
        companyName, supplierCode, vatNumber, companyWebsite, companyEmail,
        companyPhone, address, country, closestSeaPort, distanceToSeaport,
        productCategories, companyDescription, incoterms, paymentTerms,
        contactName, contactJobTitle, contactEmail, contactMobile,
        kosherCertification, organicCertification, isoCertification,
        otherCertifications, password
      } = req.body;

      // Check if seller already exists
      const existingSeller = await Seller.findOne({
        $or: [{ email: contactEmail }, { companyEmail }]
      });

      if (existingSeller) {
        return res.status(400).json({
          success: false,
          message: 'A seller with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate unique auto number
      const lastSeller = await Seller.findOne().sort({ autoNumber: -1 });
      const nextNumber = lastSeller 
        ? (parseInt(lastSeller.autoNumber) + 1).toString().padStart(6, '0')
        : '100001';

      // Parse categories if sent as JSON string
      const categories = typeof productCategories === 'string' 
        ? JSON.parse(productCategories) 
        : productCategories;

      // Create new seller
      const newSeller = new Seller({
        supplierName: companyName,
        companyName,
        supplierCode,
        autoNumber: nextNumber,
        email: contactEmail,
        password: hashedPassword,
        companyEmail,
        companyWebsite,
        phone: companyPhone,
        vatNumber,
        address,
        country,
        closestSeaPort,
        distanceToSeaport,
        categories,
        description: companyDescription,
        incoterms,
        paymentTerms,
        certifications: {
          kosher: kosherCertification === 'true',
          organic: organicCertification === 'true',
          iso: isoCertification === 'true',
          other: otherCertifications ? otherCertifications.split(',').map(c => c.trim()) : []
        },
        primaryContact: {
          name: contactName,
          jobTitle: contactJobTitle,
          email: contactEmail,
          mobile: contactMobile
        }
      });

      // Handle file uploads
      if (req.files) {
        if (req.files.companyLogo) {
          newSeller.companyLogo = req.files.companyLogo[0].path;
        }
        if (req.files.profileImages) {
          newSeller.profileImages = req.files.profileImages.map(file => file.path);
        }
        if (req.files.certificationDocs) {
          newSeller.certificationDocs = req.files.certificationDocs.map(file => ({
            type: 'general',
            url: file.path,
            uploadedAt: new Date()
          }));
        }
      }

      await newSeller.save();

      // Send verification email (implement email service)
      // await emailService.sendVerificationEmail(newSeller);

      res.status(201).json({
        success: true,
        message: 'Registration successful! Your account is pending verification.',
        sellerId: newSeller._id
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }

  // Login
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find seller
      const seller = await Seller.findOne({ 
        $or: [{ email }, { companyEmail: email }] 
      });

      if (!seller) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, seller.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is active
      if (!seller.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending verification'
        });
      }

      // Update last login
      seller.lastLoginAt = new Date();
      await seller.save();

      // Generate JWT token
      const token = jwt.sign(
        { 
          sellerId: seller._id, 
          email: seller.email,
          companyName: seller.companyName 
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        seller: {
          id: seller._id,
          companyName: seller.companyName,
          email: seller.email,
          country: seller.country,
          isVerified: seller.isVerified,
          profileCompletion: seller.getProfileCompletion()
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }

  // Get seller dashboard data
  async getDashboard(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      
      const seller = await Seller.findById(sellerId)
        .populate('products', 'productName status')
        .populate('proposals', 'status createdAt')
        .populate('orders', 'status totalAmount');

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }

      // Get recent RFQs relevant to seller's categories
      const recentRFQs = await RFQ.find({
        categories: { $in: seller.categories },
        status: { $in: ['active', 'new'] }
      })
      .populate('buyer', 'companyName country')
      .sort({ createdAt: -1 })
      .limit(5);

      // Get recent orders
      const recentOrders = await Order.find({ 
        supplier: sellerId 
      })
      .populate('buyer', 'companyName')
      .populate('items.product', 'productName')
      .sort({ createdAt: -1 })
      .limit(5);

      // Get notifications
      const notifications = await Notification.find({
        recipient: sellerId,
        read: false
      })
      .sort({ createdAt: -1 })
      .limit(10);

      // Calculate stats
      const stats = {
        totalProducts: seller.products.length,
        activeRFQs: recentRFQs.length,
        pendingProposals: seller.proposals.filter(p => p.status === 'pending').length,
        activeOrders: seller.orders.filter(o => o.status === 'active').length,
        monthlyRevenue: seller.orders
          .filter(o => {
            const orderDate = new Date(o.createdAt);
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return orderDate > monthAgo;
          })
          .reduce((sum, order) => sum + order.totalAmount, 0),
        totalBuyers: [...new Set(seller.orders.map(o => o.buyer?.toString()))].length
      };

      res.json({
        company: {
          name: seller.companyName,
          country: seller.country,
          isVerified: seller.isVerified,
          profileCompletion: seller.getProfileCompletion()
        },
        stats,
        recentRFQs: recentRFQs.map(rfq => ({
          id: rfq._id,
          title: rfq.title,
          buyer: rfq.buyer?.companyName,
          buyerCountry: rfq.buyer?.country,
          status: rfq.status,
          productCount: rfq.products.length,
          createdAt: rfq.createdAt
        })),
        recentOrders: recentOrders.map(order => ({
          id: order._id,
          orderNumber: order.orderNumber,
          buyer: order.buyer?.companyName,
          status: order.status,
          totalAmount: order.totalAmount,
          items: order.items.map(item => ({
            productName: item.product?.productName,
            quantity: item.quantity
          })),
          deliveryDate: order.deliveryDate,
          createdAt: order.createdAt
        })),
        notifications: notifications.map(notif => ({
          id: notif._id,
          type: notif.type,
          message: notif.message,
          timeAgo: getTimeAgo(notif.createdAt)
        })),
        performanceData: [] // Add chart data here
      });

    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to load dashboard',
        error: error.message
      });
    }
  }

  // Get seller profile
  async getProfile(req, res) {
    try {
      const seller = await Seller.findById(req.seller.sellerId)
        .select('-password')
        .populate('products', 'productName status');

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }

      res.json({
        success: true,
        seller
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get profile',
        error: error.message
      });
    }
  }

  // Update seller profile
  async updateProfile(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      const updates = req.body;

      // Remove sensitive fields
      delete updates.password;
      delete updates.email;
      delete updates._id;

      const seller = await Seller.findByIdAndUpdate(
        sellerId,
        { 
          ...updates,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      ).select('-password');

      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }

      res.json({
        success: true,
        message: 'Profile updated successfully',
        seller
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: error.message
      });
    }
  }

  // Upload documents
  async uploadDocuments(req, res) {
    try {
      const sellerId = req.seller.sellerId;
      const { documentType } = req.body;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      const seller = await Seller.findById(sellerId);
      if (!seller) {
        return res.status(404).json({
          success: false,
          message: 'Seller not found'
        });
      }

      const uploadedDocs = req.files.map(file => ({
        type: documentType || 'general',
        url: file.path,
        uploadedAt: new Date()
      }));

      seller.certificationDocs.push(...uploadedDocs);
      await seller.save();

      res.json({
        success: true,
        message: 'Documents uploaded successfully',
        documents: uploadedDocs
      });

    } catch (error) {
      console.error('Upload documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload documents',
        error: error.message
      });
    }
  }
}

// Helper function for time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  
  return Math.floor(seconds) + " seconds ago";
}

module.exports = new SellerController();
