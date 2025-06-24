const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/auth');
const Order = require('../models/Order');
const Company = require('../models/Company');
const RFQ = require('../models/RFQ');
const Proposal = require('../models/Proposal');

// @desc    Get orders (filtered by user role)
// @route   GET /api/orders
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const user = req.user;
  
  const company = await Company.findOne({ users: user._id });
  
  let query = {};
  
  // Filter based on company type
  if (company.type === 'buyer') {
    query.buyer = company._id;
  } else if (company.type === 'supplier') {
    query.supplier = company._id;
  } else if (company.type === 'both') {
    query.$or = [
      { buyer: company._id },
      { supplier: company._id }
    ];
  }
  
  if (status) query.status = status;
  
  const orders = await Order.find(query)
    .populate('buyer', 'name')
    .populate('supplier', 'name')
    .select('-documents')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });
    
  const count = await Order.countDocuments(query);
  
  res.json({
    orders,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    total: count
  });
}));

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('buyer', 'name email phone address')
    .populate('supplier', 'name email phone address')
    .populate('items.product', 'name images');
    
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  
  // Check access rights
  const company = await Company.findOne({ users: req.user._id });
  const isBuyer = order.buyer._id.toString() === company._id.toString();
  const isSupplier = order.supplier._id.toString() === company._id.toString();
  
  if (!isBuyer && !isSupplier && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }
  
  res.json(order);
}));

// @desc    Create order from proposal
// @route   POST /api/orders
// @access  Private/Buyer
router.post('/', protect, asyncHandler(async (req, res) => {
  const { proposalId, deliveryAddress, notes } = req.body;
  
  // Get proposal
  const proposal = await Proposal.findById(proposalId)
    .populate('rfq')
    .populate('supplier');
    
  if (!proposal || proposal.status !== 'accepted') {
    res.status(400);
    throw new Error('Invalid or unaccepted proposal');
  }
  
  // Verify user is the buyer
  const company = await Company.findOne({ users: req.user._id });
  if (proposal.rfq.buyer.toString() !== company._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to create order from this proposal');
  }
  
  // Create order
  const orderData = {
    buyer: company._id,
    supplier: proposal.supplier._id,
    rfq: proposal.rfq._id,
    proposal: proposal._id,
    items: proposal.products.map(p => ({
      product: p.product,
      name: p.alternativeProduct?.name || 'Product',
      quantity: p.quantity,
      unit: p.unit,
      unitPrice: p.unitPrice,
      totalPrice: p.totalPrice
    })),
    pricing: proposal.pricing,
    delivery: {
      address: deliveryAddress,
      scheduledDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    },
    status: 'confirmed',
    notes
  };
  
  const order = await Order.create(orderData);
  
  // Update RFQ status
  await RFQ.findByIdAndUpdate(proposal.rfq._id, { status: 'awarded' });
  
  res.status(201).json(order);
}));

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private
router.put('/:id/status', protect, asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  
  // Check authorization
  const company = await Company.findOne({ users: req.user._id });
  const isBuyer = order.buyer.toString() === company._id.toString();
  const isSupplier = order.supplier.toString() === company._id.toString();
  
  if (!isBuyer && !isSupplier && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized to update this order');
  }
  
  // Update status
  order.status = status;
  
  // Add to timeline
  order.timeline.push({
    status,
    date: Date.now(),
    notes,
    updatedBy: req.user._id
  });
  
  // Update delivery status if applicable
  if (status === 'shipped') {
    order.delivery.status = 'shipped';
  } else if (status === 'delivered') {
    order.delivery.status = 'delivered';
    order.delivery.actualDate = Date.now();
  }
  
  await order.save();
  
  res.json(order);
}));

module.exports = router;
