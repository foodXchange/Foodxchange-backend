const RFQ = require('../models/RFQ');
const User = require('../models/User');
const Product = require('../models/Product');

// Create new RFQ
exports.createRFQ = async (req, res) => {
  try {
    const rfqData = {
      ...req.body,
      buyer: req.user._id,
      buyerCompany: req.user.company
    };

    const rfq = new RFQ(rfqData);
    await rfq.save();

    // TODO: Match suppliers based on products and requirements
    // This is a simplified version - you'll want to implement proper matching logic
    const suppliers = await User.find({ 
      role: 'supplier',
      isActive: true 
    }).limit(10);
    
    rfq.matchedSuppliers = suppliers.map(s => s._id);
    await rfq.save();

    res.status(201).json(rfq);
  } catch (error) {
    console.error('Error creating RFQ:', error);
    res.status(500).json({ error: 'Failed to create RFQ' });
  }
};

// Get all RFQs for buyer
exports.getBuyerRFQs = async (req, res) => {
  try {
    const rfqs = await RFQ.find({ buyer: req.user._id })
      .populate('buyer', 'name email')
      .populate('buyerCompany', 'name')
      .sort({ createdAt: -1 });

    res.json(rfqs);
  } catch (error) {
    console.error('Error fetching RFQs:', error);
    res.status(500).json({ error: 'Failed to fetch RFQs' });
  }
};

// Get single RFQ
exports.getRFQById = async (req, res) => {
  try {
    const rfq = await RFQ.findById(req.params.id)
      .populate('buyer', 'name email')
      .populate('buyerCompany', 'name')
      .populate('matchedSuppliers', 'name email');

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    // Check if user has access
    if (rfq.buyer._id.toString() !== req.user._id.toString() && 
        !rfq.matchedSuppliers.some(s => s._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(rfq);
  } catch (error) {
    console.error('Error fetching RFQ:', error);
    res.status(500).json({ error: 'Failed to fetch RFQ' });
  }
};

// Update RFQ status
exports.updateRFQStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const rfq = await RFQ.findById(req.params.id);

    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }

    // Check if user owns the RFQ
    if (rfq.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    rfq.status = status;
    await rfq.save();

    res.json(rfq);
  } catch (error) {
    console.error('Error updating RFQ status:', error);
    res.status(500).json({ error: 'Failed to update RFQ status' });
  }
};

// Get RFQs for suppliers
exports.getSupplierRFQs = async (req, res) => {
  try {
    const rfqs = await RFQ.find({
      status: 'active',
      matchedSuppliers: req.user._id
    })
    .populate('buyer', 'name')
    .populate('buyerCompany', 'name')
    .sort({ createdAt: -1 });

    res.json(rfqs);
  } catch (error) {
    console.error('Error fetching supplier RFQs:', error);
    res.status(500).json({ error: 'Failed to fetch RFQs' });
  }
};
