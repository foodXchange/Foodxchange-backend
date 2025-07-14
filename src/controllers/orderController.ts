const Order = require('../models/Order');
const Proposal = require('../models/Proposal');
const RFQ = require('../models/RFQ');

// Create order from accepted proposal
const createOrder = async (req, res) => {
  try {
    const { proposalId, orderDetails, shipping, payment, notes } = req.body;
    const userId = req.user._id;
    const user = req.user;
    
    // Get proposal and verify it's accepted
    const proposal = await Proposal.findById(proposalId)
      .populate('rfq')
      .populate('supplier');
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    if (proposal.status !== 'selected') {
      return res.status(400).json({ error: 'Only selected proposals can be converted to orders' });
    }
    
    // Verify the RFQ belongs to this buyer
    if (proposal.rfq.buyer.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Create order
    const order = new Order({
      rfq: proposal.rfq._id,
      proposal: proposalId,
      buyer: userId,
      buyerCompany: user.company,
      supplier: proposal.supplier._id,
      orderDetails: orderDetails || {
        products: [{
          productName: proposal.productDetails.productName,
          quantity: proposal.rfq.productInfo.quantity,
          unit: proposal.rfq.productInfo.quantityUnit,
          unitPrice: proposal.pricing.unitPrice,
          totalPrice: proposal.pricing.unitPrice * proposal.rfq.productInfo.quantity
        }],
        totalAmount: proposal.pricing.unitPrice * proposal.rfq.productInfo.quantity,
        currency: proposal.pricing.currency
      },
      shipping: shipping || {
        incoterm: proposal.terms.incoterm,
        method: proposal.terms.shippingMethod
      },
      payment: payment || {
        terms: proposal.terms.paymentTerms
      },
      notes
    });
    
    await order.save();
    
    // Update RFQ status
    await RFQ.findByIdAndUpdate(proposal.rfq._id, { status: 'finalized' });
    
    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all orders for buyer
const getBuyerOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, supplier, dateFrom, dateTo } = req.query;
    
    let query = { buyer: userId };
    
    if (status && status !== 'All') {
      query.status = status.toLowerCase().replace(' ', '_');
    }
    
    if (supplier && supplier !== 'All') {
      query.supplier = supplier;
    }
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    
    const orders = await Order.find(query)
      .populate('supplier', 'name')
      .populate('rfq', 'rfqId title')
      .populate('shipments')
      .sort('-createdAt');
    
    res.json(orders);
  } catch (error) {
    console.error('Get buyer orders error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get single order details
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const order = await Order.findOne({ 
      $or: [{ orderId: id }, { poNumber: id }],
      buyer: userId 
    })
      .populate('buyer', 'name email')
      .populate('buyerCompany')
      .populate('supplier')
      .populate('rfq')
      .populate('proposal')
      .populate('shipments');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Update order status
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user._id;
    
    const order = await Order.findOne({ 
      $or: [{ orderId: id }, { poNumber: id }],
      buyer: userId 
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.status = status;
    await order.save();
    
    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Upload order documents
const uploadOrderDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, url } = req.body;
    const userId = req.user._id;
    
    const order = await Order.findOne({ 
      $or: [{ orderId: id }, { poNumber: id }],
      buyer: userId 
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.documents.push({
      name,
      type,
      url,
      uploadedAt: new Date()
    });
    
    await order.save();
    
    res.json({
      message: 'Document uploaded successfully',
      order
    });
  } catch (error) {
    console.error('Upload order document error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get order statistics
const getOrderStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const stats = await Order.aggregate([
      { $match: { buyer: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$orderDetails.totalAmount' }
        }
      }
    ]);
    
    const monthlyStats = await Order.aggregate([
      { $match: { buyer: userId } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          totalValue: { $sum: '$orderDetails.totalAmount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);
    
    res.json({
      statusStats: stats,
      monthlyStats
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createOrder,
  getBuyerOrders,
  getOrderById,
  updateOrderStatus,
  uploadOrderDocument,
  getOrderStats
};
