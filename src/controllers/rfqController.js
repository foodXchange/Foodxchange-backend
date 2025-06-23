const RFQ = require('../models/RFQ');
const Proposal = require('../models/Proposal');
const Company = require('../models/Company');

// Create new RFQ
const createRFQ = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = req.user;
    
    // Ensure user is a buyer
    if (user.role !== 'buyer') {
      return res.status(403).json({ error: 'Only buyers can create RFQs' });
    }
    
    const rfqData = {
      ...req.body,
      buyer: userId,
      buyerCompany: user.company,
      status: req.body.status || 'draft'
    };
    
    const rfq = new RFQ(rfqData);
    await rfq.save();
    
    res.status(201).json({
      message: 'RFQ created successfully',
      rfq
    });
  } catch (error) {
    console.error('Create RFQ error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get all RFQs for buyer
const getBuyerRFQs = async (req, res) => {
  try {
    const { status, category, supplier, dateFrom, dateTo } = req.query;
    const userId = req.user._id;
    
    let query = { buyer: userId };
    
    if (status && status !== 'All') {
      query.status = status.toLowerCase().replace(' ', '_');
    }
    
    if (category && category !== 'All') {
      query['productInfo.category'] = category;
    }
    
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    
    const rfqs = await RFQ.find(query)
      .populate('buyerCompany', 'name')
      .populate('invitedSuppliers.supplier', 'name')
      .sort('-createdAt');
    
    // Get proposal counts for each RFQ
    const rfqsWithProposals = await Promise.all(rfqs.map(async (rfq) => {
      const proposalCount = await Proposal.countDocuments({ 
        rfq: rfq._id, 
        status: { $ne: 'draft' } 
      });
      
      return {
        ...rfq.toObject(),
        proposalCount
      };
    }));
    
    res.json(rfqsWithProposals);
  } catch (error) {
    console.error('Get buyer RFQs error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get single RFQ details
const getRFQById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const rfq = await RFQ.findOne({ rfqId: id, buyer: userId })
      .populate('buyer', 'name email')
      .populate('buyerCompany')
      .populate('invitedSuppliers.supplier');
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Get all proposals for this RFQ
    const proposals = await Proposal.find({ rfq: rfq._id })
      .populate('supplier', 'name country')
      .sort('-createdAt');
    
    res.json({
      rfq,
      proposals
    });
  } catch (error) {
    console.error('Get RFQ by ID error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Update RFQ
const updateRFQ = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updates = req.body;
    
    const rfq = await RFQ.findOne({ rfqId: id, buyer: userId });
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Prevent updates to finalized RFQs
    if (rfq.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot update finalized RFQ' });
    }
    
    Object.assign(rfq, updates);
    await rfq.save();
    
    res.json({
      message: 'RFQ updated successfully',
      rfq
    });
  } catch (error) {
    console.error('Update RFQ error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Invite suppliers to RFQ
const inviteSuppliers = async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierIds } = req.body;
    const userId = req.user._id;
    
    const rfq = await RFQ.findOne({ rfqId: id, buyer: userId });
    
    if (!rfq) {
      return res.status(404).json({ error: 'RFQ not found' });
    }
    
    // Add suppliers to invited list
    const newInvitations = supplierIds.map(supplierId => ({
      supplier: supplierId,
      invitedAt: new Date(),
      status: 'invited'
    }));
    
    rfq.invitedSuppliers.push(...newInvitations);
    rfq.status = 'active';
    await rfq.save();
    
    // TODO: Send invitation emails to suppliers
    
    res.json({
      message: 'Suppliers invited successfully',
      invitedCount: newInvitations.length
    });
  } catch (error) {
    console.error('Invite suppliers error:', error);
    res.status(400).json({ error: error.message });
  }
};

// Get RFQ statistics for dashboard
const getRFQStats = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const stats = await RFQ.aggregate([
      { $match: { buyer: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const proposalStats = await Proposal.aggregate([
      {
        $lookup: {
          from: 'rfqs',
          localField: 'rfq',
          foreignField: '_id',
          as: 'rfqData'
        }
      },
      { $unwind: '$rfqData' },
      { $match: { 'rfqData.buyer': userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      rfqStats: stats,
      proposalStats
    });
  } catch (error) {
    console.error('Get RFQ stats error:', error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createRFQ,
  getBuyerRFQs,
  getRFQById,
  updateRFQ,
  inviteSuppliers,
  getRFQStats
};
